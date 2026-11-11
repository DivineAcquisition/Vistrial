/**
 * @vitest-environment edge-runtime
 *
 * The Growth Architect work tabs: the growth goal, offer cards and their versions, the outcome loop for
 * offer changes and roadmap steps, the skill-scoped chat, and each tab's results and suggestions. Every
 * test checks roles and that one workspace never reads or writes another's.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { readGoal } from "./goals";
import { cleanOffer, compareOffers } from "./offers";
import { offerFromAnswers } from "./skillIntake";
import { suggestionsFor } from "./lib/workTabs";
import type { OfferAnalysis, OfferContext } from "./skills/offerIntelligence/shapes";
import type { Diagnosis, DiagnosticsRecord } from "./skills/growthDiagnostics/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
const AGENT = "growth-architect";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await t.run((ctx) => ctx.db.insert("members", { workspaceId, userId: `${name}-viewer`, role: "viewer", displayName: "Viewer", active: true }));
  return { owner, viewer: t.withIdentity(person(`${name}-viewer`)), workspaceId };
}

const card = { name: "Lead generation retainer", price: "$2,500", included: ["Paid ads", "Landing pages"], guarantee: "We work free until it is met", terms: "30-day cancel notice", targetCustomer: "Home-service brands" };

function offerAnalysis(): OfferAnalysis {
  return {
    summary: "Your offer leads on price but states no guarantee.",
    offerPosition: { text: "Lead with the guarantee.", principleIds: [] },
    currentOffer: { product: "Lead generation retainer", price: "$2,500", guarantee: "Not stated", terms: "Not stated", basis: "stated", sourceRefIds: [], factIds: [] },
    competitorOffers: [
      { competitor: "LeadForge Media", offer: "First month 20% off", price: "$1,950", guarantee: "30 leads in 30 days or the next month is free", basis: "observed", sourceRefIds: ["s1"] },
      { competitor: "Summit Scale", offer: "Weekly plan", price: "Not stated", guarantee: "", basis: "observed", sourceRefIds: ["s2"] },
    ],
    gapsAndRisks: [{ kind: "gap", statement: "Competitors state a guarantee; you do not.", basis: "observed", sourceRefIds: ["s1"] }],
    changes: [
      {
        title: "Add a results guarantee",
        evidence: { text: "LeadForge Media leads with one.", basis: "observed", sourceRefIds: ["s1"] },
        fit: { text: "Fits your audience.", profileFields: ["audience"], factIds: [], decisionIds: [] },
        channel: "paidSocial",
        newChannel: false,
        principleIds: [],
        proposedChange: "Promise 20 booked calls in 60 days.",
        validationMethod: "Compare booked calls for four weeks before and after.",
        metric: "bookings",
      },
      {
        title: "Offer a pilot price",
        evidence: { text: "Two competitors discount the first visit.", basis: "inferred", sourceRefIds: ["s1", "s2"] },
        fit: { text: "Price-led buyers.", profileFields: ["priceNotes"], factIds: [], decisionIds: [] },
        channel: "paidSocial",
        newChannel: false,
        principleIds: [],
        proposedChange: "Take $500 off the first month.",
        validationMethod: "Watch cost per signed client.",
        metric: "costPerBooking",
      },
    ],
    limits: [],
    contextUsed: { profileVersionId: null, factIds: [], reportIds: [] },
  } as OfferAnalysis;
}

/** An offer analysis saved the way the skill saves one: the asset, its run, and the run's records. */
async function seedOfferAsset(t: Tester, workspaceId: Id<"workspaces">, status: "draft" | "approved" = "draft") {
  return t.run(async (ctx) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("researchProjects", { workspaceId, title: "Lead generation, Texas", objective: "o", market: "Lead generation", geography: "Texas", competitors: [], platforms: ["web"], suppliedUrls: [], status: "ready", createdBy: "x", createdAt: now, updatedAt: now });
    const runId = await ctx.db.insert("agentRuns", { workspaceId, agentSlug: AGENT, skillSlug: "offer-intelligence", status: "completed", startedBy: "x", inputRef: "offer-intelligence", startedAt: now, costCents: 40, inputTokens: 0, outputTokens: 0 });
    const step = (index: number, phase: string) => ctx.db.insert("runSteps", { workspaceId, runId, index, idempotencyKey: `${runId}-${index}`, kind: "tool", status: "completed", durationMs: 1, inputTokens: 0, outputTokens: 0, resultCode: "ok", phase });
    const contextStep = await step(0, "context");
    const saveStep = await step(1, "save");
    const context = {
      reports: [{ assetId: "a", title: "Lead generation report", version: 1, projectId, claims: [] }],
      researchSources: [
        { id: "s1", platform: "metaAdLibrary", title: "LeadForge Media ad", publisher: "LeadForge Media", url: "https://example.com/ad", excerpt: null, offerReading: null, observed: "2026-10-01", channel: "paidSocial" },
        { id: "s2", platform: "web", title: "Summit Scale pricing", publisher: "Summit Scale", url: "https://example.com/pricing", excerpt: null, offerReading: null, observed: "2026-10-01", channel: null },
      ],
      ownSources: [],
      baseProjectId: null,
      profile: { versionId: "p", offer: "Lead generation retainer", priceNotes: "$2,500", audience: "Home-service brands", geography: "Texas", channels: "Meta", brandVoice: "", competitors: [] },
      facts: [],
      channels: [],
      decisions: [],
      offerDetails: "",
      gaps: [],
      known: [],
      missing: [],
      assumptions: [],
    } as unknown as OfferContext;
    await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId: contextStep, kind: "context", byteSize: 1, body: JSON.stringify(context) });
    await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId: saveStep, kind: "analysis", byteSize: 1, body: JSON.stringify({ analysis: offerAnalysis() }) });
    const assetId = await ctx.db.insert("assets", { workspaceId, kind: "offerAnalysis", title: "Offer analysis: Lead generation retainer", status, currentVersion: 1, createdByRun: runId, createdAt: now });
    return { assetId, projectId, runId };
  });
}

function diagnosis(): Diagnosis {
  return {
    summary: "Leads cost the most.",
    stage: "leads",
    stageReason: "Few clicks become leads.",
    stageFigureIds: ["F1"],
    findings: [{ statement: "Each lead costs $25.00.", figureIds: ["F1"] }],
    fixes: [
      { fix: "Reply faster", why: "Costly leads.", figureIds: ["F1"], howToTell: "Watch cost per lead." },
      { fix: "New headline", why: "Click rate.", figureIds: ["F2"], howToTell: "Watch click-through rate." },
    ],
    roadmap: [
      { phase: "fix", problem: "Each lead costs $25.00.", figureIds: ["F1"], action: "Reply within an hour", targetMetric: "Meta cost per lead", target: "Below $25.00" },
      { phase: "build", problem: "Click-through rate is 1.00%.", figureIds: ["F2"], action: "Test a new headline", targetMetric: "Meta click-through rate", target: "Above 1.00%" },
      { phase: "scale", problem: "Not enough data to size a second channel.", figureIds: [], action: "Move budget to the winner", targetMetric: "Meta cost per lead", target: "Not enough data" },
    ],
    limits: [],
  };
}

async function seedDiagnosisAsset(t: Tester, workspaceId: Id<"workspaces">) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("researchProjects", { workspaceId, title: "Growth diagnosis", objective: "o", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "ready", createdBy: "x", createdAt: now, updatedAt: now });
    const runId = await ctx.db.insert("agentRuns", { workspaceId, agentSlug: AGENT, skillSlug: "growth-diagnostics", status: "completed", startedBy: "x", inputRef: projectId, startedAt: now, costCents: 20, inputTokens: 0, outputTokens: 0 });
    const readStep = await ctx.db.insert("runSteps", { workspaceId, runId, index: 0, idempotencyKey: `${runId}-0`, kind: "tool", status: "completed", durationMs: 1, inputTokens: 0, outputTokens: 0, resultCode: "ok", phase: "gdRead" });
    const saveStep = await ctx.db.insert("runSteps", { workspaceId, runId, index: 1, idempotencyKey: `${runId}-1`, kind: "tool", status: "completed", durationMs: 1, inputTokens: 0, outputTokens: 0, resultCode: "ok", phase: "save" });
    const record: DiagnosticsRecord = {
      projectId,
      hasData: true,
      inputs: { meta: true, uploads: 0, decisions: 0, measuredDecisions: 0 },
      figures: [
        { id: "F1", stage: "leads", label: "Meta cost per lead", value: 25, display: "$25.00", computed: true, formula: "spend ÷ leads", origin: "meta", sourceRefIds: [] },
        { id: "F2", stage: "clicks", label: "Meta click-through rate", value: 0.01, display: "1.00%", computed: false, origin: "meta", sourceRefIds: [] },
      ],
      stagesWithData: ["clicks", "leads"],
      decisions: [],
      missing: [],
      profile: null,
      facts: [],
      goal: { text: "10 more clients a month", target: 10, metric: "clients", period: "month" },
    };
    await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId: readStep, kind: "diagnostics", byteSize: 1, body: JSON.stringify(record) });
    await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId: saveStep, kind: "diagnosis", byteSize: 1, body: JSON.stringify({ diagnosis: diagnosis() }) });
    const assetId = await ctx.db.insert("assets", { workspaceId, kind: "growthDiagnosis", title: "Growth diagnosis", status: "draft", currentVersion: 1, createdByRun: runId, createdAt: now });
    return { assetId, projectId };
  });
}

describe("the growth goal", () => {
  it("reads a number, a measure and a period from the owner's words, and nothing it cannot see", () => {
    expect(readGoal("10 more clients a month")).toEqual({ target: 10, metric: "clients", period: "month" });
    expect(readGoal("$10k revenue per month")).toEqual({ target: 10000, metric: "revenue (money)", period: "month" });
    expect(readGoal("200 leads a quarter")).toEqual({ target: 200, metric: "leads", period: "quarter" });
    expect(readGoal("More repeat customers")).toEqual({});
  });

  it("stores the goal, keeps earlier ones as history, and is the workspace's own", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    expect(await a.owner.query(api.goals.get, { workspaceId: a.workspaceId })).toBeNull();
    await a.owner.mutation(api.goals.set, { workspaceId: a.workspaceId, text: "10 more clients a month" });
    await a.owner.mutation(api.goals.set, { workspaceId: a.workspaceId, text: "15 more clients a month" });
    const goal = await a.owner.query(api.goals.get, { workspaceId: a.workspaceId });
    expect(goal).toMatchObject({ text: "15 more clients a month", target: 15, metric: "clients", period: "month" });
    expect(await t.run((ctx) => ctx.db.query("growthGoals").collect())).toHaveLength(2);
    expect(await b.owner.query(api.goals.get, { workspaceId: b.workspaceId })).toBeNull();
    await expect(b.owner.query(api.goals.get, { workspaceId: a.workspaceId })).rejects.toThrow();
    await expect(a.viewer.mutation(api.goals.set, { workspaceId: a.workspaceId, text: "1 more client" })).rejects.toThrow();
    // A viewer can read it.
    expect((await a.viewer.query(api.goals.get, { workspaceId: a.workspaceId }))?.text).toBe("15 more clients a month");
    await expect(a.owner.mutation(api.goals.set, { workspaceId: a.workspaceId, text: " " })).rejects.toThrow();
  });
});

describe("offer cards", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("compares two versions field by field, with what's included added and removed", () => {
    const before = cleanOffer(card);
    const after = cleanOffer({ ...card, price: "$2,900", included: ["Paid ads", "Call tracking", "Landing pages"] });
    const changes = compareOffers(before, after);
    expect(changes.filter((row) => row.changed).map((row) => row.field)).toEqual(["price", "included"]);
    const included = changes.find((row) => row.field === "included");
    expect(included && "added" in included ? [included.added, included.removed] : null).toEqual([["Call tracking"], []]);
    expect(compareOffers(before, before).every((row) => !row.changed)).toBe(true);
    // "Not stated" from an analysis reads as blank, and repeats are dropped.
    expect(cleanOffer({ ...card, guarantee: "Not stated", included: ["Paid ads", "paid ads", " "] })).toMatchObject({ guarantee: "", included: ["Paid ads"] });
  });

  it("versions a card on every change, never overwrites, adds nothing for the same content, and compares", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const first = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...card });
    expect(first).toMatchObject({ version: 1, added: true });
    const same = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId: first.cardId, ...card });
    expect(same).toMatchObject({ version: 1, added: false });
    const second = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId: first.cardId, ...card, price: "$2,900", note: "Raised the price" });
    expect(second.version).toBe(2);
    const read = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: first.cardId });
    expect(read.versions.map((row) => [row.version, row.price])).toEqual([[1, "$2,500"], [2, "$2,900"]]);
    expect(read.currentVersion).toBe(2);
    const compared = await a.owner.query(api.offers.compare, { workspaceId: a.workspaceId, cardId: first.cardId, from: 1, to: 2 });
    expect(compared.changes.filter((row) => row.changed).map((row) => row.field)).toEqual(["price"]);
    const list = await a.owner.query(api.offers.list, { workspaceId: a.workspaceId });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ versions: 2, current: { price: "$2,900", note: "Raised the price" } });
    await expect(a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...card, name: "" })).rejects.toThrow();
  });

  it("only Owners and Admins write, and no workspace reads another's cards", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const { cardId } = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...card });
    await expect(a.viewer.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId, ...card, price: "$1" })).rejects.toThrow();
    expect(await a.viewer.query(api.offers.list, { workspaceId: a.workspaceId })).toHaveLength(1);
    await expect(b.owner.query(api.offers.get, { workspaceId: b.workspaceId, cardId })).rejects.toThrow();
    await expect(b.owner.mutation(api.offers.saveVersion, { workspaceId: b.workspaceId, cardId, ...card, price: "$1" })).rejects.toThrow();
    await expect(b.owner.query(api.offers.list, { workspaceId: a.workspaceId })).rejects.toThrow();
    expect(await b.owner.query(api.offers.list, { workspaceId: b.workspaceId })).toEqual([]);
  });

  it("reads an offer analysis as the side-by-side, with gaps where a competitor states what the offer does not", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const { assetId } = await seedOfferAsset(t, a.workspaceId);
    const view = (await a.owner.query(api.offers.analysis, { workspaceId: a.workspaceId, assetId }))!;
    expect(view.ours).toMatchObject({ product: "Lead generation retainer", price: "$2,500" });
    expect(view.competitors.map((row) => [row.competitor, row.gaps.guarantee, row.gaps.price])).toEqual([
      ["LeadForge Media", true, false],
      ["Summit Scale", false, false],
    ]);
    expect(view.competitors[0].sources).toEqual([{ id: "s1", title: "LeadForge Media ad", url: "https://example.com/ad", platform: "metaAdLibrary" }]);
    expect(view.changes.map((row) => row.title)).toEqual(["Add a results guarantee", "Offer a pilot price"]);
    await expect(b.owner.query(api.offers.analysis, { workspaceId: b.workspaceId, assetId })).rejects.toThrow();
  });

  it("adds the offer the analysis read from the business, never a competitor's, as a new card version", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const { assetId } = await seedOfferAsset(t, a.workspaceId);
    const { cardId } = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...card, price: "$170" });
    const added = await a.owner.mutation(api.offers.fromAnalysis, { workspaceId: a.workspaceId, assetId, cardId });
    expect(added).toMatchObject({ version: 2, added: true });
    const read = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId });
    expect(read.versions[1]).toMatchObject({ origin: "analysis", price: "$2,500", guarantee: "", included: ["Paid ads", "Landing pages"], targetCustomer: "Home-service brands" });
    expect(JSON.stringify(read.versions)).not.toContain("LeadForge");
    await expect(a.viewer.mutation(api.offers.fromAnalysis, { workspaceId: a.workspaceId, assetId })).rejects.toThrow();
  });
});

describe("the outcome loop for offer changes and roadmap steps", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("plans an offer change on the research project it built on, once, and keeps it off the report's opportunities", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const { assetId, projectId } = await seedOfferAsset(t, a.workspaceId);
    const id = await a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 1, checkInDays: 30 });
    expect(await a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 1, checkInDays: 30 })).toBe(id);
    const rows = await a.owner.query(api.decisions.forAsset, { workspaceId: a.workspaceId, assetId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemKind: "offerChange", opportunityIndex: 1, opportunity: "Offer a pilot price", proposedAction: "Take $500 off the first month.", validationMethod: "Watch cost per signed client." });
    const saved = await t.run((ctx) => ctx.db.get(id));
    expect(saved?.projectId).toBe(projectId);
    expect(await a.owner.query(api.decisions.forProject, { workspaceId: a.workspaceId, projectId })).toEqual([]);
    await a.owner.mutation(api.decisions.recordOutcome, { workspaceId: a.workspaceId, decisionId: id, result: "better", note: "More signed clients." });
    expect((await a.owner.query(api.decisions.forAsset, { workspaceId: a.workspaceId, assetId }))[0].outcome?.result).toBe("better");
    await expect(a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 9, checkInDays: 30 })).rejects.toThrow();
    await expect(a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 7 })).rejects.toThrow();
  });

  it("plans a roadmap step with its phase, its target as the way to tell, on the diagnosis's own project", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const { assetId, projectId } = await seedDiagnosisAsset(t, a.workspaceId);
    const id = await a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 14 });
    const row = (await a.owner.query(api.decisions.forAsset, { workspaceId: a.workspaceId, assetId }))[0];
    expect(row).toMatchObject({ id, itemKind: "roadmapStep", phase: "fix", proposedAction: "Reply within an hour", validationMethod: "Watch Meta cost per lead. Target: Below $25.00" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.projectId).toBe(projectId);
  });

  it("refuses viewers, other workspaces and rejected work", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const { assetId } = await seedDiagnosisAsset(t, a.workspaceId);
    await expect(a.viewer.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 14 })).rejects.toThrow();
    await expect(b.owner.mutation(api.decisions.planItem, { workspaceId: b.workspaceId, assetId, index: 0, checkInDays: 14 })).rejects.toThrow();
    await expect(b.owner.query(api.decisions.forAsset, { workspaceId: b.workspaceId, assetId })).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(assetId, { status: "rejected" }));
    await expect(a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 14 })).rejects.toThrow();
  });
});

describe("the Diagnostics tab", () => {
  it("shows the goal and the roadmap in three phases, each step with the figures it cites", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const empty = await a.owner.query(api.workTabs.diagnostics, { workspaceId: a.workspaceId });
    expect(empty).toEqual({ goal: null, data: { meta: false, resultsFiles: 0, outcomes: 0 }, diagnosis: null });
    await a.owner.mutation(api.goals.set, { workspaceId: a.workspaceId, text: "10 more clients a month" });
    const { assetId } = await seedDiagnosisAsset(t, a.workspaceId);
    const view = await a.owner.query(api.workTabs.diagnostics, { workspaceId: a.workspaceId });
    expect(view.goal?.text).toBe("10 more clients a month");
    expect(view.diagnosis?.assetId).toBe(assetId);
    expect(view.diagnosis?.goalUsed).toBe("10 more clients a month");
    expect(view.diagnosis?.roadmap.map((row) => row.phase)).toEqual(["fix", "build", "scale"]);
    expect(view.diagnosis?.roadmap[0].figures).toEqual([{ id: "F1", label: "Meta cost per lead", display: "$25.00", computed: true, formula: "spend ÷ leads", period: null }]);
    expect(view.diagnosis?.roadmap[2]).toMatchObject({ figures: [], target: "Not enough data" });
    expect((await b.owner.query(api.workTabs.diagnostics, { workspaceId: b.workspaceId })).diagnosis).toBeNull();
    await expect(b.owner.query(api.workTabs.diagnostics, { workspaceId: b.workspaceId, assetId })).rejects.toThrow();
  });
});

describe("the Diagnostics tab's data checklist", () => {
  it("says which of the workspace's own data is connected: Meta, results files and outcomes", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    await t.run(async (ctx) => {
      await ctx.db.insert("metaConnections", { workspaceId: a.workspaceId, source: "oauth", accessToken: "SECRET", scopes: ["ads_read"], metaUserId: "m1", metaUserName: "Pat", connectedBy: "x", connectedAt: 1, status: "connected", callsOk: 0, callsFailed: 0 });
      const upload = { workspaceId: a.workspaceId, fileName: "hubspot-deals.csv", label: "HubSpot deals", currency: "USD", uploadedBy: "x", createdAt: 1 };
      await ctx.db.insert("resultUploads", { ...upload, status: "ready" });
      await ctx.db.insert("resultUploads", { ...upload, fileName: "signed-clients.csv", status: "ready" });
      // A refused file is not connected data.
      await ctx.db.insert("resultUploads", { ...upload, fileName: "broken.csv", status: "refused", code: "no_metrics" });
    });
    const view = await a.viewer.query(api.workTabs.diagnostics, { workspaceId: a.workspaceId });
    expect(view.data).toEqual({ meta: true, resultsFiles: 2, outcomes: 0 });
    // A connection that needs reconnecting does not count.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("metaConnections").first())!;
      await ctx.db.patch(row._id, { status: "needsReconnect" });
    });
    expect((await a.owner.query(api.workTabs.diagnostics, { workspaceId: a.workspaceId })).data.meta).toBe(false);
    // An outcome recorded on a roadmap step counts.
    const { assetId } = await seedDiagnosisAsset(t, a.workspaceId);
    const planned = await a.owner.mutation(api.decisions.planItem, { workspaceId: a.workspaceId, assetId, index: 0, checkInDays: 14 });
    await a.owner.mutation(api.decisions.recordOutcome, { workspaceId: a.workspaceId, decisionId: planned, result: "better", note: "Two more signed clients." });
    expect((await a.owner.query(api.workTabs.diagnostics, { workspaceId: a.workspaceId })).data.outcomes).toBe(1);
    // Another workspace sees none of it.
    expect((await b.owner.query(api.workTabs.diagnostics, { workspaceId: b.workspaceId })).data).toEqual({ meta: false, resultsFiles: 0, outcomes: 0 });
  });
});

describe("each tab's results and suggestions", () => {
  it("lists only the tab's skill's work, drafts waiting for review first", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    await seedOfferAsset(t, a.workspaceId, "approved");
    const { assetId: draft } = await seedOfferAsset(t, a.workspaceId, "draft");
    await seedDiagnosisAsset(t, a.workspaceId);
    const offers = await a.owner.query(api.workTabs.tab, { workspaceId: a.workspaceId, skillSlug: "offer-intelligence" });
    expect(offers.results.map((row) => row.status)).toEqual(["draft", "approved"]);
    expect(offers.results[0].id).toBe(draft);
    const diagnostics = await a.owner.query(api.workTabs.tab, { workspaceId: a.workspaceId, skillSlug: "growth-diagnostics" });
    expect(diagnostics.results).toHaveLength(1);
    expect((await b.owner.query(api.workTabs.tab, { workspaceId: b.workspaceId, skillSlug: "offer-intelligence" })).results).toEqual([]);
    await expect(a.owner.query(api.workTabs.tab, { workspaceId: a.workspaceId, skillSlug: "campaign-strategy" })).rejects.toThrow();
  });

  it("suggests the next steps an approved report unlocks, and never one that runs on its own", () => {
    const none = { approvedReport: false, approvedOffer: false, approvedDiagnosis: false, ownData: false, goal: false };
    const report = { ...none, approvedReport: true, ownData: true };
    expect(suggestionsFor("research", report).map((row) => row.title)).toEqual(["Analyse your offer against this", "Find where growth stalls"]);
    expect(suggestionsFor("research", report).map((row) => row.tab)).toEqual(["offers", "diagnostics"]);
    // Without its own data, the diagnosis suggestion sends the owner to connect it first.
    expect(suggestionsFor("research", { ...report, ownData: false })[1].tab).toBe("connections");
    expect(suggestionsFor("research", none).map((row) => row.tab)).toEqual(["research"]);
    expect(suggestionsFor("offers", none)[0].tab).toBe("research");
    expect(suggestionsFor("diagnostics", none)[0].tab).toBe("connections");
  });
});

describe("the skill-scoped chat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turns the owner's offer answers into card content in code", () => {
    expect(offerFromAnswers({ offer: "Lead generation retainer, $2,500", included: "Paid ads, Landing pages, Results guarantee: we work free until it is met, 30-day cancel notice" }, "Home-service brands")).toMatchObject({
      name: "Lead generation retainer",
      price: "$2,500",
      included: ["Paid ads", "Landing pages"],
      guarantee: "Results guarantee: we work free until it is met",
      terms: "30-day cancel notice",
      targetCustomer: "Home-service brands",
    });
    expect(offerFromAnswers({ offer: "Lawn care plan $49/month", included: "No guarantee" })).toMatchObject({ name: "Lawn care plan", price: "$49/month", guarantee: "", included: [] });
  });

  it("Diagnostics asks the goal first, shows the plan and budget, and stores the goal only on Start", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const intakeId = await a.owner.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "growth-diagnostics", text: "Where is my growth stuck?" });
    let view = await a.owner.query(api.skillIntake.get, { workspaceId: a.workspaceId, intakeId });
    expect(view.intake.asking).toBe("goal");
    expect(view.messages.at(-1)?.kind).toBe("question");
    await expect(a.owner.mutation(api.skillIntake.start, { workspaceId: a.workspaceId, intakeId })).rejects.toThrow();
    await a.owner.mutation(api.skillIntake.reply, { workspaceId: a.workspaceId, intakeId, text: "10 more clients a month" });
    view = await a.owner.query(api.skillIntake.get, { workspaceId: a.workspaceId, intakeId });
    expect(view.intake.status).toBe("ready");
    const plan = view.messages.at(-1)!;
    expect(plan.kind).toBe("plan");
    expect(plan.data).toMatchObject({ skill: "growth-diagnostics", capCents: 100 });
    // Nothing is stored or run before Start.
    expect(await a.owner.query(api.goals.get, { workspaceId: a.workspaceId })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);
    await expect(a.viewer.mutation(api.skillIntake.start, { workspaceId: a.workspaceId, intakeId })).rejects.toThrow();
    const started = await a.owner.mutation(api.skillIntake.start, { workspaceId: a.workspaceId, intakeId });
    expect((await a.owner.query(api.goals.get, { workspaceId: a.workspaceId }))?.target).toBe(10);
    const run = await t.run((ctx) => ctx.db.get(started.runId));
    expect(run).toMatchObject({ skillSlug: "growth-diagnostics", inputRef: started.projectId });
    const project = await t.run((ctx) => ctx.db.get(started.projectId!));
    expect(project?.platforms).toEqual(["customerData"]);
    // Pressing Start again returns the same run.
    expect((await a.owner.mutation(api.skillIntake.start, { workspaceId: a.workspaceId, intakeId })).runId).toBe(started.runId);
  });

  it("takes a goal stated in the first message, and uses the goal on record without asking", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const first = await a.owner.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "growth-diagnostics", text: "I want 25 more leads a week" });
    expect((await a.owner.query(api.skillIntake.get, { workspaceId: a.workspaceId, intakeId: first })).intake).toMatchObject({ status: "ready", answers: { goal: "I want 25 more leads a week" } });
    await a.owner.mutation(api.goals.set, { workspaceId: a.workspaceId, text: "10 more clients a month" });
    const second = await a.owner.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "growth-diagnostics", text: "Run it again" });
    expect((await a.owner.query(api.skillIntake.get, { workspaceId: a.workspaceId, intakeId: second })).intake).toMatchObject({ status: "ready", answers: { goal: "10 more clients a month" } });
  });

  it("Offers asks about the offer, saves a chat version of the card and the owner's facts on Start, then runs Offer Intelligence", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const intakeId = await a.owner.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "offer-intelligence", text: "Help me sharpen my offer" });
    await a.owner.mutation(api.skillIntake.reply, { workspaceId: a.workspaceId, intakeId, text: "Lead generation retainer, $2,500" });
    await a.owner.mutation(api.skillIntake.reply, { workspaceId: a.workspaceId, intakeId, text: "Paid ads, Landing pages, Satisfaction guarantee" });
    expect((await a.owner.query(api.skillIntake.get, { workspaceId: a.workspaceId, intakeId })).intake.asking).toBe("acquisitionChannels");
    await a.owner.mutation(api.skillIntake.reply, { workspaceId: a.workspaceId, intakeId, text: "Referrals" });
    expect((await a.owner.query(api.skillIntake.open, { workspaceId: a.workspaceId, skillSlug: "offer-intelligence" }))?.intake.status).toBe("ready");
    const started = await a.owner.mutation(api.skillIntake.start, { workspaceId: a.workspaceId, intakeId });
    expect((await t.run((ctx) => ctx.db.get(started.runId)))?.skillSlug).toBe("offer-intelligence");
    const cards = await a.owner.query(api.offers.list, { workspaceId: a.workspaceId });
    expect(cards[0].current).toMatchObject({ name: "Lead generation retainer", price: "$2,500", included: ["Paid ads", "Landing pages"], guarantee: "Satisfaction guarantee", origin: "chat" });
    const facts = await a.owner.query(api.facts.list, { workspaceId: a.workspaceId });
    expect(facts.find((row) => row.factKey === "acquisitionChannels")?.value).toBe("Referrals");
    expect(facts.find((row) => row.factKey === "offerDetails")?.status).toBe("verified");
    expect(await a.owner.query(api.skillIntake.open, { workspaceId: a.workspaceId, skillSlug: "offer-intelligence" })).toBeNull();
  });

  it("is the workspace's own, only for chat skills, and only Owners and Admins start one", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    await expect(a.viewer.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "growth-diagnostics", text: "Hi" })).rejects.toThrow();
    await expect(a.owner.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "campaign-strategy", text: "Hi" })).rejects.toThrow();
    const intakeId = await a.owner.mutation(api.skillIntake.create, { workspaceId: a.workspaceId, skillSlug: "growth-diagnostics", text: "Hi" });
    await expect(b.owner.query(api.skillIntake.get, { workspaceId: b.workspaceId, intakeId })).rejects.toThrow();
    await expect(b.owner.mutation(api.skillIntake.reply, { workspaceId: b.workspaceId, intakeId, text: "10 more clients a month" })).rejects.toThrow();
    await expect(b.owner.mutation(api.skillIntake.start, { workspaceId: b.workspaceId, intakeId })).rejects.toThrow();
  });
});
