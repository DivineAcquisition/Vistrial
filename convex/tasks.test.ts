/**
 * @vitest-environment edge-runtime
 *
 * Step 2's data and rules: the one approvals model (assets, connected-account steps and agent tasks decided
 * through one door and recorded once), who may decide, the spending limit, a task's status transitions,
 * the honesty rules on an expected return, notes to self, and that a Member sees only their clients.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CLAIM_WORDS, TRANSITIONS, canMove, claimsResult, cleanExpectedReturn, expectedReturnWords, rankTasks, taskState, type TaskLinks } from "./lib/agentTasks";
import { OWNER_ONLY_WORDS, mayDecide, needsApproval } from "./lib/approvals";
import { post } from "./lib/briefing";
import { priceFor } from "./lib/credits";
import { SKILL_CAPS } from "./lib/caps";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { TASK_STATUSES } from "./lib/taskShapes";
import { weekKey } from "./planner";
import { readChoice, settlePicks, settleSummary, type Candidate, type PlanRecord } from "./skills/taskProposer/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const newTest = () => convexTest(schema, modules);
type Tester = ReturnType<typeof newTest>;
const AGENT = "growth-architect";
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

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

/** Northlight Growth, an agency: Nora owns it, Ada is an Admin, Milo a Member assigned to Aster Coaching only, Vera a Viewer. */
async function agency(t: Tester) {
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight Growth" });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  const join = async (subject: string, role: "admin" | "member" | "viewer") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  const admin = await join("ada", "admin");
  const member = await join("milo", "member");
  const viewer = await join("vera", "viewer");
  const aster = await owner.mutation(api.clients.create, { workspaceId, type: "business", name: "Aster Coaching" });
  const harbor = await owner.mutation(api.clients.create, { workspaceId, type: "business", name: "Harbor Dental" });
  const people = await owner.query(api.settings.people, { workspaceId });
  for (const name of ["milo", "vera"]) {
    await owner.mutation(api.clients.setAssigned, { workspaceId, clientId: aster, memberId: people.members.find((row) => row.name === name)!.id, assigned: true });
  }
  return { owner, admin, member, viewer, workspaceId, aster, harbor };
}

const audit = (t: Tester) => t.run(async (ctx) => (await ctx.db.query("auditLog").collect()).map((row) => row.action));
const approvals = (t: Tester) => t.run(async (ctx) => ctx.db.query("approvals").collect());
const cardsOf = (board: { columns: { column: string; cards: { title: string }[] }[] }, column: string) => board.columns.find((row) => row.column === column)!.cards.map((card) => card.title);

describe("the approval rule", () => {
  it("always asks for publishing, account changes, housekeeping and agent tasks, and for spending only above the limit", () => {
    for (const kind of ["publish", "accountChange", "housekeeping", "task"] as const) expect(needsApproval({ kind, credits: 0, limit: 10_000 })).toBe(true);
    expect(needsApproval({ kind: "spend", credits: 900, limit: 500 })).toBe(true);
    expect(needsApproval({ kind: "spend", credits: 500, limit: 500 })).toBe(false);
    // No limit set: the agent caps alone apply.
    expect(needsApproval({ kind: "spend", credits: 90_000, limit: null })).toBe(false);
    expect(needsApproval({ kind: "spend", credits: 90_000 })).toBe(false);
  });

  it("lets Owners and Admins decide, an Owner alone when it says so, and never a Member or Viewer", () => {
    expect(["owner", "admin", "member", "viewer", "manager", "rep"].map((role) => mayDecide(role, {}))).toEqual([true, true, false, false, true, false]);
    expect(["owner", "admin", "member", "viewer"].map((role) => mayDecide(role, { ownerOnly: true }))).toEqual([true, false, false, false]);
  });
});

describe("a task's rules", () => {
  it("moves only along the allowed transitions", () => {
    expect(canMove("proposed", "approved")).toBe(true);
    expect(canMove("proposed", "running")).toBe(false);
    expect(canMove("proposed", "done")).toBe(false);
    expect(canMove("approved", "running")).toBe(true);
    expect(canMove("running", "proposed")).toBe(false);
    expect(canMove("done", "needsYou")).toBe(true);
    expect(canMove("declined", "proposed")).toBe(true);
    expect(canMove("declined", "approved")).toBe(false);
    // Every status is in the table, and nothing can go back to proposed except a skipped task.
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...TASK_STATUSES].sort());
    expect(TASK_STATUSES.filter((status) => TRANSITIONS[status].includes("proposed"))).toEqual(["declined"]);
  });

  it("refuses wording that claims a result", () => {
    for (const text of ["This will increase booked calls by 30%", "A proven way to fill the calendar", "Guaranteed results in 14 days", "We will double your revenue", "3x your pipeline", "It is certain to work", "We guarantee more calls"]) {
      expect(claimsResult(text), text).toBe(true);
    }
    for (const text of ["Expected to add 4 to 9 booked calls a month", "Competitors lead with a guarantee; test one", "May improve the reply rate", "Check back in 30 days"]) {
      expect(claimsResult(text), text).toBe(false);
    }
  });

  it("stores an expected return only as a range with its basis, or as not enough data", async () => {
    expect(cleanExpectedReturn({ basis: "insufficient", low: 4, high: 9, metric: "booked calls" })).toEqual({ basis: "insufficient" });
    expect(cleanExpectedReturn({ basis: "firstParty", low: 4, high: 9, metric: " booked  calls " })).toEqual({ basis: "firstParty", low: 4, high: 9, metric: "booked calls", period: "month" });
    // A single number is not a range.
    expect(await message(Promise.resolve().then(() => cleanExpectedReturn({ basis: "inferred", low: 9, high: 9, metric: "booked calls" })))).toContain("range");
    expect(await message(Promise.resolve().then(() => cleanExpectedReturn({ basis: "inferred", low: 9, metric: "booked calls" })))).toContain("both ends");
    expect(await message(Promise.resolve().then(() => cleanExpectedReturn({ basis: "inferred", low: 4, high: 9 })))).toContain("measured in");
    expect(await message(Promise.resolve().then(() => cleanExpectedReturn({ basis: "inferred", low: 4, high: 9, metric: "guaranteed calls" })))).toBe(CLAIM_WORDS);
    expect(expectedReturnWords({ basis: "firstParty", low: 4, high: 9, metric: "booked calls", period: "month" })).toEqual({ text: "4 to 9 more booked calls a month", basis: "Your data" });
    expect(expectedReturnWords({ basis: "inferred", low: 1.5, high: 3, metric: "new clients", period: "quarter" })).toEqual({ text: "1.5 to 3 more new clients a quarter", basis: "Inference" });
    expect(expectedReturnWords({ basis: "insufficient" })).toEqual({ text: "Not enough data", basis: "Not enough data" });
  });

  it("ranks a column by expected return, an inference by its cautious end, your data first at the same size, not enough data last", () => {
    const task = (name: string, expectedReturn: Parameters<typeof cleanExpectedReturn>[0], creditCost = 100, createdAt = 1) => ({ name, expectedReturn, creditCost, createdAt });
    const ranked = rankTasks([
      task("unknown", { basis: "insufficient" }),
      task("small", { basis: "inferred", low: 1, high: 3, metric: "booked calls" }),
      // Your data counts for its middle: 10 a month.
      task("measured", { basis: "firstParty", low: 8, high: 12, metric: "booked calls" }),
      // An inference counts for its low end. 2 to 4 a week is about 8.7 to 17 a month: its middle is above
      // the measured range, its low end is not, so measured ranks first.
      task("weekly estimate", { basis: "inferred", low: 2, high: 4, metric: "booked calls", period: "week" }),
      // Its low end alone clears the measured range's middle.
      task("large estimate", { basis: "inferred", low: 11, high: 30, metric: "booked calls" }),
      // The same size as "measured" (low end 10), but estimated: after it.
      task("same size, estimated", { basis: "inferred", low: 10, high: 20, metric: "booked calls" }, 20),
      task("small but cheaper", { basis: "inferred", low: 1, high: 3, metric: "booked calls" }, 20),
      task("unknown, newer", { basis: "insufficient" }, 100, 5),
    ]);
    expect(ranked.map((row) => row.name)).toEqual(["large estimate", "measured", "same size, estimated", "weekly estimate", "small but cheaper", "small", "unknown, newer", "unknown"]);
  });

  it("reads where a task stands from what it is linked to", () => {
    const none: TaskLinks = { intake: null, run: null, asset: null, decision: null };
    const now = 1_000_000;
    expect(taskState("proposed", none, now).column).toBe("proposed");
    expect(taskState("declined", none, now).column).toBeNull();
    expect(taskState("approved", none, now).column).toBe("approved");
    expect(taskState("approved", { ...none, intake: { status: "chatting" } }, now)).toMatchObject({ column: "needsYou", status: "needsYou" });
    expect(taskState("needsYou", { ...none, intake: { status: "started" }, run: { status: "running" } }, now).column).toBe("running");
    expect(taskState("running", { ...none, run: { status: "waiting" } }, now).column).toBe("needsYou");
    expect(taskState("running", { ...none, run: { status: "completed" }, asset: { status: "draft" } }, now)).toMatchObject({ column: "needsYou", note: "A draft is ready to review." });
    expect(taskState("needsYou", { ...none, run: { status: "completed" }, asset: { status: "approved" } }, now).column).toBe("done");
    expect(taskState("running", { ...none, run: { status: "failed" } }, now).column).toBe("needsYou");
    // A change being tried waits in Approved until its check-in, then asks, and only a recorded outcome is a Result.
    expect(taskState("approved", { ...none, decision: { checkInAt: now + 5, outcome: false } }, now).column).toBe("approved");
    expect(taskState("approved", { ...none, decision: { checkInAt: now - 5, outcome: false } }, now).column).toBe("needsYou");
    expect(taskState("approved", { ...none, decision: { checkInAt: now - 5, outcome: true } }, now).column).toBe("result");
    expect(taskState("done", none, now).column).toBe("done");
    expect(TASK_STATUSES.every((status) => taskState(status, none, now).status === status)).toBe(true);
  });
});

describe("tasks on the board", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const proposal = { title: "Research what coaching competitors charge", why: "The last report is four months old.", ask: "What do executive coaching competitors charge for a twelve week program?", skillSlug: "market-intelligence" };

  it("lets a Member propose, only an Owner or Admin approve, and starts the agent's conversation on approval", async () => {
    const t = newTest();
    const { owner, admin, member, viewer, workspaceId, aster } = await agency(t);
    expect(await message(viewer.mutation(api.agentTasks.propose, { workspaceId, ...proposal }))).toBe(NOT_ALLOWED);
    expect(await message(member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, title: "This will double booked calls" }))).toBe(CLAIM_WORDS);
    expect(await message(member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, skillSlug: "creative-production" }))).toContain("cannot be started from a task");
    // Work is for one agent. An agent with no chat cannot take work from a task, and one agent's skill is not another's.
    expect(await message(member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, agentSlug: "sales-conversion" }))).toContain("cannot take work from a task");
    expect(await message(member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, agentSlug: "sales-conversion", skillSlug: undefined }))).toContain("cannot take work from a task");
    expect(await message(member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, agentSlug: "growth-architect", skillSlug: "follow-up-engine" }))).toContain("cannot be started from a task");
    const taskId = await member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, clientId: aster, expectedReturn: { basis: "inferred", low: 2, high: 5, metric: "booked calls" } });

    const board = await member.query(api.agentTasks.board, { workspaceId });
    expect(cardsOf(board, "proposed")).toEqual([proposal.title]);
    const card = board.columns[0].cards[0];
    // The card shows the return as a range with its basis, the most credits the work can use, and who it is for.
    expect(card).toMatchObject({ client: "Aster Coaching", by: "person", type: "work", skill: "Strategist · Research", creditCost: priceFor(SKILL_CAPS["market-intelligence"].maxCostCentsPerRun), expectedReturn: { text: "2 to 5 more booked calls a month", basis: "Inference", known: true } });
    expect(board).toMatchObject({ canApprove: false, canWork: true });
    expect((await viewer.query(api.agentTasks.board, { workspaceId })).canWork).toBe(false);

    // A Member may edit the words of a proposed task, and may not decide it.
    await member.mutation(api.agentTasks.edit, { workspaceId, agentTaskId: taskId, why: "The last report is four months old and two competitors changed their pricing pages." });
    expect(await message(member.mutation(api.agentTasks.edit, { workspaceId, agentTaskId: taskId, why: "Proven to work." }))).toBe(CLAIM_WORDS);
    const approvalId = card.approvalId!;
    for (const who of [member, viewer]) expect(await message(who.mutation(api.approvals.decide, { workspaceId, approvalId, approve: true }))).toBe(NOT_ALLOWED);
    expect((await approvals(t))[0]).toMatchObject({ status: "waiting", kind: "task", requestedBy: "milo", clientId: aster });

    expect(await admin.mutation(api.approvals.decide, { workspaceId, approvalId, approve: true })).toEqual({ status: "approved" });
    const decided = (await approvals(t))[0];
    expect(decided).toMatchObject({ status: "approved", decidedBy: "ada" });
    expect(decided.decidedAt).toBeGreaterThan(0);
    expect(await audit(t)).toEqual(expect.arrayContaining(["task.proposed", "approval.requested.task", "task.edited", "task.approved", "approval.approved.task"]));
    // Deciding twice is refused: one decision about one thing.
    expect(await message(owner.mutation(api.approvals.decide, { workspaceId, approvalId, approve: false }))).toContain("no longer waiting");

    // The agent's conversation exists, for the task's client, and the task waits on its questions.
    const after = await owner.query(api.agentTasks.board, { workspaceId });
    expect(cardsOf(after, "proposed")).toEqual([]);
    expect(cardsOf(after, "needsYou")).toEqual([proposal.title]);
    const task = await t.run((ctx) => ctx.db.get(taskId));
    const intake = await t.run((ctx) => ctx.db.get(task!.intakeId!));
    expect(intake).toMatchObject({ clientId: aster, agentSlug: AGENT });
    expect(after.columns.find((row) => row.column === "needsYou")!.cards[0].link?.href).toContain(`/work/chat?c=${task!.intakeId}`);
    // An approved task can no longer be edited.
    expect(await message(member.mutation(api.agentTasks.edit, { workspaceId, agentTaskId: taskId, title: "Different" }))).toContain("Only a proposed task");
  });

  it("skips a task with a reason, lists it apart, and lets it be proposed again", async () => {
    const t = newTest();
    const { owner, member, workspaceId } = await agency(t);
    const taskId = await member.mutation(api.agentTasks.propose, { workspaceId, ...proposal });
    const approvalId = (await owner.query(api.agentTasks.board, { workspaceId })).columns[0].cards[0].approvalId!;
    await owner.mutation(api.approvals.decide, { workspaceId, approvalId, approve: false, reason: "Not this month." });
    const board = await owner.query(api.agentTasks.board, { workspaceId });
    expect(board.columns.every((row) => row.cards.length === 0)).toBe(true);
    expect(board.skipped).toMatchObject([{ title: proposal.title, skippedReason: "Not this month." }]);
    expect((await approvals(t))[0]).toMatchObject({ status: "declined", decidedBy: "nora" });

    await member.mutation(api.agentTasks.reopen, { workspaceId, agentTaskId: taskId });
    const again = await owner.query(api.agentTasks.board, { workspaceId });
    expect(cardsOf(again, "proposed")).toEqual([proposal.title]);
    expect((await approvals(t)).map((row) => row.status).sort()).toEqual(["declined", "waiting"]);
    expect(await message(member.mutation(api.agentTasks.reopen, { workspaceId, agentTaskId: taskId }))).toBe(NOT_ALLOWED);
  });

  it("shows a Member only the tasks, approvals and Briefing posts of their own clients", async () => {
    const t = newTest();
    const { owner, member, viewer, workspaceId, aster, harbor } = await agency(t);
    await owner.mutation(api.agentTasks.propose, { workspaceId, ...proposal, title: "For Aster", clientId: aster });
    const hidden = await owner.mutation(api.agentTasks.propose, { workspaceId, ...proposal, title: "For Harbor", clientId: harbor });
    await owner.mutation(api.agentTasks.propose, { workspaceId, ...proposal, title: "For Northlight itself" });
    for (const who of [member, viewer]) {
      expect(cardsOf(await who.query(api.agentTasks.board, { workspaceId }), "proposed").sort()).toEqual(["For Aster", "For Northlight itself"]);
      expect((await who.query(api.approvals.waiting, { workspaceId })).items.map((row) => row.summary).sort()).toEqual(["For Aster", "For Northlight itself"]);
    }
    expect(cardsOf(await owner.query(api.agentTasks.board, { workspaceId }), "proposed")).toHaveLength(3);
    // The picker narrows it for anyone, and never widens it.
    expect(cardsOf(await owner.query(api.agentTasks.board, { workspaceId, scope: harbor }), "proposed")).toEqual(["For Harbor"]);
    expect(cardsOf(await owner.query(api.agentTasks.board, { workspaceId, scope: "own" }), "proposed")).toEqual(["For Northlight itself"]);
    expect(cardsOf(await member.query(api.agentTasks.board, { workspaceId, scope: harbor }), "proposed")).toEqual([]);
    // A task of a client the Member is not assigned to does not exist for them, and nothing can be made for that client.
    expect(await message(member.mutation(api.agentTasks.edit, { workspaceId, agentTaskId: hidden, title: "Mine now" }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.agentTasks.propose, { workspaceId, ...proposal, clientId: harbor }))).toBe(NOT_FOUND);
    // Another organization's task is not found either.
    const other = t.withIdentity(person("ben"));
    const otherWorkspace = await other.mutation(api.workspace.create, { name: "Beacon Coaching" });
    expect(await message(other.mutation(api.agentTasks.edit, { workspaceId: otherWorkspace, agentTaskId: hidden, title: "Taken" }))).toBe(NOT_FOUND);
    expect(await message(other.query(api.agentTasks.board, { workspaceId }))).toBe(NOT_FOUND);
    const theirs = (await approvals(t))[0]._id;
    expect(await message(other.mutation(api.approvals.decide, { workspaceId: otherWorkspace, approvalId: theirs, approve: true }))).toBe(NOT_FOUND);
  });
});

describe("the spending limit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const project = (workspaceId: Id<"workspaces">) => ({ workspaceId, title: "Coaching prices", objective: "What do coaching competitors charge?", market: "Executive coaching", geography: "US", competitors: [], platforms: ["web" as const], suppliedUrls: [] });

  it("is set by an Owner or Admin, in credits, and removed again", async () => {
    const t = newTest();
    const { owner, admin, member, viewer, workspaceId } = await agency(t);
    expect(await owner.query(api.approvals.settings, { workspaceId })).toMatchObject({ spendApprovalCredits: null, weeklyPlan: true, trendPosts: false, canEdit: true });
    for (const who of [member, viewer]) expect(await message(who.mutation(api.approvals.setSpendLimit, { workspaceId, credits: 500 }))).toBe(NOT_ALLOWED);
    expect(await message(admin.mutation(api.approvals.setSpendLimit, { workspaceId, credits: 0 }))).toContain("whole number of credits");
    expect(await message(admin.mutation(api.approvals.setSpendLimit, { workspaceId, credits: 12.5 }))).toContain("whole number of credits");
    await admin.mutation(api.approvals.setSpendLimit, { workspaceId, credits: 500 });
    expect(await member.query(api.approvals.settings, { workspaceId })).toMatchObject({ spendApprovalCredits: 500, canEdit: false });
    await owner.mutation(api.approvals.setSwitch, { workspaceId, key: "trendPosts", on: true });
    await owner.mutation(api.approvals.setSwitch, { workspaceId, key: "weeklyPlan", on: false });
    expect(await owner.query(api.approvals.settings, { workspaceId })).toMatchObject({ weeklyPlan: false, trendPosts: true });
    await owner.mutation(api.approvals.setSpendLimit, { workspaceId, credits: null });
    expect((await owner.query(api.approvals.settings, { workspaceId })).spendApprovalCredits).toBeNull();
    expect(await audit(t)).toEqual(expect.arrayContaining(["settings.spendLimit.set", "settings.spendLimit.removed", "settings.trendPosts.on", "settings.weeklyPlan.off"]));
  });

  it("stops a Member's work above the limit until an Owner or Admin approved it, and one approval covers one run", async () => {
    const t = newTest();
    const { owner, admin, member, workspaceId } = await agency(t);
    const start = (who: typeof member, projectId: Id<"researchProjects">) => who.mutation(api.runs.start, { workspaceId, agentSlug: AGENT, skillSlug: "market-intelligence", projectId });
    const first = await member.mutation(api.research.createProject, project(workspaceId));
    // No limit set: a Member starts work inside the agent caps, as before.
    const free = await start(member, first);
    await member.mutation(api.runs.stop, { workspaceId, runId: free });

    await admin.mutation(api.approvals.setSpendLimit, { workspaceId, credits: 500 });
    const second = await member.mutation(api.research.createProject, project(workspaceId));
    const refusal = await message(start(member, second));
    expect(refusal).toContain("This can use up to 900 credits");
    expect(refusal).toContain("Work above 500 credits waits for an Owner or Admin");
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(1);

    // An Owner or Admin starting the same work is their own decision.
    const byAdmin = await start(admin, second);
    await admin.mutation(api.runs.stop, { workspaceId, runId: byAdmin });

    // The Member proposes it as a task; once approved, their run goes ahead, once.
    await member.mutation(api.agentTasks.propose, { workspaceId, title: "Research coaching prices", why: "Pricing pages changed.", ask: "What do coaching competitors charge?", skillSlug: "market-intelligence" });
    const waiting = (await owner.query(api.approvals.waiting, { workspaceId })).items[0];
    expect(waiting).toMatchObject({ kind: "task", credits: 900, canDecide: true });
    const third = await member.mutation(api.research.createProject, project(workspaceId));
    expect(await message(start(member, third))).toContain("waits for an Owner or Admin");
    await owner.mutation(api.approvals.decide, { workspaceId, approvalId: waiting.id, approve: true });
    const runId = await start(member, third);
    expect((await approvals(t)).find((row) => row._id === waiting.id)).toMatchObject({ status: "approved", usedByRun: runId });
    await member.mutation(api.runs.stop, { workspaceId, runId });
    const fourth = await member.mutation(api.research.createProject, project(workspaceId));
    expect(await message(start(member, fourth))).toContain("waits for an Owner or Admin");

    // A limit above what the work can use changes nothing.
    await admin.mutation(api.approvals.setSpendLimit, { workspaceId, credits: 900 });
    await start(member, fourth);
  });
});

describe("one approvals model", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function draft(t: Tester, workspaceId: Id<"workspaces">, title: string, clientId?: Id<"clients">) {
    return t.run(async (ctx) => {
      const assetId = await ctx.db.insert("assets", { workspaceId, ...(clientId ? { clientId } : {}), kind: "adCopySet", title, status: "draft", currentVersion: 1, createdAt: Date.now() });
      await ctx.db.insert("assetVersions", { workspaceId, assetId, version: 1, body: "Four headlines.", createdBy: "agent" });
      return assetId;
    });
  }
  const queue = (t: Tester) => t.run(async (ctx) => {
    await ctx.scheduler.runAfter(0, (await import("./_generated/api")).internal.approvals.backfill, {});
  });
  async function settle(t: Tester) {
    for (let i = 0; i < 4; i += 1) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
  }

  it("records an asset's approval once, with who and when, whichever door is used", async () => {
    const t = newTest();
    const { owner, admin, member, workspaceId, aster } = await agency(t);
    const viaQueue = await draft(t, workspaceId, "Aster ad copy", aster);
    const viaPage = await draft(t, workspaceId, "Northlight ad copy");
    const declined = await draft(t, workspaceId, "Weak ad copy");
    // Drafts that were waiting before approvals existed are put in the queue once; running it again adds nothing.
    await queue(t);
    await settle(t);
    await queue(t);
    await settle(t);
    const waiting = (await owner.query(api.approvals.waiting, { workspaceId })).items;
    expect(waiting.map((row) => row.summary).sort()).toEqual(["Aster ad copy", "Northlight ad copy", "Weak ad copy"]);
    expect(waiting.every((row) => row.kind === "publish" && row.needsReason && row.canDecide)).toBe(true);
    expect((await member.query(api.approvals.waiting, { workspaceId })).items.every((row) => !row.canDecide)).toBe(true);
    const idOf = (title: string) => waiting.find((row) => row.summary === title)!.id;

    // Through the queue (the Briefing, the board).
    expect(await message(member.mutation(api.approvals.decide, { workspaceId, approvalId: idOf("Aster ad copy"), approve: true }))).toBe(NOT_ALLOWED);
    await admin.mutation(api.approvals.decide, { workspaceId, approvalId: idOf("Aster ad copy"), approve: true });
    expect((await t.run((ctx) => ctx.db.get(viaQueue)))!.status).toBe("approved");
    // Through the asset page, as before.
    await owner.mutation(api.assets.approve, { workspaceId, assetId: viaPage });
    // Declining a draft needs a reason, which is saved as feedback.
    expect(await message(owner.mutation(api.approvals.decide, { workspaceId, approvalId: idOf("Weak ad copy"), approve: false }))).toContain("Say why");
    await owner.mutation(api.approvals.decide, { workspaceId, approvalId: idOf("Weak ad copy"), approve: false, reason: "The offer is wrong." });
    expect((await t.run((ctx) => ctx.db.get(declined)))!.status).toBe("rejected");

    const rows = await approvals(t);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => `${row.summary}:${row.status}:${row.decidedBy}`).sort()).toEqual(["Aster ad copy:approved:ada", "Northlight ad copy:approved:nora", "Weak ad copy:declined:nora"]);
    expect(rows.every((row) => (row.decidedAt ?? 0) > 0)).toBe(true);
    expect((await owner.query(api.approvals.waiting, { workspaceId })).items).toEqual([]);
    expect(await audit(t)).toEqual(expect.arrayContaining(["asset.approved", "asset.rejected", "approval.approved.publish", "approval.declined.publish"]));

    // An asset approved through its own page with nothing waiting still leaves a record.
    const late = await draft(t, workspaceId, "Late ad copy");
    await owner.mutation(api.assets.approve, { workspaceId, assetId: late });
    expect((await approvals(t)).find((row) => row.subjectId === late)).toMatchObject({ status: "approved", decidedBy: "nora", kind: "publish" });
    // A new version waits for approval again, as a new row.
    await owner.mutation(api.assets.addVersion, { workspaceId, assetId: late, body: "Five headlines.", claims: [] });
    expect((await approvals(t)).filter((row) => row.subjectId === late).map((row) => row.status).sort()).toEqual(["approved", "waiting"]);
  });

  it("puts a change in a connected account in the same queue, and keeps a restricted step for the Owner and the typed word", async () => {
    const t = newTest();
    const { owner, admin, member, workspaceId } = await agency(t);
    const sessionId = await owner.mutation(api.browserAccess.connect, { workspaceId, site: "demo-crm" });
    await owner.mutation(api.browserAccess.completeSignIn, { workspaceId, sessionId });
    await admin.mutation(api.browserAccess.startTask, { workspaceId, sessionId, goalKey: "headline" });
    const next = async () => (await owner.query(api.approvals.waiting, { workspaceId })).items;

    // Three ordinary changes: an Admin approves each from the queue, one at a time.
    for (let step = 0; step < 3; step += 1) {
      const [item] = await next();
      expect(item).toMatchObject({ kind: "accountChange", ownerOnly: false, confirm: null });
      expect(await message(member.mutation(api.approvals.decide, { workspaceId, approvalId: item.id, approve: true }))).toBe(NOT_ALLOWED);
      await admin.mutation(api.approvals.decide, { workspaceId, approvalId: item.id, approve: true });
    }
    // Publishing is restricted: the Owner alone, with the word typed.
    const [publish] = await next();
    expect(publish).toMatchObject({ kind: "accountChange", ownerOnly: true });
    expect(publish.confirm?.word).toBeTruthy();
    expect((await admin.query(api.approvals.waiting, { workspaceId })).items[0].canDecide).toBe(false);
    expect(await message(admin.mutation(api.approvals.decide, { workspaceId, approvalId: publish.id, approve: true, confirmWord: publish.confirm!.word }))).toBe(OWNER_ONLY_WORDS);
    expect(await message(owner.mutation(api.approvals.decide, { workspaceId, approvalId: publish.id, approve: true }))).toContain(`Type ${publish.confirm!.word}`);
    await owner.mutation(api.approvals.decide, { workspaceId, approvalId: publish.id, approve: true, confirmWord: publish.confirm!.word });
    expect(await next()).toEqual([]);
    const rows = await approvals(t);
    expect(rows.map((row) => `${row.status}:${row.decidedBy}`)).toEqual(["approved:ada", "approved:ada", "approved:ada", "approved:nora"]);

    // Declining from the connected-account page is recorded in the same place, and a stopped task's wait ends.
    await admin.mutation(api.browserAccess.startTask, { workspaceId, sessionId, goalKey: "headline" });
    const steps = await t.run(async (ctx) => (await ctx.db.query("browserSteps").collect()).filter((row) => row.status === "proposed"));
    await admin.mutation(api.browserAccess.decide, { workspaceId, stepId: steps[0]._id, approve: false });
    expect((await approvals(t)).at(-1)).toMatchObject({ status: "declined", decidedBy: "ada" });
    expect(await next()).toEqual([]);
  });
});

describe("notes to self", () => {
  it("are read only by their author, whatever their role, and a Viewer can keep them", async () => {
    const t = newTest();
    const { owner, member, viewer, workspaceId, aster, harbor } = await agency(t);
    const mine = await viewer.mutation(api.personalNotes.add, { workspaceId, body: "  Ask Nora about the Aster renewal  ", clientId: aster });
    await owner.mutation(api.personalNotes.add, { workspaceId, body: "Call the accountant" });
    expect(await viewer.query(api.personalNotes.mine, { workspaceId })).toMatchObject([{ body: "Ask Nora about the Aster renewal", done: false, client: "Aster Coaching" }]);
    expect((await owner.query(api.personalNotes.mine, { workspaceId })).map((row) => row.body)).toEqual(["Call the accountant"]);
    expect(await member.query(api.personalNotes.mine, { workspaceId })).toEqual([]);
    // Nobody else can change or remove it, an Owner included.
    for (const who of [owner, member]) {
      expect(await message(who.mutation(api.personalNotes.update, { workspaceId, personalNoteId: mine, done: true }))).toBe(NOT_FOUND);
      expect(await message(who.mutation(api.personalNotes.remove, { workspaceId, personalNoteId: mine }))).toBe(NOT_FOUND);
    }
    expect(await message(viewer.mutation(api.personalNotes.add, { workspaceId, body: "   " }))).toContain("Write the note");
    // A note cannot name a client its author may not see.
    expect(await message(viewer.mutation(api.personalNotes.add, { workspaceId, body: "About Harbor", clientId: harbor }))).toBe(NOT_FOUND);
    await viewer.mutation(api.personalNotes.update, { workspaceId, personalNoteId: mine, done: true });
    expect((await viewer.query(api.personalNotes.mine, { workspaceId }))[0].done).toBe(true);
    await viewer.mutation(api.personalNotes.remove, { workspaceId, personalNoteId: mine });
    expect(await viewer.query(api.personalNotes.mine, { workspaceId })).toEqual([]);
  });
});

describe("the Briefing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const upload = (t: Tester, workspaceId: Id<"workspaces">, label: string, conversions: number, clientId?: Id<"clients">) =>
    t.run(async (ctx) => {
      await ctx.db.insert("resultUploads", { workspaceId, ...(clientId ? { clientId } : {}), fileName: `${label}.csv`, label, currency: "USD", uploadedBy: "nora", createdAt: Date.now(), status: "ready", summary: { rows: 3, dateStart: "2026-10-01", dateStop: "2026-10-31", metrics: ["conversions"], totals: { conversions }, groupBy: null, groups: [], otherGroups: 0, ignoredColumns: [] } });
    });
  const sweep = async (t: Tester) => {
    await t.mutation(internal.briefing.sweep, {});
  };

  it("lists posts newest first with their approval, filters by kind and agent, and counts what is new for each person", async () => {
    const t = newTest();
    const { owner, member, viewer, workspaceId, aster, harbor } = await agency(t);
    await member.mutation(api.agentTasks.propose, { workspaceId, title: "Research coaching prices", why: "Pricing pages changed.", ask: "What do coaching competitors charge?", skillSlug: "market-intelligence", clientId: aster });
    await owner.mutation(api.agentTasks.propose, { workspaceId, title: "Research dental plans", why: "Harbor asked.", ask: "What do dental membership plans cost?", skillSlug: "market-intelligence", clientId: harbor });
    const assetId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("assets", { workspaceId, kind: "adCopySet", title: "Northlight ad copy", status: "draft", currentVersion: 1, createdAt: Date.now() });
      await ctx.db.insert("assetVersions", { workspaceId, assetId: id, version: 1, body: "Four headlines for the retainer offer.", createdBy: "agent" });
      return id;
    });
    await owner.mutation(api.assets.addVersion, { workspaceId, assetId, body: "Five headlines for the retainer offer.", claims: [] });

    const all = await owner.query(api.briefing.feed, { workspaceId });
    expect(all.items.map((row) => row.kind)).toEqual(["draft", "approval", "approval"]);
    expect(all).toMatchObject({ unread: 3, total: 3, counts: { approval: 2, draft: 1, alert: 0 } });
    // A draft can be read where it is posted, and decided there by someone who may.
    expect(all.items[0]).toMatchObject({ kindLabel: "Draft to review", href: `/app/assets/${assetId}`, draft: { text: "Five headlines for the retainer offer.", version: 2 }, approval: { kind: "publish", canDecide: true, needsReason: true } });
    expect(all.items[1]).toMatchObject({ client: "Harbor Dental", approval: { kind: "task", credits: 900, canDecide: true } });
    // A Member sees only their clients' posts and cannot decide; a Viewer the same.
    for (const who of [member, viewer]) {
      const theirs = await who.query(api.briefing.feed, { workspaceId });
      expect(theirs.items.map((row) => row.title)).toEqual(["Draft to review: Northlight ad copy", "Proposed by a teammate: Research coaching prices"]);
      expect(theirs.items.every((row) => row.approval?.canDecide === false)).toBe(true);
    }
    expect((await owner.query(api.briefing.feed, { workspaceId, kind: "draft" })).items).toHaveLength(1);
    expect((await owner.query(api.briefing.feed, { workspaceId, kind: "alert" })).items).toEqual([]);
    expect((await owner.query(api.briefing.feed, { workspaceId, scope: harbor })).items.map((row) => row.client)).toEqual(["Harbor Dental"]);

    // Approving in place: the post then shows the decision instead of the buttons.
    await owner.mutation(api.approvals.decide, { workspaceId, approvalId: all.items[0].approval!.id, approve: true });
    expect((await owner.query(api.briefing.feed, { workspaceId })).items[0].approval).toMatchObject({ status: "approved", canDecide: false });

    // Seen is per person, and a Viewer may mark their own.
    await viewer.mutation(api.briefing.markSeen, { workspaceId });
    expect((await viewer.query(api.briefing.feed, { workspaceId })).unread).toBe(0);
    expect((await owner.query(api.briefing.feed, { workspaceId })).unread).toBe(3);
    expect((await owner.query(api.home.overview, { workspaceId })).nav).toEqual({ tasks: 2, briefing: 3 });
    expect((await viewer.query(api.home.overview, { workspaceId })).nav).toEqual({ tasks: 1, briefing: 0 });
  });

  it("posts each alert once: a check-in due, a connection to reconnect, and results that dropped", async () => {
    const t = newTest();
    const { owner, member, workspaceId, aster, harbor } = await agency(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const projectId = await ctx.db.insert("researchProjects", { workspaceId, clientId: harbor, title: "Harbor", objective: "x", market: "Dental", geography: "US", competitors: [], platforms: ["web"], suppliedUrls: [], status: "ready", createdBy: "nora", createdAt: now, updatedAt: now });
      const runId = await ctx.db.insert("agentRuns", { workspaceId, clientId: harbor, agentSlug: AGENT, skillSlug: "market-intelligence", status: "completed", startedBy: "nora", inputRef: projectId, startedAt: now, costCents: 1, inputTokens: 0, outputTokens: 0 });
      await ctx.db.insert("decisions", { workspaceId, clientId: harbor, projectId, runId, opportunityIndex: 0, opportunity: "Membership plan", proposedAction: "Offer a membership plan to uninsured patients.", validationMethod: "New patients", checkInAt: now - 1000, createdBy: "nora", createdAt: now - 5000, baseline: [] });
      await ctx.db.insert("metaConnections", { workspaceId, source: "oauth", accessToken: "x", scopes: [], metaUserId: "1", metaUserName: "Nora", status: "needsReconnect", connectedAt: now, connectedBy: "nora", callsOk: 0, callsFailed: 0 });
    });
    await upload(t, workspaceId, "Aster bookings", 40, aster);
    vi.advanceTimersByTime(1000);
    await upload(t, workspaceId, "Aster bookings", 28, aster);
    // A small dip is not an alert.
    await upload(t, workspaceId, "Northlight enquiries", 20);
    vi.advanceTimersByTime(1000);
    await upload(t, workspaceId, "Northlight enquiries", 18);

    await sweep(t);
    await sweep(t);
    const alerts = (await owner.query(api.briefing.feed, { workspaceId, kind: "alert" })).items;
    expect(alerts.map((row) => row.title).sort()).toEqual(["A check-in is due", "Meta ads needs reconnecting", "Results dropped: Aster bookings"]);
    expect(alerts.find((row) => row.title.startsWith("Results dropped"))).toMatchObject({ client: "Aster Coaching", body: "Conversions went from 40 to 28 (-30%) between the last two results files.", href: "/app/connections/results" });
    // The Member is not assigned to Harbor, so its check-in is not in their Briefing.
    // Posts written in code carry three rows; the row that states the business's own figures is labelled so.
    expect(alerts.find((row) => row.title.startsWith("Results dropped"))?.digest).toEqual({
      changed: "Conversions went from 40 to 28 (-30%) between the last two results files.",
      means: "This compares two files you uploaded. It shows that the count fell, not why.",
      todo: "Check that both files cover the same length of time, then run a diagnosis to see where the drop is.",
      changedLabel: "Your data",
    });
    expect(alerts.find((row) => row.title === "Meta ads needs reconnecting")?.digest).toMatchObject({ changed: "Results from Meta have stopped updating.", changedLabel: null });
    expect(alerts.find((row) => row.title === "A check-in is due")?.digest?.todo).toBe("Record what happened: it helped, it did not, or it is too early to tell.");
    expect((await member.query(api.briefing.feed, { workspaceId, kind: "alert" })).items.map((row) => row.title).sort()).toEqual(["Meta ads needs reconnecting", "Results dropped: Aster bookings"]);
  });

  it("writes a trend post only where trend posts are switched on", async () => {
    const t = newTest();
    const { owner, workspaceId } = await agency(t);
    const trend = { workspaceId, kind: "trend" as const, title: "Meta is testing longer lead forms", sources: [{ title: "Meta for Business", url: "https://example.com/meta" }], key: "trend:1" };
    expect(await t.run((ctx) => post(ctx, trend))).toBeNull();
    await owner.mutation(api.approvals.setSwitch, { workspaceId, key: "trendPosts", on: true });
    expect(await t.run((ctx) => post(ctx, trend))).not.toBeNull();
    // The same post is never written twice.
    expect(await t.run((ctx) => post(ctx, trend))).toBeNull();
    expect((await owner.query(api.briefing.feed, { workspaceId, kind: "trend" })).items).toMatchObject([{ title: "Meta is testing longer lead forms", sources: [{ title: "Meta for Business", url: "https://example.com/meta" }] }]);
  });
});

describe("Home", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const upload = (t: Tester, workspaceId: Id<"workspaces">, label: string, conversions: number, clientId?: Id<"clients">) =>
    t.run(async (ctx) => {
      await ctx.db.insert("resultUploads", { workspaceId, ...(clientId ? { clientId } : {}), fileName: `${label}.csv`, label, currency: "USD", uploadedBy: "nora", createdAt: Date.now(), status: "ready", summary: { rows: 3, dateStart: "2026-10-01", dateStop: "2026-10-31", metrics: ["conversions", "spend"], totals: { conversions, spend: 1000 }, groupBy: null, groups: [], otherGroups: 0, ignoredColumns: [] } });
    });

  it("lists what needs a person, what is in motion and each client, for the clients they may see", async () => {
    const t = newTest();
    const { owner, member, workspaceId, aster, harbor } = await agency(t);
    await member.mutation(api.agentTasks.propose, { workspaceId, title: "Research coaching prices", why: "Pricing pages changed.", ask: "What do coaching competitors charge?", skillSlug: "market-intelligence", clientId: aster });
    await owner.mutation(api.agentTasks.propose, { workspaceId, title: "Research dental plans", why: "Harbor asked.", ask: "What do dental membership plans cost?", skillSlug: "market-intelligence", clientId: harbor });
    await t.run(async (ctx) => {
      const now = Date.now();
      const projectId = await ctx.db.insert("researchProjects", { workspaceId, clientId: aster, title: "Aster pricing", objective: "x", market: "Coaching", geography: "US", competitors: [], platforms: ["web"], suppliedUrls: [], status: "ready", createdBy: "nora", createdAt: now, updatedAt: now });
      const runId = await ctx.db.insert("agentRuns", { workspaceId, clientId: aster, agentSlug: AGENT, skillSlug: "market-intelligence", status: "running", startedBy: "nora", inputRef: projectId, startedAt: now, costCents: 1, inputTokens: 0, outputTokens: 0 });
      await ctx.db.insert("decisions", { workspaceId, clientId: aster, projectId, runId, opportunityIndex: 0, opportunity: "Two calls", proposedAction: "Split the sale into two calls.", validationMethod: "New clients", checkInAt: now - 1000, createdBy: "nora", createdAt: now - 5000, baseline: [] });
      await ctx.db.insert("decisions", { workspaceId, clientId: harbor, projectId, runId, opportunityIndex: 1, opportunity: "Plan", proposedAction: "Offer a membership plan.", validationMethod: "New patients", checkInAt: now + 9_000_000, createdBy: "nora", createdAt: now - 5000, baseline: [] });
    });

    const home = await owner.query(api.home.dashboard, { workspaceId });
    expect(home.needs.map((row) => `${row.kind}:${row.title}`)).toEqual(["approval:Research coaching prices", "approval:Research dental plans", "checkIn:Split the sale into two calls."]);
    expect(home.needs[0]).toMatchObject({ client: "Aster Coaching", detail: "A task an agent wants to run", approval: { canDecide: true, credits: 900 } });
    expect(home.moving.map((row) => `${row.kind}:${row.title}`)).toEqual(["run:Aster pricing", "trying:Offer a membership plan."]);
    expect(home.clients).toEqual([
      { id: aster, name: "Aster Coaching", type: "business", needs: 2, moving: 1 },
      { id: harbor, name: "Harbor Dental", type: "business", needs: 1, moving: 1 },
    ]);
    expect(home).toMatchObject({ organization: "Northlight Growth", canApprove: true, own: { needs: 0, moving: 0 } });

    // A Member sees their client only, and cannot approve.
    const theirs = await member.query(api.home.dashboard, { workspaceId });
    expect(theirs.needs.map((row) => row.title)).toEqual(["Research coaching prices", "Split the sale into two calls."]);
    expect(theirs.needs[0].approval?.canDecide).toBe(false);
    expect(theirs.moving.map((row) => row.title)).toEqual(["Aster pricing"]);
    expect(theirs.clients.map((row) => row.name)).toEqual(["Aster Coaching"]);
    expect(theirs.canApprove).toBe(false);
    // The picker narrows it.
    const picked = await owner.query(api.home.dashboard, { workspaceId, scope: harbor });
    expect(picked.needs.map((row) => row.title)).toEqual(["Research dental plans"]);
    expect(picked.own).toBeNull();
  });

  it("compares two real readings for 'since you were last here', per person, and never another client's", async () => {
    const t = newTest();
    const { owner, member, viewer, workspaceId, aster, harbor } = await agency(t);
    await upload(t, workspaceId, "Aster bookings", 24, aster);
    await upload(t, workspaceId, "Harbor bookings", 60, harbor);
    // A first visit has nothing to compare with.
    expect((await owner.query(api.home.dashboard, { workspaceId })).since).toMatchObject({ at: null, changes: [], figures: 4 });
    await owner.mutation(api.home.visit, { workspaceId });
    await viewer.mutation(api.home.visit, { workspaceId });
    // Opening it again a minute later is the same visit.
    vi.advanceTimersByTime(60_000);
    await owner.mutation(api.home.visit, { workspaceId });
    expect((await owner.query(api.home.dashboard, { workspaceId })).since).toMatchObject({ at: null, changes: [] });

    // A day later newer files are in.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await upload(t, workspaceId, "Aster bookings", 31, aster);
    await upload(t, workspaceId, "Harbor bookings", 45, harbor);
    const back = await owner.query(api.home.dashboard, { workspaceId });
    expect(back.since.at).toBeGreaterThan(0);
    expect(back.since.changes).toEqual([
      { label: "Aster bookings: results", client: "Aster Coaching", before: 24, after: 31, unit: "results", percent: 29.2 },
      { label: "Harbor bookings: results", client: "Harbor Dental", before: 60, after: 45, unit: "results", percent: -25 },
    ]);
    // Coming back records the visit; the comparison stays the same for the rest of it.
    await owner.mutation(api.home.visit, { workspaceId });
    expect((await owner.query(api.home.dashboard, { workspaceId })).since.changes).toHaveLength(2);
    // The Viewer is assigned to Aster only. The Member never visited, so has nothing to compare.
    expect((await viewer.query(api.home.dashboard, { workspaceId })).since.changes.map((row) => row.client)).toEqual(["Aster Coaching"]);
    expect((await member.query(api.home.dashboard, { workspaceId })).since).toMatchObject({ at: null, changes: [], figures: 2 });
  });
});

describe("the task proposer's rules", () => {
  const candidate = (id: string, scope = "own"): Candidate => ({ id, scope, clientId: scope === "own" ? null : scope, clientName: scope === "own" ? null : "Aster Coaching", kind: "opportunity", title: `Opportunity ${id}`, action: `Action ${id}`, howToTell: "Bookings", assetId: "asset1", assetTitle: "Market report", projectId: "p1", index: 0 });
  const plan = (weekly = true): PlanRecord => ({
    planKey: weekly ? "week:2026-W46" : "change:x",
    weekly,
    candidates: ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => candidate(id, id === "c2" ? "client1" : "own")),
    figures: [
      { id: "f1", scope: "own", label: "Northlight enquiries results", metric: "conversions", value: 20, display: "20 results" },
      { id: "f2", scope: "client1", label: "Aster bookings results", metric: "conversions", value: 31, display: "31 results" },
      { id: "f3", scope: "own", label: "Meta ads spend", metric: "spend", value: 3000, display: "3,000 USD" },
    ],
    outcomes: [],
    goal: null,
    metric: "booked calls",
    finished: [],
    due: [],
  });

  it("keeps a number only when it rests on the same organization's or client's own results, and never an inference where such results exist", () => {
    const settled = settlePicks(plan(), {
      summary: "",
      picks: [
        { candidateId: "c1", why: "Enquiries fell three weeks running.", low: 2, high: 6, figureIds: ["f1"] },
        // Another client's figure cannot support it.
        { candidateId: "c2", why: "Calls rose.", low: 2, high: 6, figureIds: ["f1"] },
        // Spend is not a result.
        { candidateId: "c3", why: "Spend rose.", low: 2, high: 6, figureIds: ["f3"] },
        // More than the figure reads today.
        { candidateId: "c4", why: "Big.", low: 10, high: 45, figureIds: ["f1"] },
        // One number is not a range.
        { candidateId: "c5", why: "Flat.", low: 5, high: 5, figureIds: ["f1"] },
        // No numbers at all is fine.
        { candidateId: "c6", why: "Worth trying." },
      ],
    });
    expect(settled.map((row) => row.expectedReturn)).toEqual([
      { basis: "firstParty", metric: "booked calls", period: "month", low: 2, high: 6 },
      { basis: "insufficient" },
      { basis: "insufficient" },
      { basis: "insufficient" },
      { basis: "insufficient" },
    ]);
    expect(settled.every((row) => row.expectedReturn.basis !== "inferred")).toBe(true);
    expect(settled[0].evidence).toEqual([{ kind: "asset", refId: "asset1", label: "Market report" }, { kind: "figure", label: "Northlight enquiries results: 20 results" }]);
    expect(settled[1].notes[0]).toContain("No figure of your own");
    expect(settled[3].notes[0]).toContain("larger than the figure");
  });

  it("allows an Inference range only from the item's own cited sources, where there is no figure of its own, wide, and within the owner's goal", () => {
    const source = (id: string, scope = "own", title = `Competitor page ${id}`) => ({ id, refId: `ref_${id}`, scope, title, publisher: "Example Trade Weekly", date: "published 2026-10-30", excerpt: "Two competitors lead with a pilot offer.", limitation: null });
    const base = plan();
    const record: PlanRecord = {
      ...base,
      // Only the client has results of its own. The organization itself has none.
      figures: base.figures.filter((row) => row.scope === "client1"),
      candidates: base.candidates.map((row) => ({ ...row, sourceIds: row.id === "c2" ? ["s3"] : row.id === "c6" ? [] : ["s1", "s2"], uncertainty: "low" })),
      sources: [source("s1"), source("s2", "own", "Proven ways to double bookings"), source("s3", "client1"), source("s4")],
      monthlyTarget: 40,
    };
    const picks = [
      // Rests on two sources the report cited for this item: stands, as an inference.
      { candidateId: "c1", why: "Two competitors lead with it.", low: 2, high: 6, sourceIds: ["s1", "s2", "s1"] },
      // The client has results of its own, so a market source cannot stand in for them.
      { candidateId: "c2", why: "Seen elsewhere.", low: 2, high: 6, sourceIds: ["s3"] },
      // A real source of this organization, but not one the report cited for this item; and one that does not exist.
      { candidateId: "c6", why: "Seen elsewhere.", low: 2, high: 6, sourceIds: ["s4", "s99"] },
      // Larger than the owner's whole goal.
      { candidateId: "c3", why: "Big.", low: 20, high: 60, sourceIds: ["s1"] },
      // Too narrow to be an estimate from market sources.
      { candidateId: "c4", why: "Narrow.", low: 10, high: 12, sourceIds: ["s1"] },
    ];
    const settled = settlePicks(record, { summary: "", picks });
    expect(settled.map((row) => row.expectedReturn)).toEqual([
      { basis: "inferred", metric: "booked calls", period: "month", low: 2, high: 6 },
      { basis: "insufficient" },
      { basis: "insufficient" },
      { basis: "insufficient" },
      { basis: "insufficient" },
    ]);
    // The card links the sources the range rests on, each once; a title that reads as a promise is not repeated.
    expect(settled[0].evidence).toEqual([
      { kind: "asset", refId: "asset1", label: "Market report" },
      { kind: "sourceRef", refId: "ref_s1", label: "Competitor page s1 (Example Trade Weekly, published 2026-10-30)" },
      { kind: "sourceRef", refId: "ref_s2", label: "A source the report cites (Example Trade Weekly, published 2026-10-30)" },
    ]);
    expect(settled[1].notes[0]).toContain("No figure of your own was cited");
    expect(settled[2].notes[0]).toContain("no source the report cites for this");
    expect(settled[2].evidence).toEqual([{ kind: "asset", refId: "asset1", label: "Market report" }]);
    expect(settled[3].notes[0]).toContain("larger than your whole goal");
    expect(settled[4].notes[0]).toContain("too narrow");
    // Your data and Inference are never mixed: a range that cites both where a figure exists rests on the figure alone.
    const mixed = settlePicks({ ...record, figures: base.figures }, { summary: "", picks: [{ candidateId: "c1", why: "Both.", low: 2, high: 6, figureIds: ["f1"], sourceIds: ["s1"] }] });
    expect(mixed[0].expectedReturn.basis).toBe("firstParty");
    expect(mixed[0].evidence.map((row) => row.kind)).toEqual(["asset", "figure"]);
    // With no number in the owner's goal there is nothing to size an inference against.
    const noGoal = settlePicks({ ...record, monthlyTarget: null }, { summary: "", picks: [picks[0]] });
    expect(noGoal[0].expectedReturn).toEqual({ basis: "insufficient" });
    expect(noGoal[0].notes[0]).toContain("names no number");
    // A plan read before sources were collected simply has none.
    expect(settlePicks({ ...base, figures: [] }, { summary: "", picks: [picks[0]] })[0].expectedReturn).toEqual({ basis: "insufficient" });
    expect(readChoice({ picks: [{ candidateId: "c1", why: "x", sourceIds: ["s1", 4] }], summary: "" })?.picks[0].sourceIds).toEqual(["s1"]);
  });

  it("drops what is not a candidate, never proposes one twice, replaces a promise, and stops at its limit", () => {
    const picks = [{ candidateId: "nope", why: "x" }, { candidateId: "c1", why: "This will triple enquiries." }, { candidateId: "c1", why: "Again." }, { candidateId: "c3", why: "" }, { candidateId: "c4", why: "Fine." }];
    const weekly = settlePicks(plan(), { summary: "", picks });
    expect(weekly.map((row) => [row.candidate.id, row.why])).toEqual([["c1", "Opportunity c1"], ["c3", "Opportunity c3"], ["c4", "Fine."]]);
    expect(settlePicks(plan(false), { summary: "", picks }).map((row) => row.candidate.id)).toEqual(["c1", "c3"]);
    expect(settlePicks(plan(), { summary: "", picks: ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => ({ candidateId: id, why: "ok" })) })).toHaveLength(5);
    expect(settlePicks(plan(), null)).toEqual([]);
    // The report's opening is shown only when it claims nothing.
    expect(settleSummary({ picks: [], summary: "Enquiries fell; the pilot offer is the nearest open item." })).toBe("Enquiries fell; the pilot offer is the nearest open item.");
    expect(settleSummary({ picks: [], summary: "This plan is guaranteed to work." })).toBe("");
    expect(readChoice({ picks: [{ candidateId: "c1", why: 4, low: "3" }, { why: "no id" }], summary: 7 })).toEqual({ picks: [{ candidateId: "c1", why: "" }], summary: "" });
  });

  it("names the week from Monday, in UTC", () => {
    expect(weekKey(Date.UTC(2026, 10, 12))).toBe("2026-W46");
    expect(weekKey(Date.UTC(2026, 10, 15, 23, 59))).toBe("2026-W46");
    expect(weekKey(Date.UTC(2026, 10, 16))).toBe("2026-W47");
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe("2026-W53");
  });
});
