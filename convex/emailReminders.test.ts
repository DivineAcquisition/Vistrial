/**
 * @vitest-environment edge-runtime
 *
 * Email reminders: a check-in is reminded once and never after its outcome, who gets what by role and
 * preference, report-ready only for drafts and needs-review, a missing key skips cleanly, nothing crosses
 * workspaces, and no customer figures reach an email. Resend is a stub: no email leaves a test.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { checkInDueEmail, reportReadyEmail } from "./lib/reminderEmail";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;

const DAY = 24 * 60 * 60 * 1000;
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

type Sent = { to: string[]; from: string; subject: string; text: string; html: string; idempotencyKey: string; authorization: string };

/** Stands in for Resend. Records what would have been sent; `status` makes it refuse. */
function stubResend(status = 200) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string>; body: string }) => {
    if (url !== "https://api.resend.com/emails") throw new Error(`unexpected fetch ${url}`);
    const body = JSON.parse(init.body) as Omit<Sent, "idempotencyKey" | "authorization">;
    sent.push({ ...body, idempotencyKey: init.headers["Idempotency-Key"], authorization: init.headers.Authorization });
    return new Response(status === 200 ? '{"id":"email_1"}' : "no", { status });
  });
  return sent;
}

/** An agency workspace with an owner, a admin, a viewer and a removed admin, and a second workspace beside it. */
async function seed(t: Tester) {
  return t.run(async (ctx) => {
    const workspace = async (name: string, slug: string, people: { userId: string; role: "owner" | "admin" | "viewer"; removed?: boolean; noEmail?: boolean }[]) => {
      const workspaceId = await ctx.db.insert("workspaces", { name, slug, timezone: "UTC", status: "active", createdAt: 0 });
      for (const row of people) {
        await ctx.db.insert("members", {
          workspaceId,
          userId: row.userId,
          role: row.role,
          displayName: row.userId,
          active: !row.removed,
          ...(row.noEmail ? {} : { email: `${row.userId}@example.com` }),
          ...(row.removed ? { removedAt: 5 } : {}),
        });
      }
      const projectId = await ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Retainer pricing",
        objective: "What do agencies charge?",
        market: "Marketing agencies",
        geography: "US",
        competitors: [],
        platforms: ["web"],
        suppliedUrls: [],
        status: "draft",
        createdBy: people[0].userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const runId = await ctx.db.insert("agentRuns", {
        workspaceId,
        agentSlug: "growth-architect",
        skillSlug: "market-intelligence",
        status: "completed",
        startedBy: people[0].userId,
        inputRef: projectId,
        startedAt: 1,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
      return { workspaceId, projectId, runId };
    };
    const a = await workspace("Northside Agency", "northside", [
      { userId: "user_owner", role: "owner" },
      { userId: "user_admin", role: "admin" },
      { userId: "user_viewer", role: "viewer" },
      { userId: "user_gone", role: "admin", removed: true },
      { userId: "user_silent", role: "admin", noEmail: true },
    ]);
    const b = await workspace("Harbor Studio", "harbor", [{ userId: "user_other", role: "owner" }]);
    return { a, b };
  });
}

type Space = { workspaceId: Id<"workspaces">; projectId: Id<"researchProjects">; runId: Id<"agentRuns"> };

function decide(t: Tester, space: Space, action: string, checkInAt: number) {
  return t.run((ctx) =>
    ctx.db.insert("decisions", {
      workspaceId: space.workspaceId,
      projectId: space.projectId,
      runId: space.runId,
      opportunityIndex: 0,
      opportunity: "Agencies underprice retainers",
      proposedAction: action,
      validationMethod: "Watch signed retainers",
      checkInAt,
      createdBy: "user_owner",
      createdAt: 1,
      baseline: [{ source: "upload", label: "HubSpot deals", currency: "USD", dateStart: null, dateStop: null, spend: 48213, conversions: 417, revenue: 96431, capturedAt: 1 }],
    }),
  );
}

type AssetKind = "marketReport" | "offerAnalysis" | "growthDiagnosis" | "adCopySet";
type AssetState = "draft" | "needsReview" | "approved";

function report(t: Tester, space: Space, input: { title: string; status: AssetState; kind?: AssetKind; byRun?: boolean }) {
  return t.run(async (ctx) => {
    const assetId = await ctx.db.insert("assets", {
      workspaceId: space.workspaceId,
      kind: input.kind ?? "marketReport",
      title: input.title,
      status: input.status,
      currentVersion: 1,
      ...(input.byRun === false ? {} : { createdByRun: space.runId }),
      createdAt: 2,
    });
    const versionId = await ctx.db.insert("assetVersions", {
      workspaceId: space.workspaceId,
      assetId,
      version: 1,
      body: "Agencies in the sample charge a median retainer of $4,875. Source excerpt: \"we raised prices 37% last year\".",
      createdBy: "agent",
    });
    return { assetId, versionId };
  });
}

function emailAudit(t: Tester, workspaceId: Id<"workspaces">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())
      .filter((row) => row.action.startsWith("email."))
      .map((row) => ({ action: row.action, subject: row.subject, count: row.count, actorType: row.actorType })),
  );
}

const recipientsOf = (sent: Sent[]) => sent.flatMap((row) => row.to).sort();

describe("email reminders", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("check-in due", () => {
    it("sends one email per person listing every due check-in, once, and marks each as reminded", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const first = await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - 2 * DAY);
      const second = await decide(t, a, "Offer a paid audit before every proposal", Date.now() - DAY);
      const later = await decide(t, a, "Drop the hourly plan", Date.now() + 10 * DAY);
      const sent = stubResend();

      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(recipientsOf(sent)).toEqual(["user_admin@example.com", "user_owner@example.com"]);
      for (const email of sent) {
        expect(email.to).toHaveLength(1);
        expect(email.from).toBe("Vistrial <forms@mail.vistrial.io>");
        expect(email.subject).toBe("2 check-ins due: Raise retainer to $3,000 for new clients and 1 more");
        expect(email.text).toContain("- Raise retainer to $3,000 for new clients (due ");
        expect(email.text).toContain("- Offer a paid audit before every proposal (due ");
        expect(email.text).not.toContain("Drop the hourly plan");
        expect(email.text).toContain("https://app.vistrial.io/app\n");
        expect(email.text).toContain("https://app.vistrial.io/app/settings?section=you");
        expect(email.text).toContain("You got this because you are an Owner or Admin of Northside Agency");
        expect(email.authorization).toBe("Bearer re_test_key");
      }
      // The idempotency key names the decision and the recipient, so a retry cannot double-send.
      expect(sent.map((row) => row.idempotencyKey).sort()).toEqual([`checkin-due/${first}/2/user_admin`, `checkin-due/${first}/2/user_owner`]);

      const rows = await t.run(async (ctx) => Promise.all([first, second, later].map((id) => ctx.db.get(id))));
      expect(rows[0]?.remindedAt).toBeTypeOf("number");
      expect(rows[1]?.remindedAt).toBeTypeOf("number");
      expect(rows[2]?.remindedAt).toBeUndefined();

      // The next hour, and the one after: nothing more.
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(sent).toHaveLength(2);

      // One audit row per check-in and recipient, with the user id and never the address.
      const audit = await emailAudit(t, a.workspaceId);
      expect(audit).toHaveLength(4);
      expect(audit).toContainEqual({ action: "email.checkin_due", subject: `${first}:user_owner`, count: 1, actorType: "system" });
      expect(audit).toContainEqual({ action: "email.checkin_due", subject: `${second}:user_admin`, count: 1, actorType: "system" });
      expect(JSON.stringify(audit)).not.toContain("@");
    });

    it("never reminds after an outcome is recorded", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const decisionId = await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      await t.withIdentity(identity("user_owner")).mutation(api.decisions.recordOutcome, { workspaceId: a.workspaceId, decisionId, result: "better", note: "Two signed." });
      const sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(sent).toHaveLength(0);
      expect(await emailAudit(t, a.workspaceId)).toEqual([]);
    });

    it("tries again next hour when Resend refused everyone, then never again once it went out", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const decisionId = await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      const refused = stubResend(500);
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(refused).toHaveLength(2);
      expect((await t.run((ctx) => ctx.db.get(decisionId)))?.remindedAt).toBeUndefined();
      expect((await emailAudit(t, a.workspaceId)).every((row) => row.count === 0)).toBe(true);

      const sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(sent).toHaveLength(2);
      // Same key as the refused attempt, so Resend itself would drop a duplicate.
      expect(sent.map((row) => row.idempotencyKey).sort()).toEqual(refused.map((row) => row.idempotencyKey).sort());
    });

    it("leaves out a check-in that came due more than 30 days ago", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - 45 * DAY);
      const sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(sent).toHaveLength(0);
    });
  });

  describe("recipients", () => {
    it("emails Owners and Admins only: no Viewer, no removed member, nobody without an address", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      const sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(recipientsOf(sent)).toEqual(["user_admin@example.com", "user_owner@example.com"]);
    });

    it("respects each person's switches: the notice, and email as a whole", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const owner = t.withIdentity(identity("user_owner"));
      const admin = t.withIdentity(identity("user_admin"));
      await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      const { assetId } = await report(t, a, { title: "Market report: Retainer pricing", status: "draft" });

      // The owner turns check-ins off: they still get the report. A preference row with nothing set means on.
      await owner.mutation(api.settings.setMyPreferences, { workspaceId: a.workspaceId, checkInsDue: false });
      await admin.mutation(api.settings.setMyPreferences, { workspaceId: a.workspaceId, theme: "dark" });
      // A Viewer with every switch on still gets nothing.
      await t.withIdentity(identity("user_viewer")).mutation(api.settings.setMyPreferences, { workspaceId: a.workspaceId, checkInsDue: true, reportReady: true, email: true });
      let sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(recipientsOf(sent)).toEqual(["user_admin@example.com"]);
      sent = stubResend();
      await t.action(internal.emailReminders.sendReportReady, { assetId });
      expect(recipientsOf(sent)).toEqual(["user_admin@example.com", "user_owner@example.com"]);

      // The admin turns "Report ready" off; the owner turns email off altogether.
      await admin.mutation(api.settings.setMyPreferences, { workspaceId: a.workspaceId, reportReady: false });
      await owner.mutation(api.settings.setMyPreferences, { workspaceId: a.workspaceId, checkInsDue: true, email: false });
      expect((await owner.query(api.settings.me, { workspaceId: a.workspaceId })).notifications.email).toBe(false);
      const next = await report(t, a, { title: "Offer analysis: Growth retainer", status: "needsReview", kind: "offerAnalysis" });
      await decide(t, a, "Offer a paid audit before every proposal", Date.now() - DAY);
      sent = stubResend();
      await t.action(internal.emailReminders.sendReportReady, { assetId: next.assetId });
      expect(sent).toHaveLength(0);
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(recipientsOf(sent)).toEqual(["user_admin@example.com"]);
    });

    it("sends nothing for a paused workspace, and sends once it is running again", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const decisionId = await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      const { assetId } = await report(t, a, { title: "Market report: Retainer pricing", status: "draft" });
      const controls = await t.run((ctx) => ctx.db.insert("workspaceControls", { workspaceId: a.workspaceId, agentsPaused: true }));
      const sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      await t.action(internal.emailReminders.sendReportReady, { assetId });
      expect(sent).toHaveLength(0);
      expect((await t.run((ctx) => ctx.db.get(decisionId)))?.remindedAt).toBeUndefined();

      await t.run((ctx) => ctx.db.patch(controls, { agentsPaused: false }));
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(sent).toHaveLength(2);

      await t.run((ctx) => ctx.db.patch(a.workspaceId, { status: "archived" }));
      await t.action(internal.emailReminders.sendReportReady, { assetId });
      expect(sent).toHaveLength(2);
    });
  });

  describe("report ready", () => {
    it("emails for a draft and for needs-review, one per report version, naming the tab and linking to the report", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const draft = await report(t, a, { title: "Market report: Retainer pricing", status: "draft" });
      const review = await report(t, a, { title: "Growth diagnosis: Q4 pipeline", status: "needsReview", kind: "growthDiagnosis" });
      const sent = stubResend();

      await t.action(internal.emailReminders.sendReportReady, { assetId: draft.assetId });
      expect(recipientsOf(sent)).toEqual(["user_admin@example.com", "user_owner@example.com"]);
      expect(sent[0].subject).toBe("Report ready: Market report: Retainer pricing");
      expect(sent[0].text).toContain("Strategist, Research tab");
      expect(sent[0].text).toContain(`Open the report: https://app.vistrial.io/app/assets/${draft.assetId}`);
      expect(sent[0].text).toContain("https://app.vistrial.io/app/settings?section=you");
      expect(sent.map((row) => row.idempotencyKey).sort()).toEqual([`report-ready/${draft.versionId}/user_admin`, `report-ready/${draft.versionId}/user_owner`]);

      await t.action(internal.emailReminders.sendReportReady, { assetId: review.assetId });
      expect(sent).toHaveLength(4);
      expect(sent[2].subject).toBe("Report needs review: Growth diagnosis: Q4 pipeline");
      expect(sent[2].text).toContain("Strategist, Diagnostics tab");
      expect(sent[2].idempotencyKey).toContain(`report-ready/${review.versionId}/`);

      const audit = await emailAudit(t, a.workspaceId);
      expect(audit).toHaveLength(4);
      expect(audit).toContainEqual({ action: "email.report_ready", subject: `${draft.versionId}:user_owner`, count: 1, actorType: "system" });
      expect(JSON.stringify(audit)).not.toContain("@");
    });

    it("sends none for an approved report, an asset no run made, or an asset that is not a report", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const approved = await report(t, a, { title: "Market report: Approved", status: "approved" });
      const byHand = await report(t, a, { title: "Market report: Imported", status: "draft", byRun: false });
      const internalKind = await report(t, a, { title: "Ad copy", status: "draft", kind: "adCopySet" });
      const sent = stubResend();
      for (const row of [approved, byHand, internalKind]) await t.action(internal.emailReminders.sendReportReady, { assetId: row.assetId });
      expect(sent).toHaveLength(0);
      expect(await emailAudit(t, a.workspaceId)).toEqual([]);
    });

    it("sends none when the report was approved before the email ran", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const draft = await report(t, a, { title: "Market report: Retainer pricing", status: "draft" });
      await t.run((ctx) => ctx.db.patch(draft.assetId, { status: "approved" }));
      const sent = stubResend();
      await t.action(internal.emailReminders.sendReportReady, { assetId: draft.assetId });
      expect(sent).toHaveLength(0);
    });
  });

  describe("safety", () => {
    it("skips cleanly with no key: nothing is sent, nothing throws, and a check-in stays open for later", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      const t = makeTester();
      const { a } = await seed(t);
      const decisionId = await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      const draft = await report(t, a, { title: "Market report: Retainer pricing", status: "draft" });
      const sent = stubResend();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(t.action(internal.emailReminders.sendCheckInsDue, {})).resolves.toBeNull();
      await expect(t.action(internal.emailReminders.sendReportReady, { assetId: draft.assetId })).resolves.toBeNull();
      expect(sent).toHaveLength(0);
      expect(log.mock.calls.map((call) => call[0])).toEqual(["Check-in emails skipped: RESEND_API_KEY is not set.", "Report-ready email skipped: RESEND_API_KEY is not set."]);
      log.mockRestore();

      // The check-in was not marked, so it goes out once a key is set. The report skip is on the audit log.
      expect((await t.run((ctx) => ctx.db.get(decisionId)))?.remindedAt).toBeUndefined();
      expect(await emailAudit(t, a.workspaceId)).toEqual([
        { action: "email.report_ready", subject: `${draft.versionId}:user_owner`, count: 0, actorType: "system" },
        { action: "email.report_ready", subject: `${draft.versionId}:user_admin`, count: 0, actorType: "system" },
      ]);

      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      expect(sent).toHaveLength(2);
    });

    it("does not throw when Resend is unreachable", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      const draft = await report(t, a, { title: "Market report: Retainer pricing", status: "draft" });
      vi.stubGlobal("fetch", async () => {
        throw new Error("network down");
      });
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(t.action(internal.emailReminders.sendReportReady, { assetId: draft.assetId })).resolves.toBeNull();
      error.mockRestore();
      expect((await emailAudit(t, a.workspaceId)).map((row) => row.count)).toEqual([0, 0]);
    });

    it("keeps workspaces apart: each workspace's people hear only about their own work", async () => {
      const t = makeTester();
      const { a, b } = await seed(t);
      await decide(t, a, "Raise retainer to $3,000 for new clients", Date.now() - DAY);
      await decide(t, b, "Sell brand sprints as a fixed package", Date.now() - DAY);
      const theirs = await report(t, b, { title: "Market report: Harbor brand sprints", status: "draft" });
      const sent = stubResend();

      await t.action(internal.emailReminders.sendCheckInsDue, {});
      const toOther = sent.filter((row) => row.to[0] === "user_other@example.com");
      expect(toOther).toHaveLength(1);
      expect(toOther[0].text).toContain("Sell brand sprints as a fixed package");
      expect(toOther[0].text).not.toContain("Raise retainer");
      expect(toOther[0].text).not.toContain("Northside");
      for (const email of sent.filter((row) => row.to[0] !== "user_other@example.com")) {
        expect(email.text).toContain("Raise retainer");
        expect(email.text).not.toContain("brand sprints");
        expect(email.text).not.toContain("Harbor");
      }

      sent.length = 0;
      await t.action(internal.emailReminders.sendReportReady, { assetId: theirs.assetId });
      expect(recipientsOf(sent)).toEqual(["user_other@example.com"]);
      expect(await emailAudit(t, a.workspaceId)).toHaveLength(2);
      expect((await emailAudit(t, b.workspaceId)).every((row) => row.subject.endsWith(":user_other"))).toBe(true);
    });

    it("puts no customer figures or source excerpts in either email", async () => {
      const t = makeTester();
      const { a } = await seed(t);
      await decide(t, a, "Offer a paid audit before every proposal", Date.now() - DAY);
      const draft = await report(t, a, { title: "Market report: Retainer pricing", status: "needsReview" });
      const sent = stubResend();
      await t.action(internal.emailReminders.sendCheckInsDue, {});
      await t.action(internal.emailReminders.sendReportReady, { assetId: draft.assetId });
      expect(sent).toHaveLength(4);
      for (const email of sent) {
        const all = `${email.subject}\n${email.text}\n${email.html}`;
        // The baseline figures, the report body and its excerpt, the opportunity and how it is measured.
        for (const secret of ["48213", "48,213", "417", "96431", "96,431", "4,875", "37%", "we raised prices", "HubSpot", "Agencies underprice", "Watch signed retainers", "median"]) {
          expect(all).not.toContain(secret);
        }
      }
    });
  });

  describe("the words", () => {
    it("writes a single check-in the way an agency owner would say it", () => {
      const email = checkInDueEmail({
        workspaceName: "Northside Agency",
        items: [{ action: "Raise retainer to $3,000 for new clients.", checkInAt: Date.UTC(2026, 10, 9) }],
        appUrl: "https://app.vistrial.io/",
      });
      expect(email.subject).toBe("Check-in due: Raise retainer to $3,000 for new clients");
      expect(email.text).toBe(
        [
          "A decision you planned is ready for its check-in.",
          "Say what happened, so the next research starts from what worked.",
          "",
          "- Raise retainer to $3,000 for new clients (due Nov 9, 2026)",
          "",
          "Record what happened: https://app.vistrial.io/app",
          "",
          "--",
          'You got this because you are an Owner or Admin of Northside Agency on Vistrial and have "Check-ins due" emails on.',
          "Turn these emails off in Settings, You: https://app.vistrial.io/app/settings?section=you",
        ].join("\n"),
      );
      expect(email.html.match(/<a /g)).toHaveLength(2);
    });

    it("shortens a long action, keeps the subject on one line, and escapes the HTML", () => {
      const long = `Rebuild the proposal\ntemplate <b>now</b> ${"so every prospect sees the audit first ".repeat(6)}`;
      const email = checkInDueEmail({ workspaceName: "A & B", items: [{ action: long, checkInAt: 0 }], appUrl: "https://app.vistrial.io" });
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.subject.length).toBeLessThanOrEqual(90);
      expect(email.subject.endsWith("…")).toBe(true);
      expect(email.html).not.toContain("<b>");
      expect(email.html).toContain("A &amp; B");
    });

    it("counts the check-ins it does not list", () => {
      const items = Array.from({ length: 13 }, (_, i) => ({ action: `Action ${i + 1}`, checkInAt: i }));
      const email = checkInDueEmail({ workspaceName: "Northside Agency", items, appUrl: "https://app.vistrial.io" });
      expect(email.text.match(/^- Action /gm)).toHaveLength(10);
      expect(email.text).toContain("- and 3 more");
    });

    it("says a report that failed its checks needs review", () => {
      const email = reportReadyEmail({ workspaceName: "Northside Agency", title: "Offer analysis: Growth retainer", kind: "offerAnalysis", needsReview: true, assetId: "abc", appUrl: "https://app.vistrial.io" });
      expect(email.subject).toBe("Report needs review: Offer analysis: Growth retainer");
      expect(email.text).toContain("Strategist, Offers tab");
      expect(email.text).toContain("Review the report: https://app.vistrial.io/app/assets/abc");
    });
  });
});
