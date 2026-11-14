/**
 * @vitest-environment edge-runtime
 *
 * Proposal Architect (Dealmaker, "proposal"): the checks in code (the price is the Offer folder's, deliverables in
 * the package's words, needs on the review's quotes, no promise, no pressure), and whole runs with a scripted model:
 * a proposal that waits for a person's review, one that fails twice and shows as needing review, and the refusals.
 * docs/rebuild/dealmaker.md, 0.8 and 4.5.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ReviewView } from "./lib/dealmaker/reviewView";
import type { ScriptedModel } from "./lib/toolRouter";
import { runChecks } from "./skills/proposalArchitect/checks";
import { computeProposal } from "./skills/proposalArchitect/compute";
import { renderProposal, viewOf } from "./skills/proposalArchitect/render";
import type { Proposal } from "./skills/proposalArchitect/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";

const REVIEW: ReviewView = {
  outcome: "Jordan asked for a proposal and needs a partner's sign-off.",
  nextStep: "Send the proposal by Friday.",
  checksPassed: true,
  fit: [
    { field: "need", label: "Need", said: true, finding: "More booked calls each month", quote: "We need more booked calls every month", kind: "Buyer's words" },
    { field: "budget", label: "Budget", said: true, finding: "Around $3,000 a month", quote: "Our budget is around $3,000 a month.", kind: "Buyer's words" },
    { field: "timing", label: "Timing", said: false, finding: "", quote: "" },
  ],
  objections: [{ text: "Price feels high", quote: "it feels expensive for where we are", kind: "Buyer's words", answered: true, answerQuote: "most of the cost is follow-up" }],
  commitments: [{ owner: "We", what: "Send the proposal", quote: "I'll send the proposal by Friday.", kind: "Rep's words, Milo" }],
  coverage: [],
  updates: [],
  missing: [],
};

const ITEMS = [
  { id: "pkg", folder: "offer", kind: "package", title: "Growth Sprint", body: "Twelve weeks. Weekly strategy call, ads managed, monthly report." },
  { id: "price", folder: "offer", kind: "price", title: "Growth Sprint: $4,500 a month", body: "Three-month minimum. No setup fee." },
  { id: "proof", folder: "offer", kind: "proof", title: "Harbor Dental: 41 booked consultations in 60 days", body: "" },
  { id: "won", folder: "closing", kind: "winningProposal", title: "Harbor proposal", body: "Dear Harbor team, ..." },
];

const record = computeProposal({ proposalId: "x", projectId: "p", leadName: "Jordan Lee", callDate: "2026-11-13", review: REVIEW, items: ITEMS, lessons: [] });

function good(): Proposal {
  return {
    title: "Growth Sprint for Jordan & Co.",
    intro: "Thanks for the call, Jordan. You told us the pipeline is thin and you want more booked calls each month. Here is how the Growth Sprint would work for you.",
    needs: [
      { need: "More booked calls every month", quoteId: "q1" },
      { need: "A budget that fits where you are", quoteId: "q2" },
    ],
    packageId: "f1",
    deliverables: ["Weekly strategy call", "ads managed", "monthly report"],
    priceId: "f2",
    guaranteeId: "",
    proofIds: ["f3"],
    nextSteps: ["Talk it over with your partner", "Reply to this email with any questions"],
    closing: "We look forward to hearing what you and your partner think.",
  };
}

describe("a proposal's checks (code)", () => {
  it("reads the review's quotes with who said each, and the offer in order", () => {
    expect(record.quotes.map((row) => [row.id, row.buyer])).toEqual([
      ["q1", true],
      ["q2", true],
      ["q3", true],
      ["q4", false],
    ]);
    expect(record.offer.map((row) => [row.id, row.kind])).toEqual([
      ["f1", "package"],
      ["f2", "price"],
      ["f3", "proof"],
    ]);
    expect(record.winning).toHaveLength(1);
  });

  it("passes a proposal grounded in the review and the offer, and copies the offer's words in code", () => {
    expect(runChecks(good(), record)).toMatchObject({ passed: true });
    const view = viewOf(good(), record, true)!;
    expect(view.price).toEqual({ itemId: "price", title: "Growth Sprint: $4,500 a month", body: "Three-month minimum. No setup fee." });
    expect(view.needs[0]).toEqual({ need: "More booked calls every month", quote: "We need more booked calls every month", kind: "Buyer's words" });
    expect(renderProposal(good(), record, { passed: true, results: [] }, [])).toContain("**Growth Sprint: $4,500 a month**");
  });

  it("fails a bare need, a stray package, a price of its own, an invented deliverable, a promise, pressure, and no next step", () => {
    const fail = (draft: Proposal) => runChecks(draft, record).results.filter((row) => !row.passed).map((row) => row.id);
    const g = good();
    expect(fail({ ...g, needs: [{ need: "Growth", quoteId: "q9" }] })).toEqual([1]);
    // Deliverables are then not in a package either.
    expect(fail({ ...g, packageId: "f3" })).toEqual([2, 4]);
    expect(fail({ ...g, priceId: "f1" })).toEqual([3]);
    expect(fail({ ...g, intro: `${g.intro} For you, $3,500 a month.` })).toEqual([3]);
    expect(fail({ ...g, deliverables: [...g.deliverables, "A new website"] })).toEqual([4]);
    expect(fail({ ...g, closing: "This will double your booked calls." })).toEqual([5]);
    expect(fail({ ...g, proofIds: [] , intro: "Harbor Dental booked 41 consultations." })).toEqual([5]);
    expect(fail({ ...g, closing: "Sign this week, it's a limited-time offer." })).toEqual([6]);
    expect(fail({ ...g, nextSteps: [] })).toEqual([7]);
    expect(runChecks(null, record).passed).toBe(false);
  });
});

// ---------- Whole runs ----------

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

function script(answer: (revise: boolean) => unknown) {
  const inputs: string[] = [];
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = (params) => {
    const text = String(params.messages[0].content);
    inputs.push(text);
    const revise = text.startsWith("Revise the proposal");
    if (!revise && !text.startsWith("Write the proposal")) throw new Error(`unscripted call: ${text.slice(0, 40)}`);
    return { text: JSON.stringify(answer(revise)) };
  };
  return inputs;
}

async function setup(options: { offer?: boolean; passed?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "vic@example.com", role: "viewer" });
  const viewer = t.withIdentity(person("vic"));
  await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
  await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", AGENT)).unique())!;
    await ctx.db.patch(agent._id, { status: "live" });
    for (const workKind of ["classify", "research", "write", "summarize"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  const reviewId = await t.run(async (ctx) => {
    for (const row of ITEMS) {
      if (options.offer === false && row.folder === "offer" && row.kind === "price") continue;
      await ctx.db.insert("playbookItems", { workspaceId, folder: row.folder as "offer", kind: row.kind as "package", title: row.title, body: row.body, source: { type: "person" }, basis: "firstParty", status: "active", createdBy: "dana", createdAt: 1, updatedAt: 1 });
    }
    const projectId = await ctx.db.insert("researchProjects", { workspaceId, title: "Call review", objective: "", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "dana", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("callReviews", { workspaceId, projectId, contactRef: "c1", dealRef: "d1", leadName: "Jordan Lee", status: "ready", view: { ...REVIEW, checksPassed: options.passed !== false }, createdBy: "dana", createdAt: NOW - 1000 });
  });
  return { t, owner, viewer, workspaceId, reviewId };
}

async function runProposal(s: Awaited<ReturnType<typeof setup>>) {
  const { maxCredits } = await s.owner.query(api.proposals.quote, { workspaceId: s.workspaceId });
  const { proposalId, runId } = await s.owner.mutation(api.proposals.request, { workspaceId: s.workspaceId, reviewId: s.reviewId, confirmedCredits: maxCredits });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  return { status, proposalId: proposalId as Id<"proposals"> };
}

describe("a proposal, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("writes once from the review and the offer, and waits for a person's review before it may be sent", async () => {
    const inputs = script(() => good());
    const s = await setup();
    const out = await runProposal(s);
    expect(out.status).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED CONTENT");
    expect(inputs[0]).toContain('"saidBy":"Rep\'s words, Milo"');
    const shown = await s.owner.query(api.proposals.proposal, { workspaceId: s.workspaceId, proposalId: out.proposalId });
    expect(shown).toMatchObject({ state: "ready", approved: false, leadName: "Jordan Lee" });
    expect(shown.view?.price.title).toBe("Growth Sprint: $4,500 a month");
    expect(shown.view?.proof.map((row) => row.title)).toEqual(["Harbor Dental: 41 booked consultations in 60 days"]);
    const assets = await s.t.run((ctx) => ctx.db.query("assets").collect());
    expect(assets.map((row) => [row.kind, row.status])).toEqual([["proposal", "draft"]]);
    // It goes to a lead, so it joins the approvals queue; nothing is sent and nothing is drafted to the lead yet.
    expect(await s.t.run((ctx) => ctx.db.query("approvals").collect())).toHaveLength(1);
    expect(await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect())).toEqual([]);
    const evidence = await s.t.run((ctx) => ctx.db.query("evidence").collect());
    expect(evidence.find((row) => row.claimKey === "price")).toMatchObject({ basis: "firstParty" });
    expect(evidence.find((row) => row.claimKey === "fit")).toMatchObject({ basis: "inferred" });
    const latest = await s.owner.query(api.proposals.forReview, { workspaceId: s.workspaceId, reviewId: s.reviewId });
    expect(latest).toMatchObject({ canRequest: true, blocked: null, latest: { id: out.proposalId, state: "ready" } });
  });

  it("revises once, and a proposal that still fails is marked as needing review", async () => {
    const inputs = script(() => ({ ...good(), intro: "We can do it for $3,000 a month." }));
    const s = await setup();
    const out = await runProposal(s);
    expect(out.status).toBe("completed");
    expect(inputs.map((row) => row.split("\n")[0])).toEqual(["Write the proposal for this lead.", "Revise the proposal so it passes these failed checks, and change nothing else that passed."]);
    const shown = await s.owner.query(api.proposals.proposal, { workspaceId: s.workspaceId, proposalId: out.proposalId });
    expect(shown.state).toBe("needsReview");
    expect((await s.t.run((ctx) => ctx.db.query("assets").collect()))[0]).toMatchObject({ status: "needsReview", currentVersion: 2 });
  });

  it("refuses a review that did not pass, an Offer folder without a price, a moved budget, and a Viewer", async () => {
    script(() => good());
    const failed = await setup({ passed: false });
    const { maxCredits } = await failed.owner.query(api.proposals.quote, { workspaceId: failed.workspaceId });
    await expect(failed.owner.mutation(api.proposals.request, { workspaceId: failed.workspaceId, reviewId: failed.reviewId, confirmedCredits: maxCredits })).rejects.toThrow(/passed its checks/);
    const bare = await setup({ offer: false });
    await expect(bare.owner.mutation(api.proposals.request, { workspaceId: bare.workspaceId, reviewId: bare.reviewId, confirmedCredits: maxCredits })).rejects.toThrow(/package and the price/);
    expect((await bare.owner.query(api.proposals.forReview, { workspaceId: bare.workspaceId, reviewId: bare.reviewId })).blocked).toMatch(/package and the price/);
    const s = await setup();
    await expect(s.owner.mutation(api.proposals.request, { workspaceId: s.workspaceId, reviewId: s.reviewId, confirmedCredits: maxCredits + 1 })).rejects.toThrow(/budget changed/);
    await expect(s.viewer.mutation(api.proposals.request, { workspaceId: s.workspaceId, reviewId: s.reviewId, confirmedCredits: maxCredits })).rejects.toThrow();
    expect((await s.viewer.query(api.proposals.forReview, { workspaceId: s.workspaceId, reviewId: s.reviewId })).canRequest).toBe(false);
  });
});
