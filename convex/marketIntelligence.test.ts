/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import type { ScriptedModel } from "./lib/toolRouter";
import { ANSWER_WINDOW_MS } from "./runs";
import { runChecks } from "./skills/marketIntelligence/checks";
import type { ContextRecord, Report } from "./skills/marketIntelligence/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const MI = "market-intelligence";
const AGENT = "growth-architect";
const OBJECTIVE = "Which offers do Austin deep-cleaning competitors lead with?";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    // A message meant for a person travels as ConvexError data; read it from there.
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  return "accepted";
}

const SOURCES = [
  { url: "https://sparkle.example.com/offers", title: "Sparkle: 20% off your first deep clean" },
  { url: "https://shine.example.com/", title: "Shine Cleaning: book online in 60 seconds" },
  { url: "https://tidy.example.com/move-out", title: "Tidy: move-out cleaning guarantee" },
  { url: "https://fresh.example.com/", title: "Fresh: 20% off first clean for new customers" },
];

type Plan = { opportunities: number; reviseOpportunities?: number };

/** The scripted model: it answers each step from what the step's input asks for, like a real model would. */
function script(plan: Plan) {
  const calls: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    const ids = [...new Set([...input.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]))];
    const version = input.match(/\(version id ([^\s)]+)\):/)?.[1] ?? null;
    const facts = [...input.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]);
    const opps = (n: number) =>
      [0, 1, 2].slice(0, n).map((i) => ({
        opportunity: `Opportunity ${i + 1}`,
        evidence: { sourceRefIds: ids.slice(i, i + 2), uncertainty: "none" },
        businessRelevance: { text: `Fits the offer${facts[0] ? " and the budget fact" : ""}.`, profileFields: version ? ["offer"] : [], factIds: facts.slice(0, 1) },
        proposedAction: `Action ${i + 1}`,
        validationMethod: `Track bookings for ${i + 1} month(s).`,
      }));
    const report = (n: number) =>
      JSON.stringify({
        objective: input.match(/Objective: (.*)/)?.[1] ?? "",
        summary: "Competitors lead with first-clean discounts.",
        findings: [{ statement: "Two competitors offer 20% off a first clean.", basis: "observed", sourceRefIds: ids.slice(0, 2) }],
        opportunities: opps(n),
        limits: [],
        contextUsed: { profileVersionId: version, factIds: facts.slice(0, 1) },
        missingOpportunityReason: n < 3 ? "The sources support only two distinct opportunities." : "",
      });
    if (input.startsWith("Write the task brief")) {
      calls.push("brief");
      return { text: JSON.stringify({ objective: OBJECTIVE, deliverables: ["report"], researchQuestions: ["q"], searchQueries: ["deep cleaning austin"], competitorsToLookUp: [], known: { profileVersionId: version, factIds: facts }, missing: [], assumptions: [] }) };
    }
    if (input.startsWith("Research this market")) {
      calls.push("research");
      return { text: "Found four competitor pages.", searches: 2, sources: SOURCES };
    }
    if (input.startsWith("Classify each source")) {
      calls.push("classify");
      return { text: JSON.stringify({ items: ids.map((id, i) => ({ sourceRefId: id, hook: "h", offer: i % 2 === 0 ? "20% off first clean" : "Book online", callToAction: "Book now", format: "landing page", audienceHypothesis: "New homeowners", relevance: "high" })) }) };
    }
    if (input.startsWith("Pick the three opportunities")) {
      calls.push("prioritize");
      return { text: JSON.stringify({ opportunities: opps(plan.opportunities), missingReason: plan.opportunities < 3 ? "Only two are supported." : "" }) };
    }
    if (input.startsWith("Write the market report")) {
      calls.push("write");
      return { text: report(plan.opportunities) };
    }
    if (input.startsWith("Revise the market report")) {
      calls.push("revise");
      return { text: report(plan.reviseOpportunities ?? plan.opportunities) };
    }
    throw new Error(`unscripted call: ${input.slice(0, 40)}`);
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return calls;
}

async function seed(t: Tester, name: string, opts: { profile?: boolean; market?: string; geography?: string } = {}) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${name}-rep@example.com`, role: "rep" });
  const rep = t.withIdentity(person(`${name}-rep`));
  await rep.mutation(api.workspace.acceptInvite, { token: invite.token });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  if (opts.profile !== false) {
    await owner.mutation(api.profile.saveDraft, { workspaceId, offer: "Deep cleaning", priceNotes: "$200", audience: "Homeowners", geography: "Austin, TX", channels: "Meta", brandVoice: "Plain", competitors: [] });
    await owner.mutation(api.profile.confirm, { workspaceId });
  }
  const factId = opts.profile !== false ? await owner.mutation(api.facts.record, { workspaceId, factKey: "monthlyAdBudget", value: "$1,500" }) : null;
  const projectId = await owner.mutation(api.research.createProject, {
    workspaceId,
    title: "Austin cleaners",
    objective: OBJECTIVE,
    market: opts.market ?? "Deep cleaning",
    geography: opts.geography ?? "Austin, TX",
    competitors: [{ name: "Sparkle" }],
    platforms: ["web"],
    suppliedUrls: [],
  });
  await t.run(async (ctx) => {
    for (const workKind of ["classify", "research", "write"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  return { owner, rep, workspaceId, projectId, factId };
}

/** One scheduled round: each step schedules the next, so this runs one step. */
async function stepOnce(t: Tester) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

async function finishRun(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 40 && (status === "queued" || status === "running"); i += 1) {
    await stepOnce(t);
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

const start = (caller: Caller, workspaceId: Id<"workspaces">, projectId?: Id<"researchProjects">) =>
  caller.mutation(api.runs.start, { workspaceId, agentSlug: AGENT, skillSlug: MI, ...(projectId ? { projectId } : {}) });

async function phases(t: Tester, runId: Id<"agentRuns">) {
  const steps = await t.run((ctx) => ctx.db.query("runSteps").collect());
  return steps
    .filter((row) => row.runId === runId)
    .sort((a, b) => a.index - b.index)
    .map((row) => `${row.phase ?? row.toolSlug}:${row.resultCode}`);
}

async function lastRecord(t: Tester, runId: Id<"agentRuns">, kind: string) {
  const rows = await t.run((ctx) => ctx.db.query("runArtifacts").collect());
  const row = rows.filter((item) => item.runId === runId && item.kind === kind).at(-1);
  return row?.body ? JSON.parse(row.body) : null;
}

describe("Market Intelligence (2.11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("runs every stage and saves a report that passes all eight checks, waiting for approval", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const calls = script({ opportunities: 3 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("completed");
    expect(calls).toEqual(["brief", "research", "classify", "prioritize", "write"]);
    expect(await phases(t, runId)).toEqual([
      "context:ok",
      "brief:ok",
      "research:ok",
      "collect:ok",
      "classify:ok",
      "applyClassification:ok",
      "compute:ok",
      "prioritize:ok",
      "write:ok",
      "check:passed",
      "save:ok",
    ]);
    const checks = await lastRecord(t, runId, "checks");
    expect(checks.passed).toBe(true);
    expect(checks.results).toHaveLength(8);

    const assets = await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, kind: "marketReport", paginationOpts: { numItems: 5, cursor: null } });
    expect(assets.page).toHaveLength(1);
    expect(assets.page[0].status).toBe("draft");
    // The save step queued the report-ready email; it runs apart from the run, so it cannot fail it.
    const queued = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(queued.filter((row) => row.name.includes("emailReminders")).map((row) => row.args)).toEqual([[{ assetId: assets.page[0].id }]]);
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: assets.page[0].id });
    expect(asset.body).toContain("## Opportunities");
    expect(asset.body).toContain("monthlyAdBudget: $1,500");
    const evidence = asset.evidence as { claimKey: string; statement: string; basis: string | null; computed: boolean; sources: unknown[]; sourceMissing: boolean }[];
    // Counts are computed in code and saved as observed claims that cite every source counted.
    const counts = evidence.filter((row) => row.claimKey.startsWith("count-"));
    expect(counts[0]).toMatchObject({ claimKey: "count-sources", statement: "4 sources were reviewed: 4 web.", basis: "observed", computed: true });
    expect(counts[0].sources).toHaveLength(4);
    expect(counts.slice(1).map((row) => row.statement)).toEqual(['4 of 4 sources show the call to action "Book now" (the agent\'s reading).']);
    expect(evidence.filter((row) => !row.claimKey.startsWith("count-")).map((row) => [row.claimKey, row.basis])).toEqual([
      ["finding-1", "observed"],
      ["opportunity-1", "inferred"],
      ["opportunity-2", "inferred"],
      ["opportunity-3", "inferred"],
    ]);
    expect(evidence.every((row) => !row.sourceMissing)).toBe(true);

    // Classifications are saved on the sources, marked as the model's.
    const sources = await t.run((ctx) => ctx.db.query("sourceRefs").collect());
    expect(sources).toHaveLength(4);
    expect(sources.every((row) => row.classification?.classifiedBy === "model")).toBe(true);
    // Counts come from code; a pattern under three sources is not enough.
    const computed = await lastRecord(t, runId, "compute");
    expect(computed.totals.sources).toBe(4);
    expect(computed.patterns.find((row: { value: string }) => row.value === "Book now")).toMatchObject({ count: 4, enough: true });
    expect(computed.patterns.find((row: { value: string }) => row.value === "Book online")).toMatchObject({ count: 2, enough: false });
    // The run records the context it used.
    const report = await lastRecord(t, runId, "report");
    expect(report.contextUsed.factIds).toEqual([a.factId]);
    const run = await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId });
    expect(run.costCents).toBeLessThanOrEqual(300);
  });

  it("with evidence for only two opportunities: one revision, then Needs Review, and no invented third", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const calls = script({ opportunities: 2 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("completed");
    expect(calls).toEqual(["brief", "research", "classify", "prioritize", "write", "revise"]);
    expect((await phases(t, runId)).slice(-4)).toEqual(["check:checks_failed", "revise:ok", "recheck:checks_failed", "save:needs_review"]);
    const assets = await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, status: "needsReview", paginationOpts: { numItems: 5, cursor: null } });
    expect(assets.page).toHaveLength(1);
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: assets.page[0].id });
    expect(asset.body).toContain("Only 2 opportunities could be supported by the available evidence");
    expect(asset.body).toContain("Additional research or user input is required");
    expect(asset.body).not.toContain("Opportunity 3");
    expect(await message(a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: assets.page[0].id }))).toContain("did not pass its checks");
  });

  it("a revision that fixes the failed check passes", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    script({ opportunities: 3 });
    // The first draft forgets the objective; the revision copies it.
    let first = true;
    const base = (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel!;
    (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = (params) => {
      const reply = base(params);
      if (String(params.messages[0].content).startsWith("Write the market report") && first) {
        first = false;
        return { text: JSON.stringify({ ...JSON.parse(reply.text), objective: "Something else" }) };
      }
      return reply;
    };
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("completed");
    expect((await phases(t, runId)).slice(-4)).toEqual(["check:checks_failed", "revise:ok", "recheck:passed", "save:ok"]);
    // The first draft is kept as version 1 and the revision is version 2, so the change can be compared.
    const asset = (await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, kind: "marketReport", paginationOpts: { numItems: 5, cursor: null } })).page[0];
    expect(asset).toMatchObject({ status: "draft", currentVersion: 2 });
    const v1 = await a.owner.query(api.assets.version, { workspaceId: a.workspaceId, assetId: asset.id, version: 1 });
    expect(v1.body).toContain("Understood the objective");
    expect(v1.body).toContain("A revision follows as version 2.");
    const failed = (await t.run((ctx) => ctx.db.query("runArtifacts").collect())).filter((row) => row.runId === runId && row.kind === "checks").map((row) => JSON.parse(row.body!));
    expect(failed[0].results.filter((row: { passed: boolean }) => !row.passed).map((row: { id: number }) => row.id)).toEqual([1]);
  });

  it("does not start a call that would spend the reserve, and the revision may use it", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    script({ opportunities: 2 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    // Run context and brief, then spend most of the cap so only the reserve is left.
    for (let i = 0; i < 2; i += 1) await stepOnce(t);
    await t.run((ctx) => ctx.db.patch(runId, { costCents: 245 }));
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("completed");
    const steps = await t.run((ctx) => ctx.db.query("runSteps").collect());
    const research = steps.find((row) => row.runId === runId && row.phase === "research")!;
    expect([research.kind, research.resultCode]).toEqual(["note", "over_budget"]);
    const write = steps.find((row) => row.runId === runId && row.phase === "write")!;
    expect([write.kind, write.resultCode]).toEqual(["note", "over_budget"]);
    // The revision is allowed into the reserve.
    const revise = steps.find((row) => row.runId === runId && row.phase === "revise")!;
    expect(revise.kind).toBe("model");
    const run = await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId });
    expect(run.costCents).toBeLessThanOrEqual(300);
  });

  it("builds what is known, missing and assumed in code, with origin and date", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    script({ opportunities: 3 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    await stepOnce(t);
    const context = await lastRecord(t, runId, "context");
    const keys = context.known.map((row: { key: string; origin: string }) => `${row.key}:${row.origin}`);
    expect(keys).toEqual(expect.arrayContaining(["market:project", "geography:project", "profile.offer:profile", `fact:${a.factId}:fact`]));
    expect(context.missing).toEqual([]);
    const b = await seed(t, "Beta", { profile: false });
    const other = await start(b.owner, b.workspaceId, b.projectId);
    await stepOnce(t);
    const lean = await lastRecord(t, other, "context");
    expect(lean.missing).toEqual([{ key: "adBudget", blocking: false }, { key: "businessProfile", blocking: false }]);
    expect(lean.assumptions[0]).toBe("Budget not provided; recommendations do not depend on a budget figure.");
  });

  it("refuses a second run on a project while one is still running", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    script({ opportunities: 3 });
    const first = await start(a.owner, a.workspaceId, a.projectId);
    expect(await message(start(a.owner, a.workspaceId, a.projectId))).toContain("already has a run in progress");
    expect(await finishRun(t, a.owner, a.workspaceId, first)).toBe("completed");
    expect(await message(start(a.owner, a.workspaceId, a.projectId))).toBe("accepted");
  });

  it("refuses to start without a project, on another workspace's project, or by a Rep", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    expect(await message(start(a.owner, a.workspaceId))).toContain("Choose a research project");
    expect(await message(start(b.owner, b.workspaceId, a.projectId))).toBe(NOT_FOUND);
    expect(await message(start(a.rep, a.workspaceId, a.projectId))).toBe(NOT_ALLOWED);
  });
});

describe("ask, wait, resume (2.19)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("asks only for a declared gap, spends nothing while waiting, and resumes on the answer", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { profile: false, market: "", geography: "" });
    const calls = script({ opportunities: 3 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    await finishRun(t, a.owner, a.workspaceId, runId);
    let run = await t.run((ctx) => ctx.db.get(runId));
    expect(run).toMatchObject({ status: "waiting", waitingFor: { questionKey: "researchMarket", question: "Which industry or market should I research?" } });
    expect(calls).toEqual([]);
    expect(run!.costCents).toBe(0);
    // Waiting blocks a second run on the project.
    expect(await message(start(a.owner, a.workspaceId, a.projectId))).toContain("waiting for an answer");
    // Only an Owner or Manager answers, and only the current question.
    expect(await message(a.rep.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: run!.waitingFor!.questionId, answer: "Deep cleaning" }))).toBe(NOT_ALLOWED);
    expect(await message(a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: "old", answer: "Deep cleaning" }))).toContain("already been answered");
    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: run!.waitingFor!.questionId, answer: "Deep cleaning" });
    expect(await a.owner.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "researchMarket" })).toMatchObject({ value: "Deep cleaning", status: "verified", sourceType: "owner" });
    await finishRun(t, a.owner, a.workspaceId, runId);
    run = await t.run((ctx) => ctx.db.get(runId));
    expect(run).toMatchObject({ status: "waiting", waitingFor: { questionKey: "researchGeography" } });
    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: run!.waitingFor!.questionId, answer: "Austin, TX" });
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("completed");
    expect(calls[0]).toBe("brief");
    // No business context: each opportunity has to say so, and the report still passes.
    expect((await phases(t, runId)).filter((row) => row.startsWith("ask"))).toEqual(["ask:waiting_for_user", "ask:waiting_for_user"]);
  });

  it("times out after seven days only if still waiting on the same question, and resumes with a new one", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { market: "", geography: "Austin, TX", profile: false });
    script({ opportunities: 3 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    await finishRun(t, a.owner, a.workspaceId, runId);
    const asked = (await t.run((ctx) => ctx.db.get(runId)))!.waitingFor!;

    // A stale timeout (an older question) changes nothing.
    await t.mutation(internal.runs.askTimeout, { runId, questionId: "older-question" });
    expect((await t.run((ctx) => ctx.db.get(runId)))!.status).toBe("waiting");

    vi.advanceTimersByTime(ANSWER_WINDOW_MS + 1);
    await t.finishInProgressScheduledFunctions();
    const timedOut = await t.run((ctx) => ctx.db.get(runId));
    expect(timedOut).toMatchObject({ status: "needsInput", needsInputReason: "timedOut" });
    expect(timedOut!.finishedAt).toBeUndefined();
    // After a time-out a new run is allowed.
    expect(await message(start(a.owner, a.workspaceId, a.projectId))).toBe("accepted");

    await a.owner.mutation(api.runs.resume, { workspaceId: a.workspaceId, runId });
    const resumed = (await t.run((ctx) => ctx.db.get(runId)))!;
    expect(resumed.status).toBe("waiting");
    expect(resumed.waitingFor!.question).toBe(asked.question);
    expect(resumed.waitingFor!.questionId).not.toBe(asked.questionId);
    // The first question's timeout can no longer touch it.
    await t.mutation(internal.runs.askTimeout, { runId, questionId: asked.questionId });
    expect((await t.run((ctx) => ctx.db.get(runId)))!.status).toBe("waiting");
  });

  it("another workspace cannot answer or resume a run", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", { market: "", profile: false });
    const b = await seed(t, "Beta");
    script({ opportunities: 3 });
    const runId = await start(a.owner, a.workspaceId, a.projectId);
    await finishRun(t, a.owner, a.workspaceId, runId);
    const questionId = (await t.run((ctx) => ctx.db.get(runId)))!.waitingFor!.questionId;
    expect(await message(b.owner.mutation(api.runs.answer, { workspaceId: b.workspaceId, runId, questionId, answer: "x" }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.runs.resume, { workspaceId: b.workspaceId, runId }))).toBe(NOT_FOUND);
  });
});

describe("completion checks", () => {
  const context: ContextRecord = {
    projectId: "p",
    objective: "Find offers",
    market: "m",
    geography: "g",
    competitors: [],
    platforms: ["web", "youtube"],
    profile: { versionId: "pv", offer: "o", priceNotes: "", audience: "", geography: "", channels: "", brandVoice: "", competitors: [] },
    facts: [{ id: "f1", factKey: "budget", value: "$1", status: "verified", sourceType: "owner", recordedAt: 1 }],
    gaps: [],
    known: [],
    missing: [],
    assumptions: [],
  };
  const opp = (action: string) => ({
    opportunity: "o",
    evidence: { sourceRefIds: ["s1"], uncertainty: "none" as const },
    businessRelevance: { text: "t", profileFields: ["offer"], factIds: [] },
    proposedAction: action,
    validationMethod: "v",
  });
  const report: Report = {
    objective: "Find offers",
    summary: "s",
    findings: [{ statement: "x", basis: "observed", sourceRefIds: ["s1"] }],
    opportunities: [opp("a"), opp("b"), opp("c")],
    limits: [{ platform: "youtube", text: "Not set up" }],
    contextUsed: { profileVersionId: "pv", factIds: ["f1"] },
    missingOpportunityReason: "",
  };
  const compute = { totals: { sources: 1, byPlatform: {}, byKind: {} }, patterns: [], dates: { earliest: null, latest: null }, limits: [{ platform: "youtube", state: "unavailable", reasonCode: "not_configured", limitation: null }] };
  const run = (r: Report | null, extra: Partial<Parameters<typeof runChecks>[0]> = {}) =>
    runChecks({ report: r, context, compute, prioritizedCount: 3, knownSourceIds: new Set(["s1"]), runCostCents: 120, capCents: 300, ...extra });
  const failing = (r: Report | null, extra = {}) => run(r, extra).results.filter((row) => !row.passed).map((row) => row.id);

  it("passes a complete report, and fails each rule on its own", () => {
    expect(run(report).passed).toBe(true);
    expect(failing({ ...report, objective: "other" })).toEqual([1]);
    expect(failing({ ...report, opportunities: [opp("a"), opp("b"), { ...opp("c"), businessRelevance: { text: "t", profileFields: ["made-up"], factIds: ["nope"] } }] })).toEqual([1]);
    expect(failing({ ...report, contextUsed: { profileVersionId: null, factIds: [] } })).toEqual([2]);
    expect(failing({ ...report, contextUsed: { profileVersionId: "pv", factIds: ["not-real"] } })).toEqual([2]);
    expect(failing({ ...report, opportunities: [opp("a"), opp("b"), opp("A")] })).toEqual([3]);
    expect(failing({ ...report, findings: [{ statement: "x", basis: "observed", sourceRefIds: ["elsewhere"] }] })).toEqual([4]);
    expect(failing({ ...report, findings: [{ statement: "x", basis: null, sourceRefIds: ["s1"] }] })).toEqual([5]);
    expect(failing({ ...report, limits: [] })).toEqual([6]);
    expect(failing(report, { prioritizedCount: 2 })).toEqual([7]);
    expect(failing(report, { runCostCents: 301 })).toEqual([8]);
    expect(failing(null)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("accepts an opportunity with no source only when it says it is uncertain, and does not count it as supported", () => {
    const hypothesis = { ...opp("c"), evidence: { sourceRefIds: [], uncertainty: "hypothesis" as const } };
    // Labelled, so the evidence rule (4) passes; but only two are evidence-backed, so the three rule (3) does not.
    expect(failing({ ...report, opportunities: [opp("a"), opp("b"), hypothesis] })).toEqual([3]);
    expect(run({ ...report, opportunities: [opp("a"), opp("b"), hypothesis] }).results.find((row) => row.id === 3)?.detail).toContain("Only 2 opportunities could be supported");
    const unsupported = { ...opp("c"), evidence: { sourceRefIds: [], uncertainty: "none" as const } };
    // With no source and no uncertainty label it is both unsupported (3) and unlabelled (4).
    expect(failing({ ...report, opportunities: [opp("a"), opp("b"), unsupported] })).toEqual([3, 4]);
  });

  it("with no business context on record, relevance must say so", () => {
    const empty = { ...context, profile: null, facts: [] };
    const none = (text: string) => ({ ...opp("x"), businessRelevance: { text, profileFields: [], factIds: [] } });
    const base = { ...report, contextUsed: { profileVersionId: null, factIds: [] } };
    expect(run({ ...base, opportunities: [none("No business context on record."), { ...none("No business context on record"), proposedAction: "y" }, { ...none("no business context on record."), proposedAction: "z" }] }, { context: empty }).passed).toBe(true);
    expect(failing({ ...base, opportunities: [none("Great fit."), { ...none("x"), proposedAction: "y" }, { ...none("x"), proposedAction: "z" }] }, { context: empty })).toEqual([1]);
  });
});
