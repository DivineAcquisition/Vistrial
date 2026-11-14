/**
 * @vitest-environment edge-runtime
 *
 * Pipeline Forensics (Dealmaker): every figure computed in code from the CRM's own rows, the checks, and whole
 * runs with a scripted model through the shared CRM layer: a review saved with Your data evidence, a
 * revision after a failed check, and "Not enough data" without a model call when no CRM is connected or the
 * pipeline is too small. docs/rebuild/dealmaker.md, section 4.1.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CrmActivity, CrmAppointment, CrmDeal, CrmPipeline } from "./lib/crm/types";
import type { ScriptedModel } from "./lib/toolRouter";
import { runChecks } from "./skills/pipelineForensics/checks";
import { computeForensics, type ForensicsInput } from "./skills/pipelineForensics/compute";
import { MIN_DEALS, type ForensicsRecord, type Review } from "./skills/pipelineForensics/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";
const SKILL = "pipeline-forensics";

const PIPELINE: CrmPipeline = {
  ref: "pipe1",
  name: "Sales calls",
  stages: [
    { ref: "stNew", name: "New lead", order: 0 },
    { ref: "stBooked", name: "Call booked", order: 1 },
    { ref: "stProposal", name: "Proposal sent", order: 2 },
  ],
};

function deal(ref: string, input: Partial<CrmDeal> = {}): CrmDeal {
  return { ref, pipelineRef: "pipe1", stageRef: "stNew", status: "open", value: 1000, source: "Facebook ads", contactRef: `c-${ref}`, ownerRef: null, createdAt: NOW - 60 * DAY, updatedAt: NOW - 2 * DAY, stageChangedAt: NOW - 2 * DAY, statusChangedAt: null, ...input };
}

/**
 * A coaching business's pipeline: 8 fresh new leads, 6 booked calls, 8 proposals that went quiet, 6 won and
 * 4 lost in the window, 10 booked calls (7 showed, 3 no-shows) and 6 new leads with a first reply.
 */
function fixture(): ForensicsInput {
  const deals: CrmDeal[] = [];
  for (let i = 0; i < 8; i += 1) deals.push(deal(`n${i}`, { stageRef: "stNew", stageChangedAt: NOW - (i + 1) * DAY }));
  for (let i = 0; i < 6; i += 1) deals.push(deal(`b${i}`, { stageRef: "stBooked", stageChangedAt: NOW - (i + 3) * DAY }));
  for (let i = 0; i < 8; i += 1) deals.push(deal(`p${i}`, { stageRef: "stProposal", value: 3000, stageChangedAt: NOW - (20 + i) * DAY, updatedAt: NOW - 20 * DAY }));
  for (let i = 0; i < 6; i += 1) deals.push(deal(`w${i}`, { status: "won", stageRef: "stProposal", value: 2500, statusChangedAt: NOW - (5 + i) * DAY, source: i < 4 ? "Referral" : "Facebook ads" }));
  for (let i = 0; i < 4; i += 1) deals.push(deal(`l${i}`, { status: "lost", stageRef: "stBooked", statusChangedAt: NOW - (8 + i) * DAY }));
  const activities: CrmActivity[] = [];
  const contacts: { ref: string; addedAt: number | null }[] = [];
  for (let i = 0; i < 6; i += 1) {
    contacts.push({ ref: `c-n${i}`, addedAt: NOW - 10 * DAY });
    activities.push({ ref: `t${i}`, kind: "call", direction: "outbound", at: NOW - 10 * DAY + (i + 1) * 3_600_000, contactRef: `c-n${i}`, dealRef: null, status: "completed", seconds: 300, fromStageRef: null, toStageRef: null });
  }
  for (let i = 0; i < 5; i += 1) activities.push({ ref: `m${i}`, kind: "stage_change", direction: null, at: NOW - 30 * DAY, contactRef: null, dealRef: `b${i}`, status: null, seconds: null, fromStageRef: "stNew", toStageRef: "stBooked" });
  const appointments: CrmAppointment[] = [];
  for (let i = 0; i < 10; i += 1) appointments.push({ ref: `a${i}`, startsAt: NOW - (i + 1) * DAY, status: i < 7 ? "showed" : "noShow", contactRef: `c-b${i % 6}`, dealRef: null });
  return {
    crm: { label: "HighLevel", accountName: "Aster Coaching", currency: "USD" },
    stageHistory: "diffed",
    pipelines: [PIPELINE],
    deals,
    activities,
    appointments,
    contacts,
    now: NOW,
    windowDays: 90,
    stalledDays: 14,
    sourceId: "src1",
  };
}

const figure = (record: ForensicsRecord, label: string) => record.figures.find((row) => row.label === label);

describe("pipeline figures (code)", () => {
  it("works out each stage, the quiet deals and the stall from the CRM's own rows", () => {
    const record = computeForensics(fixture(), "proj1");
    expect(record.hasData).toBe(true);
    expect(record.pipeline).toEqual({ ref: "pipe1", name: "Sales calls" });
    expect(record.stages.map((row) => [row.name, row.open, row.stalled, row.movedOn])).toEqual([
      ["New lead", 8, 0, 5],
      ["Call booked", 6, 0, 0],
      ["Proposal sent", 8, 8, 0],
    ]);
    expect(record.stages[2].medianDays).toBe(24);
    expect(record.stall).toEqual({ stageRef: "stProposal", name: "Proposal sent", why: "stalled" });
    expect(figure(record, "Open deals")?.display).toBe("22");
    expect(figure(record, "Value of open deals")?.display).toBe("$38,000");
    expect(figure(record, "Deals quiet for 14 days or more")?.display).toBe("8");
    expect(figure(record, "Value of deals quiet for 14 days or more")?.display).toBe("$24,000");
    expect(figure(record, "Close rate")).toMatchObject({ display: "60%", formula: "6 won of 10 closed", computed: true });
    expect(figure(record, "Show rate")).toMatchObject({ display: "70%", formula: "7 showed of 10 calls marked showed or no-show" });
    expect(figure(record, "Typical time to first reply to a new lead")?.display).toBe("4 hours");
    expect(figure(record, "Won from Referral")?.display).toBe("4 ($10,000)");
    // Every figure cites the CRM source, and ids are stable.
    expect(record.figures.every((row) => row.sourceRefIds.join() === "src1")).toBe(true);
    expect(record.figures[0].id).toBe("P1");
    expect(record.missing).toEqual(["Stage moves are found by comparing one read of HighLevel with the last, so a deal that moved twice between reads counts once."]);
  });

  it("makes no rate below the sample, and says so instead", () => {
    const input = fixture();
    input.deals = input.deals.filter((row) => row.status === "open").concat(input.deals.filter((row) => row.status === "won").slice(0, 2));
    input.appointments = input.appointments.slice(0, 3);
    input.contacts = input.contacts.slice(0, 2);
    const record = computeForensics(input, "proj1");
    expect(figure(record, "Close rate")).toBeUndefined();
    expect(figure(record, "Show rate")).toBeUndefined();
    expect(figure(record, "Typical time to first reply to a new lead")).toBeUndefined();
    expect(record.missing.filter((row) => row.startsWith("Not enough data")).length).toBe(3);
  });

  it("says Not enough data with too few deals, and names the slowest stage when nothing is quiet", () => {
    const small = fixture();
    small.deals = small.deals.slice(0, MIN_DEALS - 1);
    const thin = computeForensics(small, "proj1");
    expect(thin.hasData).toBe(false);
    expect(thin.figures).toEqual([]);
    expect(thin.missing[0]).toMatch(/^Not enough data: the Sales calls pipeline has 19 deals/);

    const busy = fixture();
    busy.activities.push(...busy.deals.map((row, i) => ({ ref: `x${i}`, kind: "email" as const, direction: "outbound" as const, at: NOW - DAY, contactRef: row.contactRef, dealRef: row.ref, status: null, seconds: null, fromStageRef: null, toStageRef: null })));
    const record = computeForensics(busy, "proj1");
    expect(record.stages.every((row) => row.stalled === 0)).toBe(true);
    expect(record.stall).toEqual({ stageRef: "stProposal", name: "Proposal sent", why: "slowest" });
  });
});

/** A review that passes every check, written from the figures. */
function goodReview(record: ForensicsRecord): Review {
  const quiet = record.figures.find((row) => row.label === "Quiet deals in Proposal sent")!;
  const close = record.figures.find((row) => row.label === "Close rate")!;
  const show = record.figures.find((row) => row.label === "Show rate")!;
  return {
    summary: "Most deals stop after the proposal. Calls show up and close well once they happen.",
    stallReason: `${quiet.display} proposals have had no reply or move for two weeks or more.`,
    stallFigureIds: [quiet.id],
    findings: [
      { statement: `The close rate is ${close.display}.`, figureIds: [close.id] },
      { statement: `The show rate is ${show.display}.`, figureIds: [show.id] },
    ],
    steps: [
      { phase: "fix", problem: `${quiet.display} proposals are quiet.`, figureIds: [quiet.id], action: "Call every proposal on day three after sending it", targetMetric: quiet.label, target: `Fewer than ${quiet.display}` },
      { phase: "build", problem: "Not enough data on why proposals stall.", figureIds: [], action: "Ask each lost lead one question about the proposal", targetMetric: close.label, target: "Not enough data" },
    ],
    limits: [],
  };
}

describe("pipeline review checks (code)", () => {
  const record = computeForensics(fixture(), "proj1");

  it("passes a review grounded in the CRM's own figures", () => {
    expect(runChecks(goodReview(record), record)).toMatchObject({ passed: true });
  });

  it("fails a review that names another stage, invents a number, benchmarks, promises, or skips the fix", () => {
    const good = goodReview(record);
    const open = record.figures.find((row) => row.label === "Open deals in New lead")!;
    const fail = (review: Review) => runChecks(review, record).results.filter((row) => !row.passed).map((row) => row.id);
    expect(fail({ ...good, stallFigureIds: [open.id] })).toEqual([1]);
    expect(fail({ ...good, findings: [good.findings[0], { statement: "The close rate could reach 85%.", figureIds: [good.findings[0].figureIds[0]] }] })).toEqual([3]);
    expect(fail({ ...good, summary: "Your close rate beats the industry average." })).toEqual([4]);
    expect(fail({ ...good, summary: "This plan is guaranteed to fix the pipeline." })).toEqual([5]);
    expect(fail({ ...good, steps: good.steps.slice(1) })).toEqual([6]);
    expect(fail({ ...good, findings: [{ statement: "Things are slow.", figureIds: [] }, good.findings[1]] })).toEqual([2]);
    expect(runChecks(null, record).passed).toBe(false);
  });
});

// ---------- Whole runs ----------

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

type ScriptFigure = { id: string; label: string; display: string; stage?: string };

/** The figures the review step was given, read back from its input. */
function figuresIn(input: string): ScriptFigure[] {
  const line = input.split("\n").find((row) => row.startsWith('[{"id":"P'));
  return line ? (JSON.parse(line) as ScriptFigure[]) : [];
}

/** A scripted model that answers the review from the figures it was given. `benchmarkFirst` fails the first draft once. */
function script(options: { benchmarkFirst?: boolean } = {}) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    inputs.push(input);
    const revise = input.startsWith("Revise the pipeline review");
    if (!input.startsWith("Review where") && !revise) throw new Error(`unscripted call: ${input.slice(0, 40)}`);
    const figures = figuresIn(input);
    const quiet = figures.find((row) => row.label === "Quiet deals in Proposal sent")!;
    const close = figures.find((row) => row.label === "Close rate")!;
    const won = figures.find((row) => row.label === "Deals won")!;
    return {
      text: JSON.stringify({
        summary: options.benchmarkFirst && !revise ? "Your close rate is above the industry average." : "Most deals stop after the proposal.",
        stallReason: `${quiet.display} proposals have gone quiet.`,
        stallFigureIds: [quiet.id],
        findings: [
          { statement: `The close rate is ${close.display}.`, figureIds: [close.id] },
          { statement: `${won.display} deals were won.`, figureIds: [won.id] },
        ],
        steps: [{ phase: "fix", problem: `${quiet.display} proposals are quiet.`, figureIds: [quiet.id], action: "Call every proposal on day three", targetMetric: quiet.label, target: `Fewer than ${quiet.display}` }],
        limits: [],
      }),
    };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

async function setup(options: { crm?: boolean; deals?: number } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  // Dealmaker is planned in the catalog; these runs exercise the skill as it will run once it is live.
  await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", AGENT)).unique())!;
    await ctx.db.patch(agent._id, { status: "live" });
    for (const workKind of ["classify", "research", "write"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  if (options.crm !== false) {
    const input = fixture();
    const now = Date.now();
    const shift = now - NOW;
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", {
        workspaceId,
        provider: "highlevel",
        status: "connected",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: now + DAY,
        scopes: [],
        accountId: "loc1",
        accountName: "Aster Coaching",
        currency: "USD",
        connectedBy: "dana",
        connectedAt: now - 30 * DAY,
        lastSyncAt: now - 3_600_000,
        callsOk: 0,
        callsFailed: 0,
      });
      const base = { workspaceId, connectionId, seenAt: now };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "pipe1", name: "Sales calls", stages: PIPELINE.stages.map((row) => ({ id: row.ref, name: row.name, position: row.order })) });
      const at = (value: number | null) => (value === null ? undefined : value + shift);
      for (const row of input.deals.slice(0, options.deals ?? input.deals.length)) {
        await ctx.db.insert("crmDeals", { ...base, externalId: row.ref, pipelineId: row.pipelineRef, stageId: row.stageRef, status: row.status, value: row.value, source: row.source ?? undefined, contactId: row.contactRef ?? undefined, createdAt: at(row.createdAt), updatedAt: at(row.updatedAt), lastStageChangeAt: at(row.stageChangedAt), lastStatusChangeAt: at(row.statusChangedAt) });
      }
      for (const row of input.contacts) await ctx.db.insert("crmContacts", { ...base, externalId: row.ref, tags: [], addedAt: at(row.addedAt) });
      for (const row of input.activities) {
        await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: row.ref, kind: row.kind as "call", direction: row.direction ?? undefined, at: row.at + shift, contactId: row.contactRef ?? undefined, dealId: row.dealRef ?? undefined, status: row.status ?? undefined, fromStage: row.fromStageRef ?? undefined, toStage: row.toStageRef ?? undefined });
      }
      for (const row of input.appointments) await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: row.ref, kind: "appointment", at: row.startsAt + shift, contactId: row.contactRef ?? undefined, status: row.status === "noShow" ? "noshow" : row.status });
    });
  }
  return { t, owner, workspaceId };
}

async function runReview(s: Awaited<ReturnType<typeof setup>>) {
  const projectId = await s.owner.mutation(api.research.createProject, { workspaceId: s.workspaceId, title: "Pipeline review", objective: "Where do deals stop?", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [] });
  const runId = await s.owner.mutation(api.runs.start, { workspaceId: s.workspaceId, agentSlug: AGENT, skillSlug: SKILL, projectId });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  const assets = await s.t.run((ctx) => ctx.db.query("assets").withIndex("by_workspace_kind", (q) => q.eq("workspaceId", s.workspaceId).eq("kind", "pipelineReview")).collect());
  const asset = assets[0] ?? null;
  const versions = asset ? await s.t.run((ctx) => ctx.db.query("assetVersions").collect()) : [];
  const evidence = await s.t.run((ctx) => ctx.db.query("evidence").collect());
  const sources = await s.t.run((ctx) => ctx.db.query("sourceRefs").collect());
  return { status, asset, versions, evidence, sources };
}

describe("a pipeline review, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("reads the CRM through the shared layer, writes one review, and saves it as a draft with Your data evidence", async () => {
    const inputs = script();
    const s = await setup();
    const out = await runReview(s);
    expect(out.status).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("Code found the stage where most deals stop: Proposal sent");
    expect(inputs[0]).toContain("UNTRUSTED CONTENT");
    expect(out.asset).toMatchObject({ kind: "pipelineReview", status: "draft", title: "Pipeline review: Aster Coaching", currentVersion: 1 });
    expect(out.versions[0].body).toContain("## Where deals stop");
    expect(out.versions[0].body).toContain("Proposal sent (most deals stop here)");
    // One CRM source, Your data; every figure and finding cites it.
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]).toMatchObject({ platform: "customerData", title: "Your CRM: Aster Coaching (HighLevel)" });
    const stall = out.evidence.find((row) => row.claimKey === "stall")!;
    expect(stall).toMatchObject({ basis: "firstParty" });
    expect(stall.sourceRefIds).toEqual([out.sources[0]._id]);
    expect(out.evidence.find((row) => row.claimKey === "step-1")).toMatchObject({ basis: "inferred" });
    // Nothing was proposed in the CRM.
    expect(await s.t.run((ctx) => ctx.db.query("crmActions").collect())).toEqual([]);
  });

  it("revises once when the first draft fails a check, and keeps both versions", async () => {
    const inputs = script({ benchmarkFirst: true });
    const out = await runReview(await setup());
    expect(inputs.map((row) => row.split("\n")[0])).toEqual(["Review where this business's deals stop moving, from its own CRM.", "Revise the pipeline review so it passes these failed checks, and change nothing else that passed."]);
    expect(inputs[1]).toContain("No outside benchmarks");
    expect(out.asset).toMatchObject({ status: "draft", currentVersion: 2 });
    expect(out.versions.map((row) => row.version).sort()).toEqual([1, 2]);
  });

  it("says Not enough data without calling a model when no CRM is connected, or the pipeline is too small", async () => {
    const inputs = script();
    const none = await runReview(await setup({ crm: false }));
    expect(none.status).toBe("completed");
    expect(none.asset).toMatchObject({ status: "needsReview", title: "Pipeline review" });
    expect(none.versions[0].body).toContain("no CRM is connected here");
    expect(none.evidence.map((row) => row.basis)).toEqual(["insufficient"]);

    const small = await runReview(await setup({ deals: 10 }));
    expect(small.asset?.status).toBe("needsReview");
    expect(small.versions[0].body).toContain("a review needs at least 20");
    expect(inputs).toEqual([]);
  });
});
