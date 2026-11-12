/**
 * @vitest-environment edge-runtime
 *
 * Offer Intelligence end to end, with a scripted model that answers like a real one: the full run on
 * approved research and the business's own data, the refusal without approved research, workspace isolation
 * and roles, and the evidence rules (no invented competitor offer survives into the saved asset).
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { INJECTION_FIXTURE } from "./lib/registry";
import type { ScriptedModel } from "./lib/toolRouter";
import { offerIntelligence } from "./skills/offerIntelligence";
import { runChecks } from "./skills/offerIntelligence/checks";
import type { Channel, Metric } from "./skills/offerIntelligence/channels";
import { PLAYBOOK } from "./skills/offerIntelligence/playbook";
import type { OfferAnalysis, OfferContext } from "./skills/offerIntelligence/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const AGENT = "growth-architect";
const OI = "offer-intelligence";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

type Plan = {
  /** The write step cites these ids for a competitor offer as well: a made-up id, or a real unapproved one. */
  inventIds?: string[];
  /** The write step claims a first-party finding and a change citing the business's own results. */
  firstParty?: boolean;
  /** How many changes the write step proposes. */
  changes?: number;
};

/** A scripted model that records every input it is given and answers from what the input shows. */
function script(plan: Plan = {}) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    inputs.push(input);
    if (!input.startsWith("Write the offer analysis") && !input.startsWith("Revise the offer analysis")) throw new Error(`unscripted call: ${input.slice(0, 40)}`);
    const revising = input.startsWith("Revise");
    const research = [...input.matchAll(/"id":"([^"]+)","platform":"(?!customerData)/g)].map((m) => m[1]);
    const ads = [...input.matchAll(/"id":"([^"]+)","platform":"metaAdLibrary"/g)].map((m) => m[1]);
    const pages = [...input.matchAll(/"id":"([^"]+)","platform":"web"/g)].map((m) => m[1]);
    const own = [...input.matchAll(/"id":"([^"]+)","platform":"customerData"/g)].map((m) => m[1]);
    const reports = [...input.matchAll(/"id":"([^"]+)","title":"[^"]*","version"/g)].map((m) => m[1]);
    const version = input.match(/\(version id ([^\s)]+)\):/)?.[1] ?? null;
    const facts = [...input.matchAll(/^- \[([^\]]+)\] \w+: /gm)].map((m) => m[1]);
    const decisions = [...input.matchAll(/^- \[([^\]]+)\] (Tried|Planned):/gm)].map((m) => m[1]);
    const invented = revising ? [] : (plan.inventIds ?? []);
    const n = plan.changes ?? 3;
    // Two changes for paid social (the business runs Meta ads), one for search as a new channel.
    const plans = [
      { channel: "paidSocial", newChannel: false, principleIds: ["guarantee"], metric: "costPerLead", ids: ads.slice(0, 1) },
      { channel: "paidSocial", newChannel: false, principleIds: ["self-liquidating-entry"], metric: "costPerBooking", ids: ads.slice(0, 1) },
      { channel: "search", newChannel: true, principleIds: ["commodity-escape"], metric: "conversionRate", ids: pages.slice(0, 2) },
    ];
    const changes = plans.slice(0, n).map((row, i) => ({
      title: `Change ${i + 1}`,
      evidence:
        plan.firstParty && i === 0 && own.length
          ? { text: "Your $50 special got leads at $21.50 each.", basis: "firstParty", sourceRefIds: own.slice(0, 1) }
          : { text: "Competitors lead with a first-clean discount.", basis: "observed", sourceRefIds: row.ids },
      fit: { text: "Fits the offer and the past outcome.", profileFields: version ? ["offer"] : [], factIds: facts.slice(0, 1), decisionIds: decisions.slice(0, 1) },
      channel: row.channel,
      newChannel: row.newChannel,
      principleIds: row.principleIds,
      proposedChange: `Proposed change ${i + 1}`,
      validationMethod: "Compare four weeks before and after.",
      metric: row.metric,
    }));
    return {
      text: JSON.stringify({
        summary: "Competitors lead with first-clean discounts and guarantees; this offer leads with neither.",
        offerPosition: { text: "Lead with a guaranteed result instead of matching discounts.", principleIds: ["value-equation", "commodity-escape"] },
        currentOffer: { product: "Deep house cleaning", price: "Not stated", guarantee: "Not stated", terms: "Not stated", basis: "stated", sourceRefIds: [], factIds: facts.slice(0, 1) },
        competitorOffers: [
          { competitor: "Sparkle", offer: "20% off a first deep clean", price: "Not stated", guarantee: "Not stated", basis: "observed", sourceRefIds: research.slice(0, 1) },
          { competitor: "Tidy", offer: "Move-out cleaning guarantee", price: "Not stated", guarantee: "Re-clean free", basis: "observed", sourceRefIds: [...research.slice(1, 2), ...invented] },
        ],
        gapsAndRisks: [
          { kind: "gap", statement: "No guarantee is stated.", basis: "inferred", sourceRefIds: research.slice(1, 2) },
          ...(plan.firstParty && own.length ? [{ kind: "risk", statement: "Your $50 special is paused.", basis: "firstParty", sourceRefIds: own.slice(0, 1) }] : []),
        ],
        changes,
        limits: ["The research covered web pages only."],
        contextUsed: { profileVersionId: version, factIds: facts.slice(0, 1), reportIds: reports },
      }),
    };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

type Page = { url: string; title: string; platform?: "web" | "metaAdLibrary" };

const PAGES: Page[] = [
  { url: "https://sparkle.example.com/offers", title: "Sparkle: 20% off your first deep clean" },
  { url: "https://tidy.example.com/move-out", title: "Tidy: move-out cleaning guarantee" },
  { url: "https://fresh.example.com/", title: "Fresh: 20% off first clean for new customers" },
  { url: "https://www.facebook.com/ads/library/?id=111", title: "Shine ad: $79 first clean, re-clean free", platform: "metaAdLibrary" },
];

async function seed(t: Tester, name: string, offer = "Deep house cleaning") {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await owner.mutation(api.profile.saveDraft, { workspaceId, offer, priceNotes: "", audience: "Homeowners", geography: `${name} City`, channels: "Meta", brandVoice: "Plain", competitors: [] });
  await owner.mutation(api.profile.confirm, { workspaceId });
  await owner.mutation(api.facts.record, { workspaceId, factKey: "monthlyAdBudget", value: `${name} budget $1,500 a month` });
  const projectId = await owner.mutation(api.research.createProject, {
    workspaceId,
    title: name,
    objective: `Which offers do ${name} competitors lead with?`,
    market: offer,
    geography: `${name} City`,
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

/**
 * A market report as Market Intelligence saves it: sources on the project, a completed run, the asset with
 * one version, and evidence rows citing the sources. `status` is what a person did with it.
 */
async function marketReport(
  t: Tester,
  workspaceId: Id<"workspaces">,
  projectId: Id<"researchProjects">,
  status: "approved" | "draft",
  pages: Page[] = PAGES,
) {
  return t.run(async (ctx) => {
    const runId = await ctx.db.insert("agentRuns", {
      workspaceId,
      agentSlug: AGENT,
      skillSlug: "market-intelligence",
      status: "completed",
      startedBy: "seed",
      inputRef: projectId,
      startedAt: 1,
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    const sourceIds: Id<"sourceRefs">[] = [];
    for (const page of pages) {
      sourceIds.push(
        await ctx.db.insert("sourceRefs", {
          workspaceId,
          projectId,
          runId,
          origin: "found",
          platform: page.platform ?? "web",
          kind: page.platform === "metaAdLibrary" ? "ad" : "page",
          url: page.url,
          canonicalUrl: page.url,
          title: page.title,
          observedAt: 1793900000000,
          availability: "available",
          excerpt: page.title,
          classification: { offer: page.title.split(": ")[1], classifiedBy: "model", classifiedAt: 1 },
        }),
      );
    }
    const assetId = await ctx.db.insert("assets", { workspaceId, kind: "marketReport", title: `Market report ${status}`, status, currentVersion: 1, createdByRun: runId, createdAt: 1 });
    const versionId = await ctx.db.insert("assetVersions", { workspaceId, assetId, version: 1, body: "# Market report", createdBy: "agent" });
    if (sourceIds.length) {
      await ctx.db.insert("evidence", { workspaceId, assetVersionId: versionId, claimKey: "finding-1", statement: "Competitors lead with first-clean discounts.", basis: "observed", sourceRefIds: sourceIds });
    } else {
      await ctx.db.insert("evidence", { workspaceId, assetVersionId: versionId, claimKey: "finding-1", statement: "Not enough data", basis: "insufficient" });
    }
    return { assetId, sourceIds };
  });
}

async function run(t: Tester, caller: Caller, workspaceId: Id<"workspaces">) {
  const runId = await caller.mutation(api.runs.start, { workspaceId, agentSlug: AGENT, skillSlug: OI });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return { runId, status };
}

async function offerAsset(caller: Caller, workspaceId: Id<"workspaces">) {
  const list = await caller.query(api.assets.list, { workspaceId, kind: "offerAnalysis", paginationOpts: { numItems: 5, cursor: null } });
  const row = list.page[0];
  return row ? await caller.query(api.assets.get, { workspaceId, assetId: row.id }) : null;
}

type EvidenceView = { claimKey: string; statement: string | null; basis: string | null; sourceLabel: string | null; sourceMissing: boolean; sources: { id: string; platform: string }[] };

async function stepsOf(t: Tester, runId: Id<"agentRuns">) {
  return (await t.run((ctx) => ctx.db.query("runSteps").collect())).filter((row) => row.runId === runId).sort((a, b) => a.index - b.index);
}

async function connectMeta(t: Tester, workspaceId: Id<"workspaces">) {
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
      ],
    });
  });
}

async function uploadResults(t: Tester, workspaceId: Id<"workspaces">) {
  await t.run((ctx) =>
    ctx.db.insert("resultUploads", {
      workspaceId,
      fileName: "jobber.csv",
      label: "Jobber bookings",
      currency: "USD",
      uploadedBy: "owner",
      createdAt: 1793900000000,
      status: "ready",
      summary: { rows: 40, dateStart: "2026-08-01", dateStop: "2026-10-31", metrics: ["revenue"], totals: { revenue: 18400, conversions: 46 }, groupBy: null, groups: [], otherGroups: 0, ignoredColumns: [] },
    }),
  );
}

async function pastOutcome(t: Tester, workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">, runId: Id<"agentRuns">) {
  await t.run((ctx) =>
    ctx.db.insert("decisions", {
      workspaceId,
      projectId,
      runId,
      opportunityIndex: 0,
      opportunity: "Lead with price",
      proposedAction: "Cut the first-clean price to $99",
      validationMethod: "Bookings",
      checkInAt: 1793900000000,
      createdBy: "owner",
      createdAt: 1793000000000,
      baseline: [],
      outcome: { result: "same", note: "No more bookings than before.", after: [], recordedAt: 1793900000000, recordedBy: "owner" },
    }),
  );
}

describe("Offer Intelligence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("is available in the catalog and can only read, check and save", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const shell = await a.owner.query(api.workspace.shell, { workspaceId: a.workspaceId });
    const skill = shell?.agents.find((row) => row.slug === AGENT)?.skills?.find((row) => row.slug === OI);
    expect(skill?.status).toBe("available");
    expect(offerIntelligence.tools).toEqual(["oi.context", "oi.check", "oi.save"]);
    expect(offerIntelligence.tools.filter((slug) => /publish|send|post|spend|launch|email|sms|ads\.|web\./i.test(slug))).toEqual([]);
  });

  it("runs end to end on approved research and the business's own data, and saves an asset to approve", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const report = await marketReport(t, a.workspaceId, a.projectId, "approved");
    await connectMeta(t, a.workspaceId);
    await uploadResults(t, a.workspaceId);
    const reportRun = (await t.run((ctx) => ctx.db.get(report.assetId)))!.createdByRun!;
    await pastOutcome(t, a.workspaceId, a.projectId, reportRun);
    const inputs = script({ firstParty: true });
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");

    // One model call, with the approved research wrapped as untrusted, and the business's context.
    expect(inputs).toHaveLength(1);
    const input = inputs[0];
    expect(input).toContain("Deep house cleaning");
    expect(input).toContain("Alpha budget $1,500 a month");
    expect(input).toContain("Sparkle: 20% off your first deep clean");
    expect(input.indexOf("UNTRUSTED CONTENT")).toBeLessThan(input.indexOf("Sparkle: 20% off"));
    expect(input).toContain("Your Meta campaign: New Customer $50 Special");
    expect(input).toContain("Your results: Jobber bookings");
    expect(input).toContain("Tried: Cut the first-clean price to $99. Result:");

    const tools = (await stepsOf(t, runId)).filter((row) => row.kind === "tool").map((row) => row.toolSlug);
    expect(tools).toEqual(["oi.context", "oi.check", "oi.save"]);

    const asset = await offerAsset(a.owner, a.workspaceId);
    expect(asset?.kind).toBe("offerAnalysis");
    expect(asset?.status).toBe("draft");
    expect(asset?.currentVersion).toBe(1);
    // The save step queued the report-ready email; it runs apart from the run, so it cannot fail it.
    const queued = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(queued.filter((row) => row.name.includes("emailReminders")).map((row) => row.args)).toEqual([[{ assetId: asset!.id }]]);
    for (const section of ["## Offer position", "**Search (Google, Maps, local listings)**", "**Channel:**", "**Principle:**", "Alex Hormozi, $100M Offers", "(measure: cost per lead)", "## Your offer", "## What competitors lead with", "## Gaps and risks", "## Changes to test", "**Evidence:**", "**Why it fits this business:**", "**Proposed change:**", "**How to tell if it worked:**"]) {
      expect(asset?.body).toContain(section);
    }
    const evidence = asset!.evidence as EvidenceView[];
    expect(evidence.every((row) => !row.sourceMissing)).toBe(true);
    const approved = new Set(report.sourceIds as string[]);
    for (const row of evidence.filter((item) => item.claimKey.startsWith("competitor-offer-"))) {
      expect(row.sources.length).toBeGreaterThan(0);
      expect(row.sources.every((source) => approved.has(source.id))).toBe(true);
    }
    // The current offer cites the confirmed profile; first-party claims cite the business's own data.
    expect(evidence.find((row) => row.claimKey === "current-offer")?.sourceLabel).toMatch(/Business profile/);
    const firstParty = evidence.filter((row) => row.basis === "firstParty");
    expect(firstParty.length).toBeGreaterThan(0);
    expect(firstParty.every((row) => row.sources.length > 0 && row.sources.every((source) => source.platform === "customerData"))).toBe(true);
    expect(evidence.find((row) => row.claimKey === "count-research")?.statement).toBe("1 approved market report and 4 of its sources were read.");
    expect(evidence.filter((row) => row.claimKey.startsWith("change-"))).toHaveLength(3);

    // Approve, reject and request changes work on it like any other asset.
    await a.owner.mutation(api.assets.requestRevision, { workspaceId: a.workspaceId, assetId: asset!.id, reason: "Name a price" });
    expect((await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: asset!.id })).status).toBe("draft");
    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: asset!.id });
    expect((await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: asset!.id })).status).toBe("approved");
  });

  it("refuses without approved research: no model call, no asset, and it says why", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    // A report that is only a draft is not approved research.
    await marketReport(t, a.workspaceId, a.projectId, "draft");
    const inputs = script();
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("failed");
    expect(inputs).toHaveLength(0);
    const steps = await stepsOf(t, runId);
    expect(steps.map((row) => row.resultCode)).toEqual(["no_approved_research"]);
    expect(await offerAsset(a.owner, a.workspaceId)).toBeNull();
    expect((await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId })).costCents).toBe(0);
  });

  it("refuses when the approved research cites no competitor source", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await marketReport(t, a.workspaceId, a.projectId, "approved", []);
    const inputs = script();
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("failed");
    expect(inputs).toHaveLength(0);
    expect((await stepsOf(t, runId)).map((row) => row.resultCode)).toEqual(["no_research_sources"]);
    expect(await offerAsset(a.owner, a.workspaceId)).toBeNull();
  });

  it("asks what the business sells when nothing on record says, then carries on with the answer", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("profileVersions").collect()) await ctx.db.patch(row._id, { offer: "" });
    });
    await marketReport(t, a.workspaceId, a.projectId, "approved");
    const inputs = script();
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("waiting");
    expect(inputs).toHaveLength(0);
    const waiting = await t.run((ctx) => ctx.db.get(runId));
    expect(waiting?.waitingFor?.questionKey).toBe("offerDetails");
    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: waiting!.waitingFor!.questionId, answer: "Move-out cleans, $249 flat, re-clean free within 48 hours" });
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
    expect((await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId })).status).toBe("completed");
    expect(inputs[0]).toContain("Move-out cleans, $249 flat, re-clean free within 48 hours");
  });

  it("asks where customers come from when no channel is on record, and builds the changes on the answer", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("profileVersions").collect()) await ctx.db.patch(row._id, { channels: "" });
    });
    await marketReport(t, a.workspaceId, a.projectId, "approved");
    const inputs = script();
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("waiting");
    const waiting = await t.run((ctx) => ctx.db.get(runId));
    expect(waiting?.waitingFor?.questionKey).toBe("acquisitionChannels");
    await a.owner.mutation(api.runs.answer, { workspaceId: a.workspaceId, runId, questionId: waiting!.waitingFor!.questionId, answer: "Mostly Facebook ads, some referrals" });
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
    expect((await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId })).status).toBe("completed");
    expect(inputs[0]).toContain("- paidSocial: Paid social (Meta, TikTok and similar ads) (from owner)");
    expect(inputs[0]).toContain("- warm: Warm (past customers, referrals, your list) (from owner)");
    expect(inputs[0]).toContain("[guarantee] Risk reversal through a guarantee (Alex Hormozi, $100M Offers)");
    expect((await offerAsset(a.owner, a.workspaceId))?.status).toBe("draft");
  });

  it("keeps each workspace's research and context to itself", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha", "Deep house cleaning");
    const b = await seed(t, "Beta", "Commercial janitorial contracts");
    await marketReport(t, a.workspaceId, a.projectId, "approved");
    await marketReport(t, b.workspaceId, b.projectId, "approved", [{ url: "https://janitors.example.com/", title: "Janitors Inc: first month free on office contracts" }]);
    const inputs = script();
    const { runId, status } = await run(t, b.owner, b.workspaceId);
    expect(status).toBe("completed");
    // What reached the model from the database (the write step; a revision also echoes the scripted draft).
    const written = inputs[0];
    expect(written).toContain("Janitors Inc");
    expect(written).toContain("Commercial janitorial contracts");
    for (const leak of ["Sparkle", "Tidy", "Deep house cleaning", "Alpha budget"]) expect(written).not.toContain(leak);

    // Alpha's research is not Beta's: with none of its own approved, Beta would be refused, not given Alpha's.
    const c = await seed(t, "Gamma");
    script();
    expect((await run(t, c.owner, c.workspaceId)).status).toBe("failed");

    // Another workspace cannot read the run or its asset.
    await expect(a.owner.query(api.runs.get, { workspaceId: b.workspaceId, runId })).rejects.toThrow();
    const asset = await offerAsset(b.owner, b.workspaceId);
    await expect(a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: asset!.id })).rejects.toThrow();
  });

  it("lets owners start it and refuses viewers", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await marketReport(t, a.workspaceId, a.projectId, "approved");
    await t.run((ctx) => ctx.db.insert("members", { workspaceId: a.workspaceId, userId: "Alpha-viewer", role: "viewer", displayName: "Viewer", active: true }));
    const viewer = t.withIdentity(person("Alpha-viewer"));
    await expect(viewer.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: AGENT, skillSlug: OI })).rejects.toThrow();
    // A stranger is not a member at all.
    const stranger = t.withIdentity(person("stranger"));
    await expect(stranger.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: AGENT, skillSlug: OI })).rejects.toThrow();
    script();
    expect((await run(t, a.owner, a.workspaceId)).status).toBe("completed");
  });

  it("never stores an invented competitor offer: an unapproved or made-up source fails the check and is dropped", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const approved = await marketReport(t, a.workspaceId, a.projectId, "approved");
    // A real source in the same workspace, but from a report nobody approved.
    const unapproved = await marketReport(t, a.workspaceId, a.projectId, "draft", [{ url: "https://rogue.example.com/", title: "Rogue: lifetime guarantee" }]);
    const inputs = script({ inventIds: [unapproved.sourceIds[0], "kd7aaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] });
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");
    expect(inputs[0]).not.toContain("Rogue: lifetime guarantee");

    const steps = await stepsOf(t, runId);
    expect(steps.map((row) => row.phase)).toEqual(["context", "write", "check", "revise", "recheck", "save"]);
    expect(steps.find((row) => row.phase === "check")?.resultCode).toBe("checks_failed");
    expect(steps.find((row) => row.phase === "recheck")?.resultCode).toBe("passed");
    expect(inputs[1]).toMatch(/^Revise the offer analysis/);
    expect(inputs[1]).toContain("Built on approved research");

    const asset = await offerAsset(a.owner, a.workspaceId);
    expect(asset?.currentVersion).toBe(2);
    expect(asset?.status).toBe("draft");
    // Version 1 keeps the draft, without the claim that cited the unapproved and made-up sources.
    const first = await a.owner.query(api.assets.version, { workspaceId: a.workspaceId, assetId: asset!.id, version: 1 });
    const firstKeys = (first.evidence as EvidenceView[]).map((row) => row.claimKey);
    expect(firstKeys).toContain("competitor-offer-1");
    expect(firstKeys).not.toContain("competitor-offer-2");
    const allowed = new Set(approved.sourceIds as string[]);
    for (const version of [first.evidence, asset!.evidence] as EvidenceView[][]) {
      for (const row of version.filter((item) => item.claimKey.startsWith("competitor-offer-"))) {
        expect(row.sources.every((source) => allowed.has(source.id))).toBe(true);
      }
    }
    expect(JSON.stringify(asset)).not.toContain(unapproved.sourceIds[0]);
  });

  it("treats a page that says to ignore instructions as data", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await marketReport(t, a.workspaceId, a.projectId, "approved", [...PAGES.slice(0, 2), PAGES[3], { url: "https://evil.example.com/", title: `Cheap cleaning. ${INJECTION_FIXTURE}` }]);
    const inputs = script();
    const { runId, status } = await run(t, a.owner, a.workspaceId);
    expect(status).toBe("completed");
    for (const input of inputs.filter((row) => row.includes(INJECTION_FIXTURE))) {
      expect(input.indexOf("UNTRUSTED CONTENT")).toBeGreaterThan(-1);
      expect(input.indexOf("UNTRUSTED CONTENT")).toBeLessThan(input.indexOf(INJECTION_FIXTURE));
    }
    expect((await stepsOf(t, runId)).filter((row) => row.kind === "tool").map((row) => row.toolSlug)).toEqual(["oi.context", "oi.check", "oi.save"]);
    expect(await t.run((ctx) => ctx.db.query("assets").collect())).toHaveLength(2);
  });
});

describe("Offer Intelligence checks", () => {
  const context: OfferContext = {
    reports: [{ assetId: "r1", title: "Report", version: 1, projectId: "p1", claims: [] }],
    researchSources: [
      ...["s1", "s3"].map((id) => ({ id, platform: "web", title: id, publisher: null, url: `https://${id}.example.com`, excerpt: null, offerReading: null, observed: "2026-11-01", channel: "search" as const })),
      { id: "s2", platform: "metaAdLibrary", title: "ad", publisher: null, url: "https://www.facebook.com/ads/library/?id=1", excerpt: null, offerReading: null, observed: "2026-11-01", channel: "paidSocial" as const },
    ],
    ownSources: [{ id: "own1", platform: "customerData", title: "Your Meta ads", publisher: null, url: "https://adsmanager.facebook.com", excerpt: null, offerReading: null, observed: "2026-11-01", channel: "paidSocial" }],
    channels: [{ channel: "paidSocial", from: "profile" }],
    baseProjectId: "p1",
    profile: { versionId: "pv1", offer: "Cleaning", priceNotes: "", audience: "", geography: "", channels: "", brandVoice: "", competitors: [] },
    facts: [{ id: "f1", factKey: "budget", value: "$1", status: "verified", sourceType: "owner", recordedAt: 1 }],
    decisions: [{ id: "d1", text: "Tried: x", tried: true }],
    offerDetails: "",
    gaps: [],
    known: [],
    missing: [],
    assumptions: [],
  };
  const change = (
    i: number,
    ids: string[],
    basis: "observed" | "firstParty" | "hypothesis" = "observed",
    at: { channel: Channel; newChannel: boolean; metric: Metric; principleIds: string[] } = { channel: "search", newChannel: true, metric: "conversionRate", principleIds: ["guarantee"] },
  ): OfferAnalysis["changes"][number] => ({
    title: `C${i}`,
    evidence: { text: "e", basis, sourceRefIds: ids },
    fit: { text: "fits", profileFields: ["offer"], factIds: [], decisionIds: ["d1"] },
    ...at,
    proposedChange: `Change ${i}`,
    validationMethod: "v",
  });
  const PAID = { channel: "paidSocial" as const, newChannel: false, metric: "costPerLead" as const, principleIds: ["self-liquidating-entry"] };
  const good = (): OfferAnalysis => ({
    summary: "s",
    offerPosition: { text: "Lead with a guarantee.", principleIds: ["guarantee"] },
    currentOffer: { product: "Cleaning", price: "Not stated", guarantee: "Not stated", terms: "Not stated", basis: "stated", sourceRefIds: [], factIds: ["f1"] },
    competitorOffers: [{ competitor: "A", offer: "20% off", price: "", guarantee: "", basis: "observed", sourceRefIds: ["s1"] }],
    gapsAndRisks: [{ kind: "gap", statement: "Not enough data on prices", basis: "insufficient", sourceRefIds: [] }],
    changes: [change(1, ["s1"]), change(2, ["own1"], "firstParty", PAID)],
    limits: [],
    contextUsed: { profileVersionId: "pv1", factIds: ["f1"], reportIds: ["r1"] },
  });
  const failed = (analysis: OfferAnalysis) => runChecks({ analysis, context, runCostCents: 1, capCents: 100 }).results.filter((row) => !row.passed).map((row) => row.name);

  it("passes a sound analysis", () => {
    expect(failed(good())).toEqual([]);
  });

  it("fails a competitor offer that cites nothing from the approved research", () => {
    const analysis = good();
    analysis.competitorOffers.push({ competitor: "B", offer: "Free quote", price: "", guarantee: "", basis: "observed", sourceRefIds: [] });
    expect(failed(analysis)).toContain("Built on approved research");
    const own = good();
    own.competitorOffers[0].sourceRefIds = ["own1"];
    expect(failed(own)).toContain("Built on approved research");
  });

  it("fails without the approved report ids it builds on", () => {
    const analysis = good();
    analysis.contextUsed.reportIds = ["someone-else"];
    expect(failed(analysis)).toContain("Built on approved research");
  });

  it("needs two or three distinct, backed changes", () => {
    const one = good();
    one.changes = one.changes.slice(0, 1);
    expect(failed(one)).toContain("Two or three distinct changes");
    const four = good();
    four.changes = [change(1, ["s1"]), change(2, ["s2"]), change(3, ["s3"]), change(4, ["s1"])];
    expect(failed(four)).toContain("Two or three distinct changes");
    const same = good();
    same.changes[1].proposedChange = same.changes[0].proposedChange;
    expect(failed(same)).toContain("Two or three distinct changes");
    const unbacked = good();
    unbacked.changes[1] = change(2, [], "hypothesis");
    expect(failed(unbacked)).toContain("Two or three distinct changes");
  });

  it("holds every claim to its basis: firstParty needs the business's own data, insufficient cites nothing", () => {
    const wrongFirstParty = good();
    wrongFirstParty.changes[1] = change(2, ["s2"], "firstParty", PAID);
    expect(failed(wrongFirstParty)).toContain("Claims point to evidence");
    const insufficient = good();
    insufficient.gapsAndRisks[0].sourceRefIds = ["s1"];
    expect(failed(insufficient)).toContain("Claims point to evidence");
    const unknown = good();
    unknown.gapsAndRisks.push({ kind: "risk", statement: "x", basis: "inferred", sourceRefIds: ["made-up"] });
    expect(failed(unknown)).toContain("Claims point to evidence");
    const noBasis = good();
    noBasis.gapsAndRisks[0].basis = null;
    expect(failed(noBasis)).toContain("Claims point to evidence");
  });

  it("needs each change to name real context, and the current offer stated", () => {
    const fit = good();
    fit.changes[0].fit = { text: "fits", profileFields: [], factIds: [], decisionIds: ["d-made-up"] };
    expect(failed(fit)).toContain("Each change fits this business");
    const blank = good();
    blank.currentOffer.price = "";
    expect(failed(blank)).toContain("States the current offer");
    expect(runChecks({ analysis: null, context, runCostCents: 0, capCents: 100 }).passed).toBe(false);
  });
  it("ties each change to one channel: one the business uses or a stated new one, with evidence and a measure from it", () => {
    const unused = good();
    unused.changes[0].newChannel = false;
    expect(failed(unused)).toContain("Each change fits its channel");
    const wrongEvidence = good();
    wrongEvidence.changes[1] = change(2, ["s1"], "observed", PAID);
    expect(failed(wrongEvidence)).toContain("Each change fits its channel");
    const wrongMeasure = good();
    wrongMeasure.changes[1].metric = "referralsPerMonth";
    expect(failed(wrongMeasure)).toContain("Each change fits its channel");
    const noChannel = good();
    noChannel.changes[0].channel = null;
    expect(failed(noChannel)).toContain("Each change fits its channel");
    // An ad from the Meta Ad Library is evidence for a paid social change.
    const ad = good();
    ad.changes[1] = change(2, ["s2"], "observed", PAID);
    expect(failed(ad)).toEqual([]);
  });

  it("needs a playbook principle that exists and suits the change's channel", () => {
    const madeUp = good();
    madeUp.changes[0].principleIds = ["secret-sauce"];
    expect(failed(madeUp)).toContain("Applies the offer playbook");
    const none = good();
    none.changes[0].principleIds = [];
    expect(failed(none)).toContain("Applies the offer playbook");
    // Paying for ads with an entry offer is a paid social principle, not a search one.
    const misfit = good();
    misfit.changes[0].principleIds = ["self-liquidating-entry"];
    expect(failed(misfit)).toContain("Applies the offer playbook");
    const noPosition = good();
    noPosition.offerPosition = { text: "", principleIds: [] };
    expect(failed(noPosition)).toContain("Applies the offer playbook");
  });

  it("keeps the playbook well formed: unique ids, credited, with uses and risks", () => {
    expect(new Set(PLAYBOOK.map((row) => row.id)).size).toBe(PLAYBOOK.length);
    for (const row of PLAYBOOK) {
      expect(row.source.author && row.source.work && row.idea && row.useWhen && row.risks).toBeTruthy();
    }
  });
});
