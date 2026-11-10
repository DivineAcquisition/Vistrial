/**
 * @vitest-environment edge-runtime
 *
 * The approval surface for acting inside a customer's account, on the dry-run driver: who may start and end
 * a session, that reads are logged and changes wait, that a restricted step needs an Owner and a typed word,
 * that the rules read a step's own words, the hard stops, expiry, revoking, the audit trail and isolation.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DRY_RUN_GOALS, drawStep } from "./lib/browserAgent/driver";
import { SITES, blocked, classify, redact, restrictedReason, type ProposedStep } from "./lib/browserAgent/policy";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const join = async (role: "manager" | "rep") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${name}-${role}@example.com`, role });
    const member = t.withIdentity({ ...person(`${name}-${role}`), email: `${name}-${role}@example.com` });
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    return member;
  };
  return { owner, workspaceId, manager: await join("manager"), rep: await join("rep") };
}

async function signedIn(a: { owner: Caller; workspaceId: Id<"workspaces"> }) {
  const sessionId = await a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "demo-crm" });
  await a.owner.mutation(api.browserAccess.completeSignIn, { workspaceId: a.workspaceId, sessionId });
  return sessionId;
}

async function settle(t: Tester) {
  for (let i = 0; i < 10; i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
  }
}

const step = (over: Partial<ProposedStep>): ProposedStep => ({ verb: "click", target: "the Save draft button", url: "https://app.practice-crm.vistrial.example/x", kind: "change", why: "", ...over });

describe("the rules", () => {
  it("reads a step's own words and takes the stricter kind", () => {
    expect(classify(step({ verb: "read", target: "the invoice list", kind: "read" }))).toEqual({ kind: "read", reason: null });
    expect(classify(step({ verb: "open", target: "the Delete account page", kind: "read" }))).toEqual({ kind: "read", reason: null });
    expect(classify(step({}))).toEqual({ kind: "change", reason: null });
    // A driver that calls a payment a "read" is overruled.
    expect(classify(step({ target: "the Pay now button", kind: "read" }))).toEqual({ kind: "restricted", reason: "payment" });
    // A driver may always be stricter than the words.
    expect(classify(step({ verb: "read", target: "the lead list", kind: "change" })).kind).toBe("change");
    const cases: [Partial<ProposedStep>, string][] = [
      [{ target: "the Upgrade plan button" }, "payment"],
      [{ verb: "type", target: "the Daily budget field", value: "500" }, "payment"],
      [{ target: "the Change password link" }, "security"],
      [{ target: "the Invite user button" }, "security"],
      [{ target: "the Create API key button" }, "security"],
      [{ target: "the Delete lead button" }, "delete"],
      [{ target: "the Archive campaign option" }, "delete"],
      [{ target: "the Send follow-up email button" }, "message"],
      [{ target: "the Reply box's Send button" }, "message"],
      [{ target: "the Publish button" }, "publish"],
      [{ target: "the Go live toggle" }, "publish"],
      [{ verb: "select", target: "the Status menu", value: "Publish" }, "publish"],
      [{ target: "the Schedule the post button" }, "publish"],
    ];
    for (const [over, reason] of cases) expect(restrictedReason(step(over)), over.target).toBe(reason);
    for (const target of ["the Edit draft button", "the Headline field", "the Next page arrow", "the Filter menu", "the Preview tab"]) expect(restrictedReason(step({ target })), target).toBeNull();
    // Typing the word "delete" into a headline is not deleting.
    expect(restrictedReason(step({ verb: "type", target: "the Headline field", value: "Delete your busywork" }))).toBeNull();
  });

  it("has hard stops no approval unlocks", () => {
    const hosts = ["practice-crm.vistrial.example"];
    expect(blocked(step({}), hosts)).toBeNull();
    expect(blocked(step({ url: "https://evil.example.com/x" }), hosts)).toBe("off_site");
    expect(blocked(step({ url: "https://practice-crm.vistrial.example.evil.com/x" }), hosts)).toBe("off_site");
    expect(blocked(step({ url: "http://app.practice-crm.vistrial.example/x" }), hosts)).toBe("bad_address");
    expect(blocked(step({ url: "javascript:alert(1)" }), hosts)).toBe("bad_address");
    expect(blocked(step({ verb: "type", target: "the Password field", value: "hunter2" }), hosts)).toBe("password_field");
    expect(blocked(step({ verb: "type", target: "the Card number field", value: "4242" }), hosts)).toBe("password_field");
    expect(blocked(step({ verb: "type", target: "the verification code box", value: "123456" }), hosts)).toBe("password_field");
  });

  it("hides anything that looks like a secret in the trail", () => {
    expect(redact("Fill your calendar")).toBe("Fill your calendar");
    expect(redact("4242 4242 4242 4242")).toBe("[hidden: looks like a secret]");
    expect(redact("sk_live_abcdefghijklmnop1234")).toBe("[hidden: looks like a secret]");
    expect(redact("word ".repeat(100))).toHaveLength(300);
  });

  it("uses an API where there is one, refuses where terms forbid it, and offers only the practice site", () => {
    const mode = (key: string) => SITES.find((site) => site.key === key)?.mode;
    expect([mode("meta"), mode("google-ads"), mode("stripe"), mode("shopify")]).toEqual(["api", "api", "api", "api"]);
    expect(mode("linkedin")).toBe("never");
    expect(SITES.filter((site) => site.mode === "demo").map((site) => site.key)).toEqual(["demo-crm"]);
    expect(drawStep({ verb: "click", target: 'the <b>"Save"</b> button', url: "https://x.example/", kind: "change" }, 0)).toContain("&lt;b&gt;&quot;Save&quot;&lt;/b&gt;");
    expect(drawStep({ verb: "click", target: "x", url: "https://x.example/", kind: "change" }, 0)).toContain("Dry run. Nothing was opened or changed.");
  });
});

describe("browser access with approval (dry run)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets only an Owner start, sign in and end a session, and only for the practice site", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    for (const caller of [a.manager, a.rep]) expect(await message(caller.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "demo-crm" }))).toBe(NOT_ALLOWED);
    expect(await message(a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "meta" }))).toContain("official API, not a browser");
    expect(await message(a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "linkedin" }))).toContain("Vistrial does not automate LinkedIn");
    expect(await message(a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "highlevel" }))).toContain("not available yet");
    expect(await message(a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "nope" }))).toBe(NOT_FOUND);

    const sessionId = await a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "demo-crm" });
    // Asking again returns the same session: there is one per site.
    expect(await a.owner.mutation(api.browserAccess.connect, { workspaceId: a.workspaceId, site: "demo-crm" })).toBe(sessionId);
    expect(await message(a.manager.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" }))).toBe("This session is not signed in.");
    expect(await message(a.manager.mutation(api.browserAccess.completeSignIn, { workspaceId: a.workspaceId, sessionId }))).toBe(NOT_ALLOWED);
    await a.owner.mutation(api.browserAccess.completeSignIn, { workspaceId: a.workspaceId, sessionId });

    const overview = await a.rep.query(api.browserAccess.overview, { workspaceId: a.workspaceId });
    expect(overview.sessions).toMatchObject([{ site: "demo-crm", state: "active" }]);
    expect(overview.dryRunOnly).toBe(true);
    // The session row holds no credential of any kind.
    const row = (await t.run((ctx) => ctx.db.query("browserSessions").collect()))[0];
    expect(Object.keys(row).sort()).toEqual(["_creationTime", "_id", "createdAt", "createdBy", "driver", "expiresAt", "signedInAt", "site", "status", "workspaceId"]);
    expect(row.expiresAt! - row.signedInAt!).toBe(7 * 24 * 60 * 60 * 1000);

    expect(await message(a.manager.mutation(api.browserAccess.revoke, { workspaceId: a.workspaceId, sessionId }))).toBe(NOT_ALLOWED);
  });

  it("logs reads, waits before every change, and wants a typed word from an Owner before publishing", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const sessionId = await signedIn(a);
    expect(await message(a.rep.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" }))).toBe(NOT_ALLOWED);
    const browserTaskId = await a.manager.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" });
    await settle(t);

    const read = () => a.manager.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId });
    let trail = await read();
    // Two reads were done and logged; the first change is shown and nothing after it has been proposed.
    expect(trail.task.status).toBe("waitingApproval");
    expect(trail.steps.map((row) => [row.kind, row.status, row.verb, row.target])).toEqual([
      ["read", "done", "open", "the Funnels list"],
      ["read", "done", "read", "the Booked Calendar landing page's current headline and button"],
      ["change", "proposed", "click", "the Edit draft button"],
    ]);
    expect(trail.steps.every((row) => row.screenshot)).toBe(true);
    expect(trail.steps[2]).toMatchObject({ url: "https://app.practice-crm.vistrial.example/funnels/booked-calendar/landing", decidedBy: null, canDecide: true });

    expect(await message(a.rep.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: trail.steps[2].id, approve: true }))).toBe(NOT_ALLOWED);
    expect(await message(a.rep.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId }))).toBe(NOT_ALLOWED);
    // Each approval covers one step: after it, the next change waits again.
    await a.manager.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: trail.steps[2].id, approve: true });
    trail = await read();
    expect(trail.steps[2]).toMatchObject({ status: "done", decidedBy: "Alpha-manager" });
    expect(trail.steps[3]).toMatchObject({ kind: "change", status: "proposed", verb: "type", target: "the Headline field", value: "Fill your calendar with sales calls from people who can afford you" });
    expect(await message(a.manager.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: trail.steps[2].id, approve: true }))).toBe("This step is no longer waiting for a decision.");
    await a.manager.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: trail.steps[3].id, approve: true });
    await a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: (await read()).steps[4].id, approve: true });

    // Publishing was proposed by the driver as an ordinary change. The rules made it restricted.
    trail = await read();
    const publish = trail.steps[5];
    expect(publish).toMatchObject({ kind: "restricted", status: "proposed", target: "the Publish button", canDecide: false, restricted: { reason: "publish", confirm: "PUBLISH", words: "It publishes something where others can see it." } });
    expect(await message(a.manager.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: publish.id, approve: true, confirmWord: "PUBLISH" }))).toBe("Only an Owner can approve this kind of step.");
    expect(await message(a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: publish.id, approve: true }))).toBe("Type PUBLISH to approve this step.");
    expect(await message(a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: publish.id, approve: true, confirmWord: "publish" }))).toBe("Type PUBLISH to approve this step.");
    expect((await read()).steps[5].status).toBe("proposed");
    await a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: publish.id, approve: true, confirmWord: "PUBLISH" });
    trail = await read();
    expect(trail.task).toMatchObject({ status: "done", steps: 6 });
    expect(trail.steps[5]).toMatchObject({ status: "done", decidedBy: "Alpha-owner" });

    // The development story draws this same data. Regenerate with VISTRIAL_WRITE_FIXTURE=1.
    if (process.env.VISTRIAL_WRITE_FIXTURE) {
      const { writeFileSync } = await import("node:fs");
      const second = await a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" });
      const change = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId: second });
      for (let i = 2; i < 5; i += 1) await a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: (await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId: second })).steps[i].id, approve: true });
      const restricted = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId: second });
      const third = await a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "wander" });
      const blockedTrail = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId: third });
      const overview = await a.owner.query(api.browserAccess.overview, { workspaceId: a.workspaceId });
      writeFileSync("src/app/dev/browser-access/fixture.json", `${JSON.stringify({ overview, done: trail, change, restricted, blocked: blockedTrail }, null, 1)}\n`);
    }
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const actions = audit.map((row) => row.action).filter((action) => action.startsWith("browser."));
    expect(actions).toEqual(["browser.session.started", "browser.session.signedIn", "browser.task.started", "browser.step.approved", "browser.step.approved", "browser.step.approved", "browser.step.approvedRestricted"]);
  });

  it("treats a step by what it does, not what the driver calls it, and stops when a step is declined", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const sessionId = await signedIn(a);
    const browserTaskId = await a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "pipeline" });
    const read = () => a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId });
    await a.manager.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: (await read()).steps[2].id, approve: true });
    // The driver called "Send follow-up email" a read. It was not done: it is restricted and waits for the Owner.
    let trail = await read();
    expect(trail.steps[3]).toMatchObject({ kind: "restricted", status: "proposed", restricted: { reason: "message", confirm: "SEND" } });
    await a.manager.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: trail.steps[3].id, approve: false });
    trail = await read();
    expect(trail.task).toMatchObject({ status: "stopped", stopReason: "declined", stopWords: "A step was declined, so the task stopped." });
    expect(trail.steps[3]).toMatchObject({ status: "declined", decidedBy: "Alpha-manager" });
    // The delete step that would have followed was never proposed.
    expect(trail.steps).toHaveLength(4);
  });

  it("blocks a step that leaves the approved site, and nothing after it runs", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const sessionId = await signedIn(a);
    const browserTaskId = await a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "wander" });
    const trail = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId });
    expect(trail.steps.map((row) => row.status)).toEqual(["done", "blocked"]);
    expect(trail.steps[1].blocked).toBe("The step would leave the site this session was approved for, so it was not taken.");
    expect(trail.task).toMatchObject({ status: "stopped", stopReason: "blocked" });
  });

  it("ends everything when the Owner revokes, when the session expires, and when nobody answers", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const sessionId = await signedIn(a);
    const waiting = async () => {
      const browserTaskId = await a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" });
      const trail = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId });
      return { browserTaskId, stepId: trail.steps[2].id };
    };

    // Nobody decides within a day: the step is dropped and the task stops. Silence approves nothing.
    const quiet = await waiting();
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    const timedOut = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId: quiet.browserTaskId });
    expect(timedOut.task.stopReason).toBe("approval_timed_out");
    expect(timedOut.steps[2].status).toBe("expired");
    expect(await message(a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: quiet.stepId, approve: true }))).toBe("This step is no longer waiting for a decision.");

    // The session expires after seven days: a waiting step can no longer be approved, and no task can start.
    const stale = await waiting();
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    await t.run((ctx) => ctx.db.patch(sessionId, { expiresAt: Date.now() - 1 }));
    expect((await a.owner.query(api.browserAccess.overview, { workspaceId: a.workspaceId })).sessions[0].state).toBe("expired");
    expect(await message(a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: stale.stepId, approve: true }))).toBe("The session expired before this was approved. Nothing was done.");
    expect(await message(a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" }))).toBe("This session expired. An Owner signs in again to continue.");

    // Revoking stops a waiting task at once.
    const fresh = await signedIn(a);
    expect(fresh).not.toBe(sessionId);
    const browserTaskId = await a.manager.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId: fresh, goalKey: "headline" });
    const before = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId });
    await a.owner.mutation(api.browserAccess.revoke, { workspaceId: a.workspaceId, sessionId: fresh });
    const after = await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId });
    expect(after.task).toMatchObject({ status: "stopped", stopReason: "revoked" });
    expect(await message(a.owner.mutation(api.browserAccess.decide, { workspaceId: a.workspaceId, stepId: before.steps[2].id, approve: true }))).toBe("This step is no longer waiting for a decision.");
    expect(await message(a.manager.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId: fresh, goalKey: "headline" }))).toBe("This session is not signed in.");
    expect(DRY_RUN_GOALS.map((goal) => goal.key)).toEqual(["headline", "pipeline", "wander"]);
  });

  it("never crosses workspaces", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const sessionId = await signedIn(a);
    const browserTaskId = await a.owner.mutation(api.browserAccess.startTask, { workspaceId: a.workspaceId, sessionId, goalKey: "headline" });
    const stepId = (await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId })).steps[2].id;
    for (const workspaceId of [b.workspaceId, a.workspaceId]) {
      expect(await message(b.owner.query(api.browserAccess.trail, { workspaceId, browserTaskId }))).toBe(NOT_FOUND);
      expect(await message(b.owner.mutation(api.browserAccess.decide, { workspaceId, stepId, approve: true }))).toBe(NOT_FOUND);
      expect(await message(b.owner.mutation(api.browserAccess.revoke, { workspaceId, sessionId }))).toBe(NOT_FOUND);
      expect(await message(b.owner.mutation(api.browserAccess.startTask, { workspaceId, sessionId, goalKey: "headline" }))).toBe(NOT_FOUND);
      expect(await message(b.owner.mutation(api.browserAccess.stop, { workspaceId, browserTaskId }))).toBe(NOT_FOUND);
    }
    expect((await b.owner.query(api.browserAccess.overview, { workspaceId: b.workspaceId })).sessions).toEqual([]);
    expect((await a.owner.query(api.browserAccess.trail, { workspaceId: a.workspaceId, browserTaskId })).steps[2].status).toBe("proposed");
  });
});
