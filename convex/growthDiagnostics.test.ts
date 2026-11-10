/**
 * @vitest-environment edge-runtime
 *
 * Growth Diagnostics end to end, with a scripted model that answers like a real one: a run on Meta results
 * plus a results file, "Not enough data" with neither, the figures computed in code, and workspace
 * isolation and roles. Each test checks what the run did and saved, not what it said.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ScriptedModel } from "./lib/toolRouter";
import { CATALOG } from "./catalog";
import { skillFor } from "./lib/skills";
import { runChecks, unsupportedNumbers } from "./skills/growthDiagnostics/checks";
import { computeDiagnostics, type MetaInput } from "./skills/growthDiagnostics/compute";
import { readDiagnosis, type DiagnosticsRecord, type Diagnosis } from "./skills/growthDiagnostics/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const AGENT = "growth-architect";
const GD = "growth-diagnostics";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

type ScriptFigure = { id: string; stage: string; label: string; display: string };

/** The figures list the diagnose step was given, read back from its input. */
function figuresIn(input: string): ScriptFigure[] {
  const line = input.split("\n").find((row) => row.startsWith('[{"id":"F'));
  return line ? (JSON.parse(line) as ScriptFigure[]) : [];
}

/**
 * A scripted model that records every input and answers the diagnose step from the figures it was given.
 * `benchmarkFirst` makes the first draft compare with an industry average, so the checks fail once.
 */
function script(options: { benchmarkFirst?: boolean; noRoadmap?: boolean } = {}) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    inputs.push(input);
    const figures = figuresIn(input);
    const leads = figures.filter((row) => row.stage === "leads");
    const clicks = figures.filter((row) => row.stage === "clicks");
    const stageRows = leads.length ? leads : figures;
    const stage = stageRows[0]?.stage ?? "unknown";
    const first = stageRows.find((row) => row.label.includes("cost per")) ?? stageRows[0];
    const second = clicks[0] ?? figures[0];
    const revise = input.startsWith("Revise the growth diagnosis");
    if (!input.startsWith("Diagnose where") && !revise) throw new Error(`unscripted call: ${input.slice(0, 40)}`);
    const benchmark = options.benchmarkFirst && !revise;
    return {
      text: JSON.stringify({
        summary: benchmark ? "Your leads cost more than the industry average." : "Clicks turn into leads less often than they could.",
        stage,
        stageReason: "The fewest people move on at this step.",
        stageFigureIds: first ? [first.id] : [],
        findings: [
          { statement: `${first.label} is ${first.display}.`, figureIds: [first.id] },
          { statement: `${second.label} is ${second.display}.`, figureIds: [second.id] },
        ],
        fixes: [
          { fix: "Send every lead a reply within an hour", why: "Fewer clicks become leads.", figureIds: [first.id], howToTell: `Watch ${first.label} over the next 30 days.` },
          { fix: "Move spend to the campaign with the lowest cost per lead", why: "Cost per lead differs between campaigns.", figureIds: [second.id], howToTell: `Watch ${second.label} over the next 30 days.` },
        ],
        roadmap: options.noRoadmap
          ? []
          : [
              { phase: "fix", problem: `${first.label} is ${first.display}.`, figureIds: [first.id], action: "Reply to every lead within an hour", targetMetric: first.label, target: `Better than ${first.display}` },
              { phase: "build", problem: `${second.label} is ${second.display}.`, figureIds: [second.id], action: "Test a new headline on the best campaign", targetMetric: second.label, target: `Higher than ${second.display}` },
              { phase: "scale", problem: "Not enough data to size the next channel.", figureIds: [], action: "Put the saved budget behind the winning ad", targetMetric: first.label, target: "Not enough data" },
            ],
        limits: [],
      }),
    };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

async function seed(t: Tester, name: string, offer: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await owner.mutation(api.profile.saveDraft, { workspaceId, offer, priceNotes: "", audience: "Homeowners", geography: "Austin, TX", channels: "Meta", brandVoice: "Plain", competitors: [] });
  await owner.mutation(api.profile.confirm, { workspaceId });
  await t.run(async (ctx) => {
    for (const workKind of ["classify", "research", "write"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  return { owner, workspaceId };
}

/** The same project the app's "Run a diagnosis" button creates. */
async function project(caller: Caller, workspaceId: Id<"workspaces">) {
  return caller.mutation(api.research.createProject, {
    workspaceId,
    title: "Growth diagnosis",
    objective: "Where does growth stall, from our own data?",
    market: "",
    geography: "",
    competitors: [],
    platforms: ["customerData"],
    suppliedUrls: [],
  });
}

async function run(t: Tester, caller: Caller, workspaceId: Id<"workspaces">) {
  const projectId = await project(caller, workspaceId);
  const runId = await caller.mutation(api.runs.start, { workspaceId, agentSlug: AGENT, skillSlug: GD, projectId });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return { runId, status, projectId };
}

async function diagnosisAsset(caller: Caller, workspaceId: Id<"workspaces">) {
  const list = await caller.query(api.assets.list, { workspaceId, kind: "growthDiagnosis", paginationOpts: { numItems: 5, cursor: null } });
  const row = list.page[0];
  return row ? await caller.query(api.assets.get, { workspaceId, assetId: row.id }) : null;
}

type EvidenceRow = { claimKey: string; statement: string | null; basis: string | null; computed: boolean; sources: { id: string; platform: string }[] };

async function connectMeta(t: Tester, workspaceId: Id<"workspaces">, account = "Bay Area Cleaning", campaign = "New Customer $50 Special") {
  await t.run(async (ctx) => {
    await ctx.db.insert("metaConnections", {
      workspaceId,
      source: "oauth",
      accessToken: "SECRET",
      scopes: ["ads_read"],
      metaUserId: "m1",
      metaUserName: "Pat",
      connectedBy: "x",
      connectedAt: 1,
      status: "connected",
      adAccountId: "act_123456",
      adAccountName: account,
      currency: "USD",
      callsOk: 0,
      callsFailed: 0,
    });
    await ctx.db.insert("metaAdSnapshots", {
      workspaceId,
      adAccountId: "act_123456",
      currency: "USD",
      range: "maximum",
      dateStart: "2024-06-20",
      dateStop: "2026-11-05",
      syncedAt: 1793900000000,
      totals: { spend: 5859.21, impressions: 248082, clicks: 3136, reach: 164353, active: 0, ctr: 0.0126, cpc: 1.87 },
      daily: [],
      campaigns: [
        { id: "c1", name: campaign, status: "PAUSED", objective: "OUTCOME_LEADS", spend: 3913.89, impressions: 151200, reach: 98000, clicks: 1874, ctr: 0.0124, cpc: 2.09, resultLabel: "Leads", results: 182, costPerResult: 21.5 },
        { id: "c2", name: "Idle", status: "PAUSED", objective: "OUTCOME_LEADS", spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: null, cpc: null, resultLabel: "Leads", results: 0, costPerResult: null },
      ],
    });
  });
}

async function uploadResults(t: Tester, workspaceId: Id<"workspaces">, label = "Google Ads", spend = 200, conversions = 12) {
  await t.run(async (ctx) => {
    await ctx.db.insert("resultUploads", {
      workspaceId,
      fileName: "google-ads.csv",
      label,
      currency: "USD",
      uploadedBy: "x",
      createdAt: 1793900000000,
      status: "ready",
      summary: {
        rows: 2,
        dateStart: "2026-09-01",
        dateStop: "2026-09-30",
        metrics: ["spend", "conversions", "revenue"],
        totals: { spend, conversions, revenue: 1800 },
        groupBy: "Campaign",
        groups: [{ name: "Search - Brand", spend: 120, conversions: 10 }],
        otherGroups: 0,
        ignoredColumns: [],
      },
    });
  });
}

describe("Growth Diagnostics", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("is available in the catalog and runs on the Growth Architect", () => {
    const skill = CATALOG.find((row) => row.slug === AGENT)!.skills.find((row) => row.slug === GD)!;
    expect(skill.status).toBe("available");
    expect(skill.promise).toBe("It does not change your accounts.");
    expect(skillFor(GD, false)?.agentSlug).toBe(AGENT);
  });

  it("diagnoses from Meta results plus a results file, citing them as Your data with computed figures marked", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    await connectMeta(t, a.workspaceId);
    await uploadResults(t, a.workspaceId);
    const inputs = script();
    const { status, projectId } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");

    // One model call, given figures worked out in code, never asked to do arithmetic.
    expect(inputs).toHaveLength(1);
    const figures = figuresIn(inputs[0]);
    const display = (label: string) => figures.find((row) => row.label === label)?.display;
    expect(display("Meta ads (Bay Area Cleaning): click-through rate")).toBe("1.26%");
    expect(display("Meta ads (Bay Area Cleaning): cost per click")).toBe("$1.87");
    expect(display("Meta ads (Bay Area Cleaning): cost per lead")).toBe("$21.50");
    expect(display('Meta campaign "New Customer $50 Special": clicks that became leads')).toBe("9.71%");
    expect(display("Google Ads (your file): cost per conversion")).toBe("$16.67");
    expect(display("Google Ads (your file): revenue for each unit spent")).toBe("9.00x");
    expect(display('Google Ads campaign "Search - Brand": cost per conversion')).toBe("$12.00");
    expect(inputs[0]).toContain("Deep house cleaning");
    expect(inputs[0]).not.toContain("SECRET");

    const own = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.platform === "customerData");
    expect(own.map((row) => row.title)).toEqual(
      expect.arrayContaining(["Your Meta ads: Bay Area Cleaning (all time)", "Your Meta campaign: New Customer $50 Special", "Your results: Google Ads (google-ads.csv)"]),
    );

    const asset = await diagnosisAsset(a.owner, a.workspaceId);
    expect(asset?.kind).toBe("growthDiagnosis");
    expect(asset?.status).toBe("draft");
    expect(asset?.body).toContain("## Where growth stalls");
    expect(asset?.body).toContain("**Leads or bookings.**");
    expect(asset?.body).toContain("## Fixes, in order");
    expect(asset?.body).toContain("How to tell if it worked:");
    // No revenue gap: the file has revenue. The asset names nothing missing that is present.
    expect(asset?.body).not.toContain("Not enough data on revenue");
    const evidence = (asset?.evidence ?? []) as EvidenceRow[];
    const findings = evidence.filter((row) => row.claimKey.startsWith("finding-") || row.claimKey === "stall-stage");
    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const row of findings) {
      expect(row.basis).toBe("firstParty");
      expect(row.sources.every((source) => source.platform === "customerData")).toBe(true);
    }
    const computedFigure = evidence.find((row) => row.statement?.startsWith("Meta ads (Bay Area Cleaning): cost per lead"));
    expect(computedFigure?.computed).toBe(true);
    expect(computedFigure?.statement).toContain("computed: $3,914 spend ÷ 182 leads");
    expect(evidence.filter((row) => row.claimKey.startsWith("fix-"))).toHaveLength(2);

    // The session page finds the saved asset under the "save" step.
    const studio = await a.owner.query(api.studio.studio, { workspaceId: a.workspaceId, projectId });
    expect(studio.run?.skillSlug).toBe(GD);
    expect(studio.assetId).toBe(asset?.id);
  });

  it("aims a 90-day roadmap at the owner's goal and saves it in three phases with its figures", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    await a.owner.mutation(api.goals.set, { workspaceId: a.workspaceId, text: "40 more bookings a month" });
    await connectMeta(t, a.workspaceId);
    const inputs = script();
    const { status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");
    expect(inputs[0]).toContain('The owner\'s goal, in their words: "40 more bookings a month"');
    expect(inputs[0]).toContain("roadmap: a firm 90-day plan in three phases");
    const asset = (await diagnosisAsset(a.owner, a.workspaceId))!;
    expect(asset.status).toBe("draft");
    expect(asset.body).toContain("## 90-day roadmap");
    expect(asset.body).toContain("_Goal: 40 more bookings a month_");
    expect(asset.body.indexOf("### Fix (Weeks 1-4)")).toBeLessThan(asset.body.indexOf("### Build (Weeks 5-8)"));
    expect(asset.body).toContain("### Scale (Weeks 9-12)");
    const roadmap = (asset.evidence as EvidenceRow[]).filter((row) => row.claimKey.startsWith("roadmap-"));
    expect(roadmap.map((row) => row.basis)).toEqual(["inferred", "inferred", "insufficient"]);
    const view = await a.owner.query(api.workTabs.diagnostics, { workspaceId: a.workspaceId });
    expect(view.diagnosis?.roadmap.map((row) => row.phase)).toEqual(["fix", "build", "scale"]);
    expect(view.diagnosis?.roadmap[0].figures.length).toBe(1);
  });

  it("revises a draft whose roadmap misses a phase", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    await connectMeta(t, a.workspaceId);
    const inputs = script({ noRoadmap: true });
    await run(t, a.owner, a.workspaceId);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain("A 90-day roadmap in three phases");
  });

  it("says Not enough data with no first-party data, names what to connect, and calls no model", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    const inputs = script();
    const { status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");
    expect(inputs).toHaveLength(0);

    const asset = await diagnosisAsset(a.owner, a.workspaceId);
    expect(asset?.status).toBe("needsReview");
    // The save step queued the report-ready email; it runs apart from the run, so it cannot fail it.
    const queued = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(queued.filter((row) => row.name.includes("emailReminders")).map((row) => row.args)).toEqual([[{ assetId: asset!.id }]]);
    expect(asset?.body).toContain("## Not enough data");
    expect(asset?.body).toContain("Connect your Meta ad account under Connections → Meta ads");
    expect(asset?.body).toContain("Connections → Results files");
    expect(asset?.body).not.toMatch(/\$\d|\d%/);
    const evidence = (asset?.evidence ?? []) as EvidenceRow[];
    expect(evidence).toHaveLength(1);
    expect(evidence[0].basis).toBe("insufficient");
    expect(evidence[0].statement).toMatch(/^Not enough data: /);
    expect(evidence[0].sources).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.query("sourceRefs").collect())).length).toBe(0);
  });

  it("names exactly what to fix when the Meta connection needs reconnecting", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    await connectMeta(t, a.workspaceId);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("metaConnections").first())!;
      await ctx.db.patch(row._id, { status: "needsReconnect" });
    });
    script();
    await run(t, a.owner, a.workspaceId);
    const asset = await diagnosisAsset(a.owner, a.workspaceId);
    expect(asset?.body).toContain("Reconnect your Meta ad account under Connections → Meta ads");
  });

  it("revises once when a draft compares against an outside benchmark, and keeps both versions", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    await uploadResults(t, a.workspaceId);
    const inputs = script({ benchmarkFirst: true });
    const { status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain("No outside benchmarks");
    const asset = await diagnosisAsset(a.owner, a.workspaceId);
    expect(asset?.currentVersion).toBe(2);
    expect(asset?.status).toBe("draft");
    expect(asset?.body).not.toContain("more than the industry average");
  });

  it("never reads another workspace's data", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    const b = await seed(t, "Beta", "Commercial janitorial contracts");
    await connectMeta(t, a.workspaceId, "Alpha Private Account", "Alpha Secret Campaign");
    await uploadResults(t, a.workspaceId, "Alpha CRM", 777, 7);
    await uploadResults(t, b.workspaceId, "Beta Bookings", 300, 15);
    const inputs = script();
    const { status, projectId } = await run(t, b.owner, b.workspaceId);
    expect(status).toBe("completed");

    const everything = inputs.join("\n");
    expect(everything).toContain("Beta Bookings");
    expect(everything).toContain("Commercial janitorial contracts");
    for (const leak of ["Alpha", "Bay Area", "$777", "Deep house cleaning", "Meta ads ("]) expect(everything).not.toContain(leak);

    const refs = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.projectId === projectId);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((row) => row.workspaceId === b.workspaceId)).toBe(true);
    const asset = await diagnosisAsset(b.owner, b.workspaceId);
    expect(asset?.body).not.toContain("Alpha");
    const cited = ((asset?.evidence ?? []) as EvidenceRow[]).flatMap((row) => row.sources.map((source) => source.id));
    expect(cited.every((id) => refs.some((row) => row._id === id))).toBe(true);
    // Alpha has no diagnosis, and Beta's asset cannot be read from Alpha.
    expect(await diagnosisAsset(a.owner, a.workspaceId)).toBeNull();
    await expect(a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: asset!.id as Id<"assets"> })).rejects.toThrow();
  });

  it("only an Owner or Manager of the workspace can start one, and only on its own project", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    const b = await seed(t, "Beta", "Commercial janitorial contracts");
    script();
    const projectId = await project(a.owner, a.workspaceId);
    await expect(b.owner.mutation(api.runs.start, { workspaceId: b.workspaceId, agentSlug: AGENT, skillSlug: GD, projectId })).rejects.toThrow();
    await expect(b.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: AGENT, skillSlug: GD, projectId })).rejects.toThrow();
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId: a.workspaceId, userId: "Alpha-rep", role: "rep", displayName: "Rep", active: true });
    });
    const rep = t.withIdentity(person("Alpha-rep"));
    await expect(rep.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: AGENT, skillSlug: GD, projectId })).rejects.toThrow();
    // Without a project, the skill refuses to start.
    await expect(a.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: AGENT, skillSlug: GD })).rejects.toThrow("Choose a research project first.");
    const runs = await t.run((ctx) => ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(0);
  });
});

describe("Growth Diagnostics figures, computed in code", () => {
  const snapshot: MetaInput["snapshot"] = {
    currency: "USD",
    dateStart: "2026-10-01",
    dateStop: "2026-10-28",
    totals: { spend: 1400, impressions: 140000, clicks: 1400, reach: 70000, active: 1, ctr: 0.01, cpc: 1 },
    // 14 days at 100 clicks per 10,000 impressions, then 14 days at 50 clicks per 10,000 for the same spend.
    daily: Array.from({ length: 28 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, spend: 50, impressions: 5000, clicks: i < 14 ? 50 + (i % 1) : 0 })).map((row, i) => ({
      ...row,
      clicks: i < 14 ? 66.6667 : 33.3333,
    })),
    campaigns: [
      { id: "a", name: "A", status: "ACTIVE", objective: "OUTCOME_LEADS", spend: 1000, impressions: 100000, reach: 50000, clicks: 1000, ctr: 0.01, cpc: 1, resultLabel: "Leads", results: 40, costPerResult: 25 },
      { id: "b", name: "B", status: "ACTIVE", objective: "OUTCOME_LEADS", spend: 400, impressions: 40000, reach: 20000, clicks: 400, ctr: 0.01, cpc: 1, resultLabel: "Leads", results: 10, costPerResult: 40 },
    ],
  };
  const meta: MetaInput = { snapshot, account: "Shop", accountSourceId: "acct", campaignSourceIds: { a: "src-a", b: "src-b" } };

  it("works out rates, cost per result and period changes, each marked computed with its formula", () => {
    const out = computeDiagnostics({ meta, metaState: "ok", uploads: [], decisions: [] });
    const by = (label: string) => out.figures.find((row) => row.label === label)!;
    expect(by("Meta ads (Shop): click-through rate")).toMatchObject({ display: "1.00%", computed: true, sourceRefIds: ["acct"] });
    expect(by("Meta ads (Shop): times each person saw an ad")).toMatchObject({ display: "2.00", computed: true });
    expect(by("Meta ads (Shop): leads")).toMatchObject({ value: 50, computed: true, formula: "sum of leads over 2 campaigns" });
    expect(by("Meta ads (Shop): cost per lead")).toMatchObject({ display: "$28.00", computed: true, formula: "$1,400 spend ÷ 50 leads" });
    expect(by("Meta ads (Shop): clicks that became leads")).toMatchObject({ display: "3.57%" });
    expect(by('Meta campaign "B": cost per lead')).toMatchObject({ display: "$40.00", computed: false, sourceRefIds: ["src-b"] });
    expect(by('Meta campaign "A": clicks that became leads')).toMatchObject({ display: "4.00%", computed: true, sourceRefIds: ["src-a"] });
    expect(by("Meta ads (Shop): change in click-through rate, earlier 14 days to later 14 days")).toMatchObject({ display: "-50.0%", computed: true });
    expect(by("Meta ads (Shop): change in cost per click, earlier 14 days to later 14 days")).toMatchObject({ display: "+100.0%" });
    expect(out.stagesWithData).toEqual(["reach", "clicks", "leads"]);
    expect(out.missing.map((row) => row.stage)).toEqual(["revenue"]);
    expect(out.missing[0].text).toMatch(/^Not enough data on revenue: upload a results file/);
  });

  it("compares a newer results file with an older one for the same source", () => {
    const upload = (id: string, createdAt: number, spend: number, conversions: number, dateStart: string) => ({
      upload: {
        _id: id as Id<"resultUploads">,
        label: "Jobber",
        fileName: `${id}.csv`,
        currency: "USD",
        createdAt,
        summary: { rows: 1, dateStart, dateStop: dateStart.replace(/-01$/, "-28"), metrics: [], totals: { spend, conversions }, groupBy: null, groups: [], otherGroups: 0, ignoredColumns: [] },
      },
      sourceId: `src-${id}`,
    });
    const out = computeDiagnostics({ meta: null, metaState: "none", uploads: [upload("new", 2, 600, 30, "2026-10-01"), upload("old", 1, 500, 40, "2026-09-01")], decisions: [] });
    const conv = out.figures.find((row) => row.label === "Jobber: change in conversions, earlier file to newer file")!;
    expect(conv).toMatchObject({ display: "-25.0%", computed: true, formula: "40 → 30", sourceRefIds: ["src-old", "src-new"] });
    expect(out.figures.find((row) => row.label === "Jobber (your file): cost per conversion")?.display).toBe("$20.00");
    // The older file is the earlier period, not a second current source.
    expect(out.inputs.uploads).toBe(1);
    // Meta not connected is only named when there is nothing else; here reach and clicks are named instead.
    expect(out.missing.map((row) => row.stage)).toEqual(["clicks", "revenue"]);
  });

  it("has no data, and no figures, when nothing is connected", () => {
    const out = computeDiagnostics({ meta: null, metaState: "none", uploads: [], decisions: [] });
    expect(out.hasData).toBe(false);
    expect(out.figures).toHaveLength(0);
    expect(out.missing[0].text).toMatch(/^Not enough data/);
  });
});

describe("Growth Diagnostics checks", () => {
  const record = (): DiagnosticsRecord => {
    const out = computeDiagnostics({
      meta: {
        snapshot: {
          currency: "USD",
          dateStart: "2026-10-01",
          dateStop: "2026-10-28",
          totals: { spend: 1000, impressions: 100000, clicks: 1000, reach: 50000, active: 1, ctr: 0.01, cpc: 1 },
          daily: [],
          campaigns: [{ id: "a", name: "A", status: "ACTIVE", objective: null, spend: 1000, impressions: 100000, reach: 50000, clicks: 1000, ctr: 0.01, cpc: 1, resultLabel: "Leads", results: 40, costPerResult: 25 }],
        },
        account: "Shop",
        accountSourceId: "acct",
        campaignSourceIds: {},
      },
      metaState: "ok",
      uploads: [],
      decisions: [],
    });
    return { projectId: "p", ...out, profile: null, facts: [] };
  };
  const good = (rec: DiagnosticsRecord): Diagnosis => {
    const cpl = rec.figures.find((row) => row.label.endsWith("cost per lead"))!;
    const ctr = rec.figures.find((row) => row.label.endsWith("click-through rate"))!;
    return {
      summary: "Leads are the weak step.",
      stage: "leads",
      stageReason: "Few clicks become leads.",
      stageFigureIds: [cpl.id],
      findings: [{ statement: `Each lead costs ${cpl.display}.`, figureIds: [cpl.id] }],
      fixes: [
        { fix: "Answer leads faster", why: "Costly leads.", figureIds: [cpl.id], howToTell: "Watch cost per lead for 30 days." },
        { fix: "Test a new headline", why: "Click rate.", figureIds: [ctr.id], howToTell: "Watch click-through rate for 30 days." },
      ],
      roadmap: [
        { phase: "fix", problem: `Each lead costs ${cpl.display}.`, figureIds: [cpl.id], action: "Answer leads within an hour", targetMetric: cpl.label, target: `Below ${cpl.display}` },
        { phase: "build", problem: `Click-through rate is ${ctr.display}.`, figureIds: [ctr.id], action: "Test a new headline", targetMetric: ctr.label, target: `Above ${ctr.display}` },
        { phase: "scale", problem: "Not enough data to size a second channel.", figureIds: [], action: "Move budget to the winning ad", targetMetric: cpl.label, target: "Not enough data" },
      ],
      limits: [],
    };
  };

  it("passes a diagnosis that cites its figures and quotes them exactly", () => {
    const rec = record();
    expect(runChecks(good(rec), rec).passed).toBe(true);
  });

  it("fails a number no figure shows, an outside benchmark, a stage without data, and too few fixes", () => {
    const rec = record();
    const invented = { ...good(rec), findings: [{ statement: "Each lead costs $31.40.", figureIds: [good(rec).findings[0].figureIds[0]] }] };
    expect(runChecks(invented, rec).results.find((row) => row.id === 3)?.passed).toBe(false);
    const benchmark = { ...good(rec), summary: "Your click rate is below the industry average." };
    expect(runChecks(benchmark, rec).results.find((row) => row.id === 5)?.passed).toBe(false);
    const noData = { ...good(rec), stage: "revenue" as const };
    expect(runChecks(noData, rec).results.find((row) => row.id === 1)?.passed).toBe(false);
    const oneFix = { ...good(rec), fixes: good(rec).fixes.slice(0, 1) };
    expect(runChecks(oneFix, rec).results.find((row) => row.id === 4)?.passed).toBe(false);
    expect(runChecks(null, rec).passed).toBe(false);
  });

  it("fails a roadmap that misses a phase, invents a number, compares with a benchmark or rests on nothing", () => {
    const rec = record();
    const sixth = (diagnosis: Diagnosis) => runChecks(diagnosis, rec).results.find((row) => row.id === 6)?.passed;
    expect(sixth(good(rec))).toBe(true);
    expect(sixth({ ...good(rec), roadmap: good(rec).roadmap.filter((row) => row.phase !== "scale") })).toBe(false);
    expect(sixth({ ...good(rec), roadmap: [] })).toBe(false);
    const ungrounded = good(rec).roadmap.map((row) => (row.phase === "build" ? { ...row, figureIds: [], problem: "Headlines are weak." } : row));
    expect(sixth({ ...good(rec), roadmap: ungrounded })).toBe(false);
    const noTarget = good(rec).roadmap.map((row) => (row.phase === "fix" ? { ...row, target: "" } : row));
    expect(sixth({ ...good(rec), roadmap: noTarget })).toBe(false);
    const invented = good(rec).roadmap.map((row) => (row.phase === "fix" ? { ...row, target: "Get cost per lead to $14.00" } : row));
    expect(runChecks({ ...good(rec), roadmap: invented }, rec).results.find((row) => row.id === 3)?.passed).toBe(false);
    const benchmark = good(rec).roadmap.map((row) => (row.phase === "build" ? { ...row, target: "Reach the industry average click rate" } : row));
    expect(runChecks({ ...good(rec), roadmap: benchmark }, rec).results.find((row) => row.id === 5)?.passed).toBe(false);
  });

  it("lets a roadmap target use the numbers in the owner's own goal, and no others", () => {
    const rec = { ...record(), goal: { text: "40 more bookings a month", target: 40, metric: "bookings", period: "month" } };
    const toGoal = good(rec).roadmap.map((row) => (row.phase === "scale" ? { ...row, target: "Toward 40 more bookings a month" } : row));
    expect(runChecks({ ...good(rec), roadmap: toGoal }, rec).passed).toBe(true);
    const beyond = good(rec).roadmap.map((row) => (row.phase === "scale" ? { ...row, target: "65 more bookings a month" } : row));
    expect(runChecks({ ...good(rec), roadmap: beyond }, rec).results.find((row) => row.id === 3)?.passed).toBe(false);
  });

  it("keeps roadmap steps in phase order, at most three a phase, and drops steps with no known phase", () => {
    const steps = Array.from({ length: 5 }, (_, i) => ({ phase: "scale", problem: `p${i}`, figureIds: [], action: `a${i}`, targetMetric: "m", target: "t" }));
    const read = readDiagnosis({ summary: "", stage: "leads", stageReason: "", stageFigureIds: [], findings: [], fixes: [], roadmap: [...steps, { phase: "fix", problem: "x", figureIds: [], action: "y", targetMetric: "m", target: "t" }, { phase: "later", problem: "z" }], limits: [] })!;
    expect(read.roadmap.map((row) => row.phase)).toEqual(["fix", "scale", "scale", "scale"]);
    expect(readDiagnosis({ summary: "" })!.roadmap).toEqual([]);
  });

  it("reads numbers the way they are displayed", () => {
    const rec = record();
    expect(unsupportedNumbers("Spend was $1,000 and each lead cost $25.00 over 3 campaigns.", rec.figures)).toEqual([]);
    expect(unsupportedNumbers("Leads rose 45%.", rec.figures)).toEqual([45]);
  });
});
