/**
 * @vitest-environment edge-runtime
 *
 * Strategist's first package: free, once per organization, inside a fixed limit of our cost; research and
 * the teardown start together, the offer ideas follow the approved research; each part arrives approved only
 * when its checks pass; the Owner is emailed once. Runs are driven by hand here: no model is called.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { PACKAGE_LIMIT_CENTS, capFor, startPackage } from "./firstPackage";
import { capsOfRun } from "./runs";
import { firstPackageEmail } from "./lib/reminderEmail";
import { runChecks } from "./skills/landingTeardown/checks";
import type { IndustryRead, PagesRecord } from "./skills/landingTeardown/shapes";
import { bareTitle, firstPackageProblem, focusOf } from "./skills/offerIntelligence/firstPackage";
import type { OfferAnalysis } from "./skills/offerIntelligence/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: "Dana Ruiz", issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}`, secondFactor: true };
}

const CONFIRM = {
  person: { fullName: "Dana Ruiz", role: "Owner" },
  business: { name: "Brightline Media", offer: "Paid ads for coaches", area: "United States", audience: "Coaches selling programs above $2,000" },
  goal: { kind: "leads", text: "More booked calls" },
};

async function onboarded(t: Tester, subject: string) {
  await t.mutation(internal.seed.agents, {});
  const me = t.withIdentity(person(subject));
  await me.mutation(api.onboarding.skipWebsite, {});
  await me.mutation(api.onboarding.goTo, { stage: "confirm" });
  const workspaceId = (await me.mutation(api.onboarding.confirm, CONFIRM)) as Id<"workspaces">;
  const pkg = await t.run((ctx) => ctx.db.query("firstPackages").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first());
  return { me, workspaceId, pkg: pkg! };
}

/** Ends a run as a skill would: with a saved report (draft when its checks passed), or with nothing. */
async function finishRun(t: Tester, runId: Id<"agentRuns">, outcome: { kind?: Doc<"assets">["kind"]; status?: "draft" | "needsReview"; costCents: number; body?: unknown }) {
  return t.run(async (ctx) => {
    const run = (await ctx.db.get(runId))!;
    await ctx.db.patch(runId, { status: outcome.kind ? "completed" : "failed", stopReason: outcome.kind ? "done" : "error", finishedAt: Date.now(), costCents: outcome.costCents });
    if (outcome.body) {
      const stepId = await ctx.db.insert("runSteps", { workspaceId: run.workspaceId, runId, index: 0, idempotencyKey: `${runId}:0`, kind: "model", status: "completed", durationMs: 1, inputTokens: 1, outputTokens: 1, resultCode: "ok", phase: "write" });
      await ctx.db.insert("runArtifacts", { workspaceId: run.workspaceId, runId, stepId, kind: "model", byteSize: 10, body: JSON.stringify(outcome.body) });
    }
    if (!outcome.kind) return null;
    const assetId = await ctx.db.insert("assets", { workspaceId: run.workspaceId, kind: outcome.kind, title: "Report", status: outcome.status ?? "draft", currentVersion: 1, createdByRun: runId, createdAt: Date.now() });
    await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version: 1, body: "# Report", createdBy: "agent" });
    return assetId;
  });
}

const REPORT = {
  objective: "Where Brightline stands",
  summary: "Coaching ad agencies mostly sell retainers with no performance guarantee; a booked-call guarantee would stand out.",
  findings: [
    { statement: "Four of six competitors lead with a monthly retainer.", basis: "observed", sourceRefIds: [] },
    { statement: "None offer a guarantee tied to booked calls.", basis: "inferred", sourceRefIds: [] },
    { statement: "Your cost per booked call fell in October.", basis: "firstParty", sourceRefIds: [] },
    { statement: "A fourth finding.", basis: "observed", sourceRefIds: [] },
  ],
  opportunities: [],
  limits: [],
  contextUsed: { profileVersionId: null, factIds: [] },
  missingOpportunityReason: "",
};

const change = (title: string, fit: string) => ({
  title,
  evidence: { text: "e", basis: "inferred", sourceRefIds: [] },
  fit: { text: fit, profileFields: ["offer"], factIds: [], decisionIds: [] },
  channel: "paidSocial",
  newChannel: false,
  principleIds: [],
  proposedChange: "Do the thing",
  validationMethod: "Watch booked calls for six weeks",
  metric: "bookedCalls",
});

describe("the first package", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AUTUMN_SECRET_KEY;
  });

  it("starts when onboarding is confirmed: research free, under its share, and nothing to tear down without a website", async () => {
    const t = makeTester();
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    const { me, workspaceId, pkg } = await onboarded(t, "pkg-1");
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("package");
    expect(pkg).toMatchObject({ status: "running", limitCents: PACKAGE_LIMIT_CENTS, research: { state: "running", attempts: 1 }, teardown: { state: "skipped", reason: "no_pages" }, offers: { state: "waiting" } });
    const run = await t.run((ctx) => ctx.db.get(pkg.research.runId!));
    expect(run).toMatchObject({ free: true, packageId: pkg._id, capCentsOverride: 700, skillSlug: "market-intelligence", mode: "thorough", status: "queued" });
    const project = await t.run((ctx) => ctx.db.get(pkg.research.projectId!));
    expect(project?.objective).toMatch(/Brightline Media.*Paid ads for coaches.*United States/);
    expect(project?.objective).toMatch(/More booked calls/);

    // A charge on a package run is ours: no credits, and the organization's day counter is untouched.
    await t.mutation(internal.runs.fail, { runId: run!._id, index: 0, idempotencyKey: "x", code: "provider_error", kind: "model", costCents: 120 });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("billingLedger").collect()).toHaveLength(0);
      expect(await ctx.db.query("capCounters").collect()).toHaveLength(0);
    });
    // Once per organization.
    expect(await t.run((ctx) => ctx.db.query("firstPackages").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect())).toHaveLength(1);
  });

  it("approves the research when its checks passed, then writes the two offer ideas, emails the Owner once and posts to the Briefing", async () => {
    const t = makeTester();
    const { workspaceId, pkg } = await onboarded(t, "pkg-2");
    const researchAsset = await finishRun(t, pkg.research.runId!, { kind: "marketReport", costCents: 210, body: REPORT });
    await t.mutation(internal.firstPackage.advance, { packageId: pkg._id });

    let now = (await t.run((ctx) => ctx.db.get(pkg._id)))!;
    expect(now.research).toMatchObject({ state: "done", assetId: researchAsset, spentCents: 210 });
    expect((await t.run((ctx) => ctx.db.get(researchAsset!)))?.status).toBe("approved");
    expect(now.offers).toMatchObject({ state: "running", attempts: 1 });
    const offersRun = await t.run((ctx) => ctx.db.get(now.offers.runId!));
    // Its share is 300; the whole limit has 1500 - 210 left.
    expect(offersRun).toMatchObject({ skillSlug: "offer-intelligence", inputRef: `first-package:${pkg._id}`, capCentsOverride: 300, packageId: pkg._id });
    expect(now.emailedAt).toBeUndefined();

    const analysis = { changes: [change("Win customers: Booked-call guarantee", "Builds on Booked Calls Engine at $3,500 a month"), change("Keep customers: Quarterly growth review", "Builds on Booked Calls Engine")] };
    await finishRun(t, offersRun!._id, { kind: "offerAnalysis", costCents: 90, body: analysis });
    await t.mutation(internal.firstPackage.advance, { packageId: pkg._id });
    now = (await t.run((ctx) => ctx.db.get(pkg._id)))!;
    expect(now).toMatchObject({ status: "done", offers: { state: "done", spentCents: 90 } });
    expect(now.emailedAt).toBeGreaterThan(0);

    // The offer ideas may use their 300-cent share, though the skill's usual run cap is 150.
    expect((await t.run((ctx) => capsOfRun(ctx, offersRun!))).maxCostCentsPerRun).toBe(300);

    // The Owner and the Admins get it; a Member does not, and an Admin who switched "Report ready" off does not.
    await t.run(async (ctx) => {
      for (const member of await ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) await ctx.db.patch(member._id, { email: "owner@brightline.example.com" });
      await ctx.db.insert("members", { workspaceId, userId: "admin-1", role: "admin", active: true, displayName: "A", email: "admin@brightline.example.com" });
      await ctx.db.insert("members", { workspaceId, userId: "admin-2", role: "admin", active: true, displayName: "B", email: "quiet@brightline.example.com" });
      await ctx.db.insert("members", { workspaceId, userId: "member-1", role: "member", active: true, displayName: "C", email: "member@brightline.example.com" });
      await ctx.db.insert("memberPreferences", { workspaceId, userId: "admin-2", notifyReportReady: false, updatedAt: 1 });
    });
    const email = await t.query(internal.emailReminders.packageToAnnounce, { packageId: pkg._id });
    expect(email?.recipients.map((row) => row.userId).sort()).toEqual(["admin-1", "pkg-2"]);
    expect(email).toMatchObject({ answer: REPORT.summary, researchNeedsReview: false, teardown: "none", reportAssetId: researchAsset });
    expect(email?.findings[0]).toEqual({ text: "Four of six competitors lead with a monthly retainer.", basis: "observed" });
    expect(email?.ideas.map((row) => [row.focus, row.title])).toEqual([
      ["acquisition", "Booked-call guarantee"],
      ["retention", "Quarterly growth review"],
    ]);

    const posts = await t.run((ctx) => ctx.db.query("briefingItems").collect());
    expect(posts.filter((row) => row.title === "Your first package is ready")).toHaveLength(1);
    // A further look changes nothing: the email and the post are not repeated.
    await t.mutation(internal.firstPackage.advance, { packageId: pkg._id });
    expect((await t.run((ctx) => ctx.db.query("briefingItems").collect())).filter((row) => row.title === "Your first package is ready")).toHaveLength(1);

    const shown = await t.withIdentity(person("pkg-2")).query(api.firstPackage.mine, { workspaceId });
    expect(shown?.parts.map((row) => [row.key, row.state])).toEqual([
      ["research", "done"],
      ["offers", "done"],
      ["teardown", "skipped"],
    ]);
  });

  it("leaves research that failed its checks for review, writes no offer ideas on it, and still emails", async () => {
    const t = makeTester();
    const { pkg } = await onboarded(t, "pkg-3");
    const assetId = await finishRun(t, pkg.research.runId!, { kind: "marketReport", status: "needsReview", costCents: 250, body: REPORT });
    await t.mutation(internal.firstPackage.advance, { packageId: pkg._id });
    const now = (await t.run((ctx) => ctx.db.get(pkg._id)))!;
    expect(now).toMatchObject({ status: "done", research: { state: "needsReview" }, offers: { state: "skipped", reason: "no_research" } });
    expect((await t.run((ctx) => ctx.db.get(assetId!)))?.status).toBe("needsReview");
    expect(now.emailedAt).toBeGreaterThan(0);
    expect(await t.query(internal.emailReminders.packageToAnnounce, { packageId: pkg._id })).toMatchObject({ researchNeedsReview: true, ideas: [] });
  });

  it("tries a part once more when it stops without a report, inside what is left of its share", async () => {
    const t = makeTester();
    const { pkg } = await onboarded(t, "pkg-4");
    await finishRun(t, pkg.research.runId!, { costCents: 120 });
    await t.mutation(internal.firstPackage.advance, { packageId: pkg._id });
    const now = (await t.run((ctx) => ctx.db.get(pkg._id)))!;
    expect(now.research).toMatchObject({ state: "running", attempts: 2, spentCents: 120 });
    expect((await t.run((ctx) => ctx.db.get(now.research.runId!)))?.capCentsOverride).toBe(580);
    await finishRun(t, now.research.runId!, { costCents: 100 });
    await t.mutation(internal.firstPackage.advance, { packageId: pkg._id });
    const after = (await t.run((ctx) => ctx.db.get(pkg._id)))!;
    expect(after).toMatchObject({ status: "done", research: { state: "failed", spentCents: 220 }, offers: { state: "skipped" } });
    expect(capFor(after, "research")).toBe(480);
  });

  it("gives an account three packages at most, and makes a busy day's packages wait for the next", async () => {
    const t = makeTester();
    const { workspaceId, pkg } = await onboarded(t, "pkg-5");
    const accountId = (await t.run((ctx) => ctx.db.get(workspaceId)))!.accountId!;
    const part = { state: "done" as const, attempts: 1, spentCents: 0 };
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i += 1) {
        const other = await ctx.db.insert("workspaces", { name: `Other ${i}`, slug: `other-${i}`, timezone: "UTC", status: "active", createdAt: 1, accountId });
        await ctx.db.insert("firstPackages", { workspaceId: other, accountId, ownerId: "pkg-5", status: "done", limitCents: 1500, research: part, offers: part, teardown: part, createdAt: 1 });
      }
    });
    const fourth = (await t.withIdentity(person("pkg-5")).mutation(api.organizations.create, { accountId, name: "Fourth" })) as Id<"workspaces">;
    const id = await t.run((ctx) => startPackage(ctx, { workspaceId: fourth, ownerId: "pkg-5", onboardingId: pkg._id as never }));
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: "done", reason: "account_limit", research: { state: "skipped" } });

    // Fifty packages already started today across the platform: the next one waits, and starts when there is room.
    const t2 = makeTester();
    await t2.run(async (ctx) => {
      for (let i = 0; i < 50; i += 1) {
        const ws = await ctx.db.insert("workspaces", { name: `W${i}`, slug: `w-${i}`, timezone: "UTC", status: "active", createdAt: 1 });
        await ctx.db.insert("firstPackages", { workspaceId: ws, ownerId: "x", status: "running", limitCents: 1500, research: part, offers: part, teardown: part, createdAt: Date.now() });
      }
    });
    const late = await onboarded(t2, "pkg-6");
    expect(late.pkg).toMatchObject({ status: "waiting", research: { state: "waiting" } });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await t2.mutation(internal.firstPackage.startWaiting, {});
    expect((await t2.run((ctx) => ctx.db.get(late.pkg._id)))).toMatchObject({ status: "running", research: { state: "running" } });
  });
});

describe("the first package's rules, in code", () => {
  const analysis = (changes: ReturnType<typeof change>[]) => ({ changes }) as unknown as OfferAnalysis;
  const offers = [{ id: "c1", name: "Booked Calls Engine", price: "$3,500 a month" }];

  it("wants exactly one idea to win customers and one to keep them, each on a stated offer and price", () => {
    expect(firstPackageProblem(analysis([change("Win customers: A", "Booked Calls Engine at $3,500"), change("Keep customers: B", "Booked Calls Engine")]), offers)).toBeNull();
    expect(firstPackageProblem(analysis([change("Win customers: A", "Booked Calls Engine")]), offers)).toMatch(/exactly two/);
    expect(firstPackageProblem(analysis([change("Win customers: A", "Booked Calls Engine"), change("Win customers: B", "Booked Calls Engine")]), offers)).toMatch(/Keep customers/);
    expect(firstPackageProblem(analysis([change("Win customers: A", "a generic idea"), change("Keep customers: B", "Booked Calls Engine")]), offers)).toMatch(/name the offer/);
    expect(firstPackageProblem(analysis([change("Win customers: A", "Booked Calls Engine at $2,000"), change("Keep customers: B", "Booked Calls Engine")]), offers)).toMatch(/\$2,000/);
    expect([focusOf("keep customers: x"), focusOf("Something"), bareTitle("Win customers:  Guarantee")]).toEqual(["retention", null, "Guarantee"]);
  });

  it("allows no gaps or shared patterns when every page is the business's own", () => {
    const page = (id: string) => ({ id, own: true, order: ["hero"], analysis: {} }) as unknown as PagesRecord["pages"][number];
    const record = { industry: "x", pages: [page("p1"), page("p2")], unread: [], table: [], ownId: "p1", ownSite: true } as PagesRecord;
    const read = {
      summary: "s",
      patterns: [],
      gaps: [{ statement: "Lacks proof", job: "results", pageIds: ["p2"] }],
      suggestions: [{ title: "Add proof", change: "Add three results", why: "w", basis: "inferred", pageIds: ["p1"], howToTell: "Watch calls" }],
      brief: { audience: "a", qualifier: "", promise: "p", cta: "Book", sections: [{}, {}, {}], proofNeeded: [], avoid: [] },
      limits: [],
    } as unknown as IndustryRead;
    expect(runChecks(read, record).results.find((row) => row.key === "gaps_true")).toMatchObject({ passed: false, detail: expect.stringMatching(/own/) });
    expect(runChecks({ ...read, gaps: [] }, record).passed).toBe(true);
  });

  it("writes the Owner's email from the saved reports, with evidence labels and the two ideas", () => {
    const email = firstPackageEmail({
      workspaceName: "Brightline Media",
      answer: REPORT.summary,
      findings: REPORT.findings.map((row) => ({ text: row.statement, basis: row.basis })),
      ideas: [
        { focus: "acquisition", title: "Booked-call guarantee", why: "Builds on Booked Calls Engine" },
        { focus: "retention", title: "Quarterly growth review", why: "Keeps clients past the minimum" },
      ],
      researchNeedsReview: false,
      teardown: "running",
      reportAssetId: "asset123",
      appUrl: "https://app.vistrial.io/",
    });
    expect(email.subject).toBe("Your first Vistrial package: Brightline Media");
    expect(email.text).toContain("The answer: Coaching ad agencies");
    expect(email.text).toContain("Finding 1: Four of six competitors lead with a monthly retainer (Observed)");
    expect(email.text).toContain("Finding 3: Your cost per booked call fell in October (Your data)");
    expect(email.text).not.toContain("A fourth finding");
    expect(email.text).toContain("To win customers: Booked-call guarantee.");
    expect(email.text).toContain("To keep customers: Quarterly growth review.");
    expect(email.text).toContain("still being written");
    expect(email.text).toContain("https://app.vistrial.io/app/assets/asset123");
    expect(email.text).toContain("used none of your credits");
    expect(email.html).not.toContain("<script");
  });
});
