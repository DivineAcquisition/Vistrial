/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { TWO_OPPORTUNITIES, type MarketReport } from "./lib/marketReport";
import { QUESTION_GONE, QUESTION_TIMEOUT_MS } from "./runs";
import schema from "./schema";
import { MARKET_ASKS } from "./skills/marketIntelligence";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const MI = "market-intelligence";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "accepted";
}

const scope = {
  title: "Austin cleaners",
  objective: "Where can we win more deep-cleaning bookings in Austin?",
  market: "Deep cleaning",
  geography: "Austin, TX",
  competitors: [{ name: "Sparkle", url: "https://sparkle.example.com" }],
  platforms: ["web" as const],
  suppliedUrls: [],
};

async function routeEverything(t: Tester, model: string) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("modelRoutes").collect()) await ctx.db.delete(row._id);
    for (const workKind of ["research", "classify", "write", "summarize"]) {
      await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model, fallbackProvider: "fake", fallbackModel: model });
    }
  });
}

async function seed(t: Tester, name: string, options: { profile?: boolean; project?: Partial<typeof scope> } = {}) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${name}-rep@example.com`, role: "rep" });
  const rep = t.withIdentity(person(`${name}-rep`));
  await rep.mutation(api.workspace.acceptInvite, { token: invite.token });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "on" });
  if (options.profile !== false) {
    await owner.mutation(api.profile.saveDraft, {
      workspaceId,
      offer: "Deep cleaning for busy homeowners",
      priceNotes: "From $180",
      audience: "Homeowners",
      geography: "Austin",
      channels: "",
      brandVoice: "",
      competitors: [],
    });
    await owner.mutation(api.profile.confirm, { workspaceId });
  }
  const projectId = await owner.mutation(api.research.createProject, { workspaceId, ...scope, ...options.project });
  return { owner, rep, workspaceId, projectId };
}

const start = (caller: Caller, workspaceId: Id<"workspaces">, projectId?: Id<"researchProjects">) =>
  caller.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: MI, ...(projectId ? { projectId } : {}) });

/** Runs scheduled steps until the run leaves queued and running. `onStep` may change the world between steps. */
async function drive(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">, onStep?: () => Promise<void>) {
  let status = "queued";
  for (let i = 0; i < 80 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    if (onStep) await onStep();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

async function view(caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  return caller.query(api.runs.get, { workspaceId, runId });
}

async function reports(t: Tester, runId: Id<"agentRuns">) {
  const rows = await t.run((ctx) => ctx.db.query("runArtifacts").collect());
  return rows.filter((row) => row.runId === runId && row.kind === "report").map((row) => JSON.parse(row.body ?? "null") as MarketReport);
}

function codes(run: Awaited<ReturnType<typeof view>>) {
  return run.steps.map((step) => (step.kind === "tool" ? step.toolSlug : step.kind === "model" ? `model:${step.workKind}` : step.resultCode));
}

describe("Market Intelligence (2.11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the brief before collecting, then a report of three opportunities that passes all eight checks", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await routeEverything(t, "fake-market");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("completed");

    const run = await view(a.owner, a.workspaceId, runId);
    expect(codes(run)).toEqual([
      "brief_saved",
      "model:classify",
      "model:research",
      "source.web",
      "model:classify",
      "model:write",
      "model:write",
      "asset.create",
      "check_passed",
    ]);
    expect(run.completion).toMatchObject({ needsReview: false, revisionSkipped: false });
    expect(run.completion!.checks).toHaveLength(8);
    expect(run.completion!.checks.every((row) => row.passed)).toBe(true);
    expect(run.assets).toEqual([expect.objectContaining({ kind: "marketReport", status: "draft", currentVersion: 1 })]);
    expect(run.costCents).toBeLessThanOrEqual(300);

    const [report] = await reports(t, runId);
    expect(report.objective).toBe(scope.objective);
    expect(report.opportunities).toHaveLength(3);
    expect(report.missingOpportunityReason).toBeNull();
    for (const row of report.opportunities) {
      expect(row.evidence.basis).toBe("observed");
      expect(row.evidence.sourceRefIds.length).toBeGreaterThan(0);
      expect(row.businessRelevance.contextUsed[0]).toMatch(/^profile\./);
    }
    expect(report.contextUsed).toEqual([`profileVersion:${report.brief.known.profileVersionId}`]);
    expect(report.brief.assumptions).toContain("Budget not provided; recommendations do not depend on a budget figure.");
    // Counts are computed in code over the collected sources.
    expect(report.observations[0]).toMatchObject({ statement: "3 sources were reviewed: 3 web.", basis: "observed", computed: true });

    const evidence = await t.run((ctx) => ctx.db.query("evidence").collect());
    expect(evidence.length).toBe(report.observations.length + 3);
    expect(evidence.every((row) => row.basis !== undefined && row.workspaceId === a.workspaceId)).toBe(true);
  });

  it("finishes as Needs Review when the sources support only two opportunities, and never invents a third", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await routeEverything(t, "fake-market-two");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("completed");

    const run = await view(a.owner, a.workspaceId, runId);
    expect(codes(run).slice(-5)).toEqual(["check_failed", "model:write", "asset.addVersion", "check_failed", "needs_review"]);
    expect(run.assets).toEqual([expect.objectContaining({ status: "needsReview", currentVersion: 2 })]);
    expect(run.completion).toMatchObject({ needsReview: true, revisionSkipped: false });
    const failed = run.completion!.checks.filter((row) => !row.passed);
    expect(failed).toEqual([{ key: "threeOpportunities", passed: false, detail: TWO_OPPORTUNITIES }]);

    const versions = await reports(t, runId);
    expect(versions).toHaveLength(2);
    for (const report of versions) {
      expect(report.opportunities).toHaveLength(2);
      expect(report.missingOpportunityReason).toBeTruthy();
    }
  });

  it("revises once for the failed check and passes when the revision fixes it", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await routeEverything(t, "fake-market-dup");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("completed");
    const run = await view(a.owner, a.workspaceId, runId);
    expect(codes(run).slice(-4)).toEqual(["check_failed", "model:write", "asset.addVersion", "check_passed"]);
    expect(run.assets).toEqual([expect.objectContaining({ status: "draft", currentVersion: 2 })]);
    expect(run.completion).toMatchObject({ needsReview: false });
  });

  it("skips the revision when the reserve cannot pay for it, and says so", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await routeEverything(t, "fake-market-two");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    const status = await drive(t, a.owner, a.workspaceId, runId, async () => {
      const run = await view(a.owner, a.workspaceId, runId);
      // Once the first check fails, spend most of the cap so the revision's estimate no longer fits.
      if (run.steps.some((step) => step.resultCode === "check_failed") && run.costCents < 290) {
        await t.run((ctx) => ctx.db.patch(runId, { costCents: 295 }));
      }
    });
    expect(status).toBe("completed");
    const run = await view(a.owner, a.workspaceId, runId);
    expect(codes(run).slice(-3)).toEqual(["check_failed", "budget_skip", "needs_review"]);
    expect(run.completion).toMatchObject({ needsReview: true, revisionSkipped: true });
    expect(run.assets).toEqual([expect.objectContaining({ status: "needsReview", currentVersion: 1 })]);
  });

  it("asks for the market and the area when nothing on record gives them, waits without spending, and resumes on each answer", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { profile: false, project: { market: "", geography: "" } });
    await routeEverything(t, "fake-market");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("waiting");

    let run = await view(a.owner, a.workspaceId, runId);
    expect(run.question?.text).toBe(MARKET_ASKS.researchMarket);
    expect(run.steps.map((step) => step.resultCode)).toEqual(["asked"]);
    expect(run.costCents).toBe(0);
    // A second run on the project is refused while this one waits.
    expect(await message(start(a.owner, a.workspaceId, a.projectId))).toBe("This project already has a run in progress.");

    // The wait is longer than the 30-minute time cap, and does not count toward it.
    vi.advanceTimersByTime(31 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    expect((await view(a.owner, a.workspaceId, runId)).status).toBe("waiting");

    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: run.question!.questionId, answer: "Deep cleaning" });
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("waiting");
    run = await view(a.owner, a.workspaceId, runId);
    expect(run.question?.text).toBe(MARKET_ASKS.researchGeography);
    expect(run.waitedMs).toBeGreaterThanOrEqual(31 * 60 * 1000);

    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: run.question!.questionId, answer: "Austin, TX" });
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("completed");

    const facts = await t.run((ctx) => ctx.db.query("businessFacts").collect());
    expect(facts.map((row) => [row.factKey, row.value, row.status, row.sourceType])).toEqual([
      ["researchMarket", "Deep cleaning", "verified", "owner"],
      ["researchGeography", "Austin, TX", "verified", "owner"],
    ]);
    const [report] = await reports(t, runId);
    expect(report.brief.market).toBe("Deep cleaning");
    expect(report.brief.geography).toBe("Austin, TX");
    // With no profile, the answered facts are the business context the opportunities cite.
    expect(report.opportunities.every((row) => row.businessRelevance.contextUsed[0]?.startsWith("fact:"))).toBe(true);
  });

  it("times out after seven days into Needs Input, keeps its context, and resumes with a new question id", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { profile: false, project: { market: "" } });
    await routeEverything(t, "fake-market");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("waiting");
    const asked = (await view(a.owner, a.workspaceId, runId)).question!;

    vi.advanceTimersByTime(QUESTION_TIMEOUT_MS);
    await t.finishInProgressScheduledFunctions();
    let run = await view(a.owner, a.workspaceId, runId);
    expect(run).toMatchObject({ status: "needsInput", needsInputReason: "timedOut" });
    expect(run.question?.questionId).toBe(asked.questionId);
    expect(await message(a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: asked.questionId, answer: "x" }))).toBe(QUESTION_GONE);

    const { questionId } = await a.owner.mutation(api.runs.resume, { workspaceId: a.workspaceId, runId });
    expect(questionId).not.toBe(asked.questionId);
    run = await view(a.owner, a.workspaceId, runId);
    expect(run).toMatchObject({ status: "waiting", needsInputReason: null, question: { questionId, text: MARKET_ASKS.researchMarket } });

    // The old timeout firing again changes nothing: the run waits on a newer question.
    await t.mutation(internal.runs.timeoutQuestion, { runId, questionId: asked.questionId });
    expect((await view(a.owner, a.workspaceId, runId)).status).toBe("waiting");

    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId, answer: "Deep cleaning" });
    expect(await drive(t, a.owner, a.workspaceId, runId)).toBe("completed");
    // The answered run's timeout firing late changes nothing either.
    await t.mutation(internal.runs.timeoutQuestion, { runId, questionId });
    expect((await view(a.owner, a.workspaceId, runId)).status).toBe("completed");
  });

  it("lets a new run start once the old one timed out", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { profile: false, project: { market: "" } });
    await routeEverything(t, "fake-market");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    await drive(t, a.owner, a.workspaceId, runId);
    vi.advanceTimersByTime(QUESTION_TIMEOUT_MS);
    await t.finishInProgressScheduledFunctions();
    expect((await view(a.owner, a.workspaceId, runId)).status).toBe("needsInput");
    expect(await message(start(a.owner, a.workspaceId, a.projectId))).toBe("accepted");
  });

  it("keeps questions to their own workspace and to people who may run agents", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { profile: false, project: { market: "" } });
    const b = await seed(t, "Beta");
    await routeEverything(t, "fake-market");
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    await drive(t, a.owner, a.workspaceId, runId);
    const { questionId } = (await view(a.owner, a.workspaceId, runId)).question!;
    expect(await message(b.owner.mutation(api.runs.answer, { workspaceId: b.workspaceId, runId, questionId, answer: "x" }))).toBe(NOT_FOUND);
    expect(await message(a.rep.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId, answer: "x" }))).toBe(NOT_ALLOWED);
    expect(await message(b.owner.mutation(api.runs.resume, { workspaceId: b.workspaceId, runId }))).toBe(NOT_FOUND);
    expect(await t.run((ctx) => ctx.db.query("businessFacts").collect())).toEqual([]);
  });

  it("needs a research project to start", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    expect(await message(start(a.owner, a.workspaceId))).toBe("Choose a research project first.");
  });
});
