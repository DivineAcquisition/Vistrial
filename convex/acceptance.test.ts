/**
 * @vitest-environment edge-runtime
 *
 * Milestone E: the founder's five tests before shipping (context-engine-brief.md), plus 2.16, a fetched
 * page that says "ignore your instructions" changes nothing. Each test runs Market Intelligence end to end
 * with a scripted model that answers like a real one, and checks what the run did, not what it said.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { INJECTION_FIXTURE } from "./lib/registry";
import type { ScriptedModel } from "./lib/toolRouter";
import { marketIntelligence } from "./skills/marketIntelligence";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const AGENT = "growth-architect";
const MI = "market-intelligence";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

type Source = { url: string; title: string };
type Plan = {
  sources: Source[];
  /** Ids the write step cites, on top of the real ones: an attacker's made-up id, for example. */
  extraIds?: string[];
  /** The write step also claims a first-party finding citing the customerData sources it sees. */
  firstParty?: boolean;
  opportunities?: number;
};

/** A scripted model that records every input it is given and answers each step from it. */
function script(plan: Plan) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    inputs.push(input);
    const ids = [...new Set([...input.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]))];
    const own = [...input.matchAll(/"id":"([^"]+)","platform":"customerData"/g)].map((m) => m[1]);
    const market = ids.filter((id) => !own.includes(id));
    const version = input.match(/\(version id ([^\s)]+)\):/)?.[1] ?? null;
    const facts = [...input.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]);
    const n = plan.opportunities ?? 3;
    const opps = [0, 1, 2].slice(0, n).map((i) => ({
      opportunity: `Opportunity ${i + 1}`,
      evidence: { sourceRefIds: [...market.slice(i, i + 2), ...(plan.extraIds ?? [])], uncertainty: market.length ? "none" : "insufficient" },
      businessRelevance: { text: "Fits the offer.", profileFields: version ? ["offer"] : [], factIds: facts.slice(0, 1) },
      proposedAction: `Action ${i + 1}`,
      validationMethod: "Track bookings for a month.",
    }));
    const report = JSON.stringify({
      objective: input.match(/Objective: (.*)/)?.[1] ?? "",
      summary: market.length ? "Competitors lead with first-clean discounts." : "No market sources could be collected.",
      findings: [
        ...(market.length ? [{ statement: "Two competitors offer 20% off a first clean.", basis: "observed", sourceRefIds: market.slice(0, 2) }] : [{ statement: "Not enough data", basis: "insufficient", sourceRefIds: [] }]),
        ...(plan.firstParty && own.length ? [{ statement: "Your best campaign got leads at $21.50 each.", basis: "firstParty", sourceRefIds: own.slice(0, 1) }] : []),
      ],
      opportunities: opps,
      limits: market.length ? [] : [{ platform: "web", note: "No pages could be collected." }],
      contextUsed: { profileVersionId: version, factIds: facts.slice(0, 1) },
      missingOpportunityReason: n < 3 ? "The sources support fewer." : "",
    });
    if (input.startsWith("Write the task brief")) {
      return { text: JSON.stringify({ objective: "objective", deliverables: ["report"], researchQuestions: ["q"], searchQueries: ["deep cleaning"], competitorsToLookUp: [] }) };
    }
    if (input.startsWith("Research this market")) return { text: `Found ${plan.sources.length} pages.`, searches: 1, sources: plan.sources };
    if (input.startsWith("Classify each source")) {
      return { text: JSON.stringify({ items: market.map((id) => ({ sourceRefId: id, hook: "h", offer: "20% off first clean", callToAction: "Book now", format: "landing page", audienceHypothesis: "Homeowners", relevance: "high" })) }) };
    }
    if (input.startsWith("Pick the three opportunities")) return { text: JSON.stringify({ opportunities: opps, missingReason: n < 3 ? "Fewer are supported." : "" }) };
    if (input.startsWith("Write the market report") || input.startsWith("Revise the market report")) return { text: report };
    throw new Error(`unscripted call: ${input.slice(0, 40)}`);
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

const PAGES: Source[] = [
  { url: "https://sparkle.example.com/offers", title: "Sparkle: 20% off your first deep clean" },
  { url: "https://shine.example.com/", title: "Shine Cleaning: book online in 60 seconds" },
  { url: "https://tidy.example.com/move-out", title: "Tidy: move-out cleaning guarantee" },
  { url: "https://fresh.example.com/", title: "Fresh: 20% off first clean for new customers" },
];

async function seed(t: Tester, name: string, business: { offer: string; geography: string; budget: string; objective: string }) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await owner.mutation(api.profile.saveDraft, { workspaceId, offer: business.offer, priceNotes: "", audience: "Homeowners", geography: business.geography, channels: "Meta", brandVoice: "Plain", competitors: [] });
  await owner.mutation(api.profile.confirm, { workspaceId });
  await owner.mutation(api.facts.record, { workspaceId, factKey: "monthlyAdBudget", value: business.budget });
  const projectId = await owner.mutation(api.research.createProject, {
    workspaceId,
    title: name,
    objective: business.objective,
    market: business.offer,
    geography: business.geography,
    competitors: [],
    platforms: ["web"],
    suppliedUrls: [],
  });
  await t.run(async (ctx) => {
    for (const workKind of ["classify", "research", "write"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  return { owner, workspaceId, projectId };
}

async function run(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">) {
  const runId = await caller.mutation(api.runs.start, { workspaceId, agentSlug: AGENT, skillSlug: MI, projectId });
  let status = "queued";
  for (let i = 0; i < 40 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return { runId, status };
}

async function reportAsset(caller: Caller, workspaceId: Id<"workspaces">) {
  const list = await caller.query(api.assets.list, { workspaceId, kind: "marketReport", paginationOpts: { numItems: 5, cursor: null } });
  const row = list.page[0];
  return row ? await caller.query(api.assets.get, { workspaceId, assetId: row.id }) : null;
}

async function toolsUsed(t: Tester, runId: Id<"agentRuns">) {
  const steps = await t.run((ctx) => ctx.db.query("runSteps").collect());
  return steps.filter((row) => row.runId === runId && row.kind === "tool").map((row) => row.toolSlug ?? "");
}

const ALPHA = { offer: "Deep house cleaning", geography: "Austin, TX", budget: "$1,500 a month on Meta", objective: "Which offers do Austin deep-cleaning competitors lead with?" };
const BETA = { offer: "Commercial janitorial contracts", geography: "Denver, CO", budget: "$9,000 a month on Google", objective: "How do Denver janitorial firms win office contracts?" };

describe("Milestone E: acceptance", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("1. uses the right company's context and never another's", async () => {
    const t = makeTester();
    await seed(t, "Alpha", ALPHA);
    const b = await seed(t, "Beta", BETA);
    const inputs = script({ sources: PAGES });
    const { status } = await run(t, b.owner, b.workspaceId, b.projectId);
    expect(status).toBe("completed");
    const everything = inputs.join("\n");
    expect(everything).toContain("Commercial janitorial contracts");
    expect(everything).toContain("$9,000 a month on Google");
    for (const leak of ["Deep house cleaning", "$1,500 a month on Meta", "Austin"]) expect(everything).not.toContain(leak);
    const asset = await reportAsset(b.owner, b.workspaceId);
    expect(asset?.body).toContain("$9,000 a month on Google");
    expect(asset?.body).not.toContain("$1,500");
  });

  it("2. handles missing or inaccessible sources honestly: says so, invents nothing, and does not pass", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    script({ sources: [] });
    const { status } = await run(t, a.owner, a.workspaceId, a.projectId);
    expect(status).toBe("completed");
    const sources = await t.run((ctx) => ctx.db.query("sourceRefs").collect());
    expect(sources).toHaveLength(0);
    const asset = await reportAsset(a.owner, a.workspaceId);
    expect(asset?.status).toBe("needsReview");
    expect(asset?.body).toMatch(/Not enough data|No pages could be collected/);
    const evidence = (asset?.evidence ?? []) as { basis: string | null; sources: unknown[] }[];
    expect(evidence.filter((row) => row.basis === "observed" && row.sources.length === 0)).toHaveLength(0);
  });

  it("3. material findings point to real evidence: a made-up source id is dropped, never stored as support", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    script({ sources: PAGES, extraIds: ["kd7aaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] });
    await run(t, a.owner, a.workspaceId, a.projectId);
    const asset = await reportAsset(a.owner, a.workspaceId);
    const real = new Set((await t.run((ctx) => ctx.db.query("sourceRefs").collect())).map((row) => row._id as string));
    const cited = ((asset?.evidence ?? []) as { sources: { id: string }[] }[]).flatMap((row) => row.sources.map((source) => source.id));
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((id) => real.has(id))).toBe(true);
    expect(JSON.stringify(asset?.evidence)).not.toContain("kd7aaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("4. the work reflects this company and objective: its profile, facts and question reach every model step that uses them", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    const inputs = script({ sources: PAGES });
    await run(t, a.owner, a.workspaceId, a.projectId);
    const writeStep = inputs.find((row) => row.startsWith("Write the market report"))!;
    expect(writeStep).toContain(ALPHA.objective);
    expect(writeStep).toContain("Deep house cleaning");
    expect(writeStep).toContain("$1,500 a month on Meta");
    const asset = await reportAsset(a.owner, a.workspaceId);
    expect(asset?.body).toContain(ALPHA.objective);
  });

  it("5. keeps revisions and takes no external action without approval", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    script({ sources: PAGES });
    await run(t, a.owner, a.workspaceId, a.projectId);
    const asset = await reportAsset(a.owner, a.workspaceId);
    expect(asset?.status).toBe("draft");
    // Nothing in the skill can publish, send, post or spend.
    expect(marketIntelligence.tools.filter((slug) => /publish|send|post|spend|launch|email|sms|ads\./i.test(slug))).toEqual([]);
    // A change request keeps the version and waits; approval is a person's act.
    await a.owner.mutation(api.assets.requestRevision, { workspaceId: a.workspaceId, assetId: asset!.id, reason: "Name the competitors" });
    const after = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: asset!.id });
    expect(after.currentVersion).toBe(asset!.currentVersion);
    expect(after.status).toBe("draft");
    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: asset!.id });
    expect((await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: asset!.id })).status).toBe("approved");
  });

  it("2.16: a page that says to ignore instructions changes nothing", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    const clean = script({ sources: PAGES });
    const baseline = await run(t, a.owner, a.workspaceId, a.projectId);
    const baselineTools = await toolsUsed(t, baseline.runId);

    const t2 = makeTester();
    const b = await seed(t2, "Alpha", ALPHA);
    const poisoned = script({ sources: [...PAGES.slice(0, 3), { url: "https://evil.example.com/", title: `Cheap cleaning. ${INJECTION_FIXTURE}` }] });
    const attacked = await run(t2, b.owner, b.workspaceId, b.projectId);
    expect(clean.length).toBeGreaterThan(0);

    // Same steps, same tools, same outcome.
    expect(attacked.status).toBe(baseline.status);
    expect(await toolsUsed(t2, attacked.runId)).toEqual(baselineTools);
    // The page text reaches the model only inside the untrusted block.
    for (const input of poisoned.filter((row) => row.includes(INJECTION_FIXTURE))) {
      expect(input.indexOf("UNTRUSTED CONTENT")).toBeGreaterThan(-1);
      expect(input.indexOf("UNTRUSTED CONTENT")).toBeLessThan(input.indexOf(INJECTION_FIXTURE));
    }
    // No extra asset or version came from the page.
    const asset = await reportAsset(b.owner, b.workspaceId);
    const versions = await t2.run((ctx) => ctx.db.query("assetVersions").collect());
    expect(versions.filter((row) => row.assetId === asset!.id)).toHaveLength(asset!.currentVersion);
    const assets = await t2.run((ctx) => ctx.db.query("assets").collect());
    expect(assets).toHaveLength(1);
  });
});

describe("first-party results in research", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  async function connectMeta(t: Tester, workspaceId: Id<"workspaces">, agents?: string[]) {
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
        adAccountName: "Bay Area Cleaning",
        currency: "USD",
        callsOk: 0,
        callsFailed: 0,
        ...(agents ? { agents } : {}),
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
          { id: "c1", name: "New Customer $50 Special", status: "PAUSED", objective: "OUTCOME_LEADS", spend: 3913.89, impressions: 151200, reach: 98000, clicks: 1874, ctr: 0.0124, cpc: 2.09, resultLabel: "Leads", results: 182, costPerResult: 21.5 },
          { id: "c2", name: "Idle", status: "PAUSED", objective: "OUTCOME_LEADS", spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: null, cpc: null, resultLabel: "Leads", results: 0, costPerResult: null },
        ],
      });
    });
  }

  it("cites the business's own ad results as Your data, kept out of the market counts", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    await connectMeta(t, a.workspaceId);
    const inputs = script({ sources: PAGES, firstParty: true });
    const { status } = await run(t, a.owner, a.workspaceId, a.projectId);
    expect(status).toBe("completed");

    const own = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.platform === "customerData");
    // The account and the one campaign that spent; not the idle one.
    expect(own.map((row) => row.title)).toEqual(["Your Meta ads: Bay Area Cleaning (all time)", "Your Meta campaign: New Customer $50 Special"]);
    expect(own[1].excerpt).toContain("182 leads at $21.50 each");
    // Not classified like a competitor's page, and not counted as market material.
    expect(own.every((row) => !row.classification)).toBe(true);
    const classify = inputs.find((row) => row.startsWith("Classify each source"))!;
    expect(classify).not.toContain("customerData");

    const asset = await reportAsset(a.owner, a.workspaceId);
    const evidence = asset!.evidence as { claimKey: string; statement: string; basis: string | null; sources: { id: string }[] }[];
    const firstParty = evidence.find((row) => row.basis === "firstParty");
    expect(firstParty?.sources.map((row) => row.id)).toEqual([own[0]._id === firstParty?.sources[0]?.id ? own[0]._id : own[1]._id].filter(Boolean));
    expect(evidence.find((row) => row.claimKey === "count-sources")?.statement).toBe("4 sources were reviewed: 4 web.");
    // The brief lists it as known, from the connection.
    const context = (await t.run((ctx) => ctx.db.query("runArtifacts").collect())).find((row) => row.kind === "context");
    expect(context?.body).toContain('"origin":"connection"');
  });

  it("uses nothing when the connection is not granted to the Growth Architect", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    await connectMeta(t, a.workspaceId, ["sales-conversion"]);
    script({ sources: PAGES });
    await run(t, a.owner, a.workspaceId, a.projectId);
    const own = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.platform === "customerData");
    expect(own).toHaveLength(0);
  });

  async function uploadResults(t: Tester, workspaceId: Id<"workspaces">, agents?: string[]) {
    await t.run(async (ctx) => {
      await ctx.db.insert("resultUploads", {
        workspaceId,
        fileName: "google-ads.csv",
        label: "Google Ads",
        currency: "USD",
        uploadedBy: "x",
        createdAt: 1793900000000,
        status: "ready",
        ...(agents ? { agents } : {}),
        summary: {
          rows: 2,
          dateStart: "2026-09-01",
          dateStop: "2026-09-30",
          metrics: ["spend", "conversions"],
          totals: { spend: 200, conversions: 12 },
          groupBy: "Campaign",
          groups: [{ name: "Search - Brand", spend: 120, conversions: 10 }],
          otherGroups: 0,
          ignoredColumns: [],
        },
      });
    });
  }

  it("cites an uploaded results file as Your data, listed as known", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    await uploadResults(t, a.workspaceId);
    const inputs = script({ sources: PAGES, firstParty: true });
    const { status } = await run(t, a.owner, a.workspaceId, a.projectId);
    expect(status).toBe("completed");
    const own = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.platform === "customerData");
    expect(own.map((row) => row.title)).toEqual(["Your results: Google Ads (google-ads.csv)"]);
    expect(own[0].excerpt).toBe("Google Ads from 2026-09-01 to 2026-09-30: spend USD 200, 12 conversions.");
    expect(inputs.find((row) => row.startsWith("Classify each source"))).not.toContain("customerData");
    const asset = await reportAsset(a.owner, a.workspaceId);
    const evidence = asset!.evidence as { basis: string | null; sources: { id: string }[] }[];
    expect(evidence.find((row) => row.basis === "firstParty")?.sources.map((row) => row.id)).toEqual([own[0]._id]);
    const context = (await t.run((ctx) => ctx.db.query("runArtifacts").collect())).find((row) => row.kind === "context");
    expect(context?.body).toContain("Your results: Google Ads");
  });

  it("uses no uploaded results that are not granted, or that belong to another workspace", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    const b = await seed(t, "Beta", BETA);
    await uploadResults(t, a.workspaceId, ["sales-conversion"]);
    await uploadResults(t, b.workspaceId);
    const inputs = script({ sources: PAGES });
    await run(t, a.owner, a.workspaceId, a.projectId);
    const own = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.platform === "customerData");
    expect(own).toHaveLength(0);
    expect(inputs.join("\n")).not.toContain("Google Ads");
  });

  it("never reads another workspace's ad results", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", ALPHA);
    const b = await seed(t, "Beta", BETA);
    await connectMeta(t, a.workspaceId);
    const inputs = script({ sources: PAGES });
    await run(t, b.owner, b.workspaceId, b.projectId);
    expect(inputs.join("\n")).not.toContain("Bay Area Cleaning");
    const own = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).filter((row) => row.platform === "customerData");
    expect(own).toHaveLength(0);
  });
});
