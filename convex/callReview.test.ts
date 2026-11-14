/**
 * @vitest-environment edge-runtime
 *
 * Conversation Intelligence (Dealmaker, "call review"): talk time counted in code, the checks, and whole runs
 * with a scripted model: a review that files the buyer's words as readiness, the promises as commitments, the
 * recap as a Comms draft and the stage move as a CRM step; a review that fails its checks files nothing; and
 * coaching notes reach the Owner only. docs/rebuild/dealmaker.md, 0.8 and 4.2.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ScriptedModel } from "./lib/toolRouter";
import { runChecks } from "./skills/callReview/checks";
import { computeReview, talkOf, type ReviewInput } from "./skills/callReview/compute";
import type { Review } from "./skills/callReview/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";

const CALL = [
  "Milo: Thanks for joining. What made you book the call?",
  "Jordan: We need more booked calls every month, the pipeline is thin.",
  "Milo: What would that be worth to you?",
  "Jordan: Our budget is around $3,000 a month.",
  "Jordan: Honestly it feels expensive for where we are.",
  "Milo: That's fair. Most of the cost is the follow-up we run for you, so you are not paying for ads alone.",
  "Jordan: I have to check with my business partner before we sign anything.",
  "Milo: I'll send the proposal and the clinic case study by Friday.",
  "Jordan: Great, I'll talk to Sam on Monday.",
].join("\n");

function input(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    reviewId: "r1",
    projectId: "p1",
    leadName: "Jordan Lee",
    callDate: "2026-11-13",
    crm: { label: "HighLevel", accountName: "Aster Coaching", currency: "USD" },
    deal: { ref: "d1", pipelineRef: "pipe1", stageRef: "stBooked", status: "open", value: 4500 },
    stages: [
      { ref: "stBooked", name: "Call booked" },
      { ref: "stProposal", name: "Proposal sent" },
    ],
    contactRef: "c1",
    transcript: { title: "Discovery call (2026-11-13)", text: CALL },
    notes: null,
    playbook: [
      { id: "i1", folder: "prospect", kind: "scriptStep", stage: "discover", title: "Ask what it is worth to them", body: "", basis: "firstParty" },
      { id: "i2", folder: "closing", kind: "scriptStep", stage: "close", title: "Ask for the decision", body: "", basis: "firstParty" },
      { id: "i3", folder: "offer", kind: "package", stage: null, title: "Growth retainer", body: "$3,000 a month", basis: "firstParty" },
    ],
    ...overrides,
  };
}

function goodReview(): Review {
  return {
    outcome: "Jordan wants a proposal and needs a partner's sign-off.",
    nextStep: "Send the proposal and case study by Friday.",
    fit: [
      { field: "need", finding: "More booked calls each month", quote: "We need more booked calls every month", sourceId: "t1" },
      { field: "budget", finding: "Around $3,000 a month", quote: "Our budget is around $3,000 a month.", sourceId: "t1" },
      { field: "decider", finding: "A business partner signs off", quote: "I have to check with my business partner", sourceId: "t1" },
    ],
    objections: [{ objection: "Price feels high", quote: "it feels expensive for where we are", sourceId: "t1", answered: true, answerQuote: "Most of the cost is the follow-up we run for you" }],
    commitments: [
      { owner: "us", what: "Send the proposal and the clinic case study", due: "2026-11-20", quote: "I'll send the proposal and the clinic case study by Friday.", sourceId: "t1" },
      { owner: "lead", what: "Talk to the partner", due: "", quote: "I'll talk to Sam on Monday.", sourceId: "t1" },
    ],
    coverage: [{ itemId: "p1", quote: "What would that be worth to you?" }],
    stage: { stageRef: "stProposal", why: "A proposal was asked for." },
    decision: { status: "", quote: "" },
    coaching: ["The decision was not asked for once the price was answered."],
    recap: { subject: "Thanks for the call, Jordan", body: "Thanks for your time today. You want more booked calls each month. I will send the proposal and the clinic case study by Friday, and you will talk to Sam on Monday." },
  };
}

describe("what a review knows (code)", () => {
  it("counts each speaker's words and questions from the transcript's own labels", () => {
    expect(talkOf(CALL)).toEqual([
      { name: "Milo", words: 48, share: 52, questions: 2 },
      { name: "Jordan", words: 45, share: 48, questions: 0 },
    ]);
    expect(talkOf("just some words without speakers")).toBeNull();
    const record = computeReview(input());
    expect(record.sources.map((row) => row.id)).toEqual(["t1"]);
    expect(record.playbook.map((row) => [row.id, row.kind])).toEqual([
      ["p1", "scriptStep"],
      ["p2", "scriptStep"],
      ["p3", "package"],
    ]);
  });
});

describe("call review checks (code)", () => {
  const record = computeReview(input());
  const fail = (review: Review) => runChecks(review, record).results.filter((row) => !row.passed).map((row) => row.id);

  it("passes a review grounded in the call", () => {
    expect(runChecks(goodReview(), record)).toMatchObject({ passed: true });
  });

  it("fails a misquote, a bare commitment, a stage elsewhere, a decision without a yes, a bad date, a pushy recap and a verdict", () => {
    const good = goodReview();
    expect(fail({ ...good, fit: [{ ...good.fit[0], quote: "We want to double revenue" }] })).toEqual([1]);
    expect(fail({ ...good, commitments: [{ ...good.commitments[0], quote: "" }] })).toEqual([2]);
    expect(fail({ ...good, stage: { stageRef: "stElsewhere", why: "" } })).toEqual([3]);
    expect(fail({ ...good, decision: { status: "won", quote: "Sounds great, let's do it" } })).toEqual([4]);
    expect(fail({ ...good, commitments: [{ ...good.commitments[0], due: "2026-11-01" }] })).toEqual([5]);
    expect(fail({ ...good, recap: { ...good.recap, body: "We can do it for $2,000 if you sign today." } })).toEqual([6]);
    expect(fail({ ...good, recap: { ...good.recap, body: "This will double your booked calls, guaranteed." } })).toEqual([6]);
    expect(fail({ ...good, coaching: ["Milo is lazy on follow-up."] })).toEqual([7]);
    expect(runChecks(null, record).passed).toBe(false);
  });
});

// ---------- Whole runs ----------

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

function script(answer: (revise: boolean) => Review) {
  const inputs: string[] = [];
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = (params) => {
    const text = String(params.messages[0].content);
    inputs.push(text);
    const revise = text.startsWith("Revise the call review");
    if (!revise && !text.startsWith("Review this sales call")) throw new Error(`unscripted call: ${text.slice(0, 40)}`);
    return { text: JSON.stringify(answer(revise)) };
  };
  return inputs;
}

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", AGENT)).unique())!;
    await ctx.db.patch(agent._id, { status: "live" });
    for (const workKind of ["classify", "research", "write", "summarize"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  const transcriptId = await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "t", refreshToken: "r", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc1", accountName: "Aster Coaching", currency: "USD", connectedBy: "dana", connectedAt: NOW - DAY, callsOk: 0, callsFailed: 0 });
    const base = { workspaceId, connectionId, seenAt: NOW };
    await ctx.db.insert("crmPipelines", { ...base, externalId: "pipe1", name: "Sales calls", stages: [{ id: "stBooked", name: "Call booked", position: 0 }, { id: "stProposal", name: "Proposal sent", position: 1 }] });
    await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", tags: [] });
    await ctx.db.insert("crmDeals", { ...base, externalId: "d1", pipelineId: "pipe1", stageId: "stBooked", status: "open", value: 4500, contactId: "c1" });
    for (const row of input().playbook) {
      await ctx.db.insert("playbookItems", { workspaceId, folder: row.folder as "prospect", kind: row.kind as "scriptStep", ...(row.stage ? { stage: row.stage as "discover" } : {}), title: row.title, body: row.body, source: { type: "person" }, basis: "firstParty", status: "active", createdBy: "dana", createdAt: 1, updatedAt: 1 });
    }
    await ctx.db.insert("callTranscripts", { workspaceId, title: "Strategist only", tool: "Fathom", text: "Jordan: private", words: 2, addedBy: "dana", createdAt: NOW, consentConfirmedAt: NOW, crmContactRef: "c1" });
    return ctx.db.insert("callTranscripts", { workspaceId, title: "Discovery call", tool: "Fathom", callDate: "2026-11-13", text: CALL, words: 90, addedBy: "dana", createdAt: NOW - DAY, consentConfirmedAt: NOW - DAY, agents: [AGENT], crmContactRef: "c1", crmDealRef: "d1" });
  });
  return { t, owner, workspaceId, transcriptId };
}

async function runReview(s: Awaited<ReturnType<typeof setup>>, args: { transcriptId?: Id<"callTranscripts">; callNoteId?: Id<"callNotes"> }) {
  const { maxCredits } = await s.owner.query(api.callReviews.quote, { workspaceId: s.workspaceId });
  const { reviewId, runId } = await s.owner.mutation(api.callReviews.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits, ...args });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  return { status, reviewId };
}

describe("a call review, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("files the buyer's words as readiness, the promises, the recap as a Comms draft and the stage move as a CRM step", async () => {
    const inputs = script(() => goodReview());
    const s = await setup();
    const out = await runReview(s, { transcriptId: s.transcriptId });
    expect(out.status).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED CONTENT");
    expect(inputs[0]).not.toContain("private");
    const shown = await s.owner.query(api.callReviews.review, { workspaceId: s.workspaceId, reviewId: out.reviewId });
    expect(shown.state).toBe("ready");
    expect(shown.view?.fit.map((row) => [row.label, row.said, row.kind ?? null])).toEqual([
      ["Need", true, "Buyer's words"],
      ["Budget", true, "Buyer's words"],
      ["Who decides", true, "Buyer's words"],
      ["Timing", false, null],
      ["Fit with the offer", false, null],
    ]);
    expect(shown.view?.objections[0]).toMatchObject({ answered: true });
    expect(shown.view?.coverage).toEqual([
      { title: "Ask what it is worth to them", covered: true, quote: "What would that be worth to you?" },
      { title: "Ask for the decision", covered: false, quote: "" },
    ]);
    expect(shown.view?.talk?.map((row) => row.name)).toEqual(["Milo", "Jordan"]);
    expect(shown.coaching).toEqual(["The decision was not asked for once the price was answered."]);

    const facts = await s.t.run((ctx) => ctx.db.query("dealFacts").collect());
    expect(facts.map((row) => [row.field, row.kind, row.sourceRef])).toEqual([
      ["need", "buyer", `callReview:${out.reviewId}`],
      ["budget", "buyer", `callReview:${out.reviewId}`],
      ["decider", "buyer", `callReview:${out.reviewId}`],
    ]);
    const commitments = await s.t.run((ctx) => ctx.db.query("dealCommitments").collect());
    expect(commitments.map((row) => [row.text, row.owner === "lead" ? "lead" : "member", row.due ?? null])).toEqual([
      ["Send the proposal and the clinic case study", "member", Date.parse("2026-11-20T17:00:00Z")],
      ["Talk to the partner", "lead", null],
    ]);
    // The recap waits in Comms for a person; acting is off, so the stage move is handed back as a step to do.
    const drafts = await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ contactRef: "c1", dealRef: "d1", kind: "followUp", channel: "email", status: "draft", createdBy: "agent", trigger: "callReview" });
    expect(shown.view?.updates).toEqual([{ words: "Move the deal to Proposal sent", state: "doItYourself", detail: expect.stringContaining("Proposal sent"), label: "Inference" }]);
    expect(await s.t.run((ctx) => ctx.db.query("crmActions").collect())).toEqual([]);
    // The review itself joins no approvals queue.
    expect(await s.t.run((ctx) => ctx.db.query("approvals").collect())).toEqual([]);
  });

  it("files nothing when the review still fails its checks after the revision", async () => {
    const bad = { ...goodReview(), fit: [{ field: "need" as const, finding: "x", quote: "words never said", sourceId: "t1" }] };
    const inputs = script(() => bad);
    const s = await setup();
    const out = await runReview(s, { transcriptId: s.transcriptId });
    expect(inputs).toHaveLength(2);
    const shown = await s.owner.query(api.callReviews.review, { workspaceId: s.workspaceId, reviewId: out.reviewId });
    expect(shown.state).toBe("needsReview");
    expect(await s.t.run((ctx) => ctx.db.query("dealFacts").collect())).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect())).toEqual([]);
  });

  it("reads the closer's notes as their account, and keeps coaching for the Owner", async () => {
    script(() => ({ ...goodReview(), fit: [{ field: "timing", finding: "January", quote: "start in January", sourceId: "n1" }], objections: [], commitments: [], coverage: [], stage: { stageRef: "", why: "" } }));
    const s = await setup();
    const callNoteId = await s.owner.mutation(api.callNotes.save, { workspaceId: s.workspaceId, contactRef: "c1", dealRef: "d1", outcome: "proposal", fit: [], objections: [] });
    await s.t.run((ctx) => ctx.db.patch(callNoteId, { memo: { status: "done", seconds: 30, transcript: "She wants to start in January." } }));
    const out = await runReview(s, { transcriptId: s.transcriptId, callNoteId });
    const shown = await s.owner.query(api.callReviews.review, { workspaceId: s.workspaceId, reviewId: out.reviewId });
    expect(shown.view?.fit.find((row) => row.label === "Timing")).toMatchObject({ said: true, kind: "Rep's account, dana" });
    const facts = await s.t.run((ctx) => ctx.db.query("dealFacts").collect());
    expect(facts.find((row) => row.sourceRef?.startsWith("callReview"))).toMatchObject({ field: "timing", kind: "rep", author: "dana" });
    const invite = await s.owner.mutation(api.workspace.invite, { workspaceId: s.workspaceId, email: "milo@example.com", role: "member" });
    const milo = s.t.withIdentity(person("milo"));
    await milo.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect((await milo.query(api.callReviews.review, { workspaceId: s.workspaceId, reviewId: out.reviewId })).coaching).toBeNull();
  });

  it("refuses nothing to review, and a call not shared with Dealmaker", async () => {
    script(() => goodReview());
    const s = await setup();
    const { maxCredits } = await s.owner.query(api.callReviews.quote, { workspaceId: s.workspaceId });
    await expect(s.owner.mutation(api.callReviews.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits })).rejects.toThrow(/Pick a call/);
    const hidden = await s.t.run(async (ctx) => (await ctx.db.query("callTranscripts").collect()).find((row) => row.title === "Strategist only")!._id);
    await expect(s.owner.mutation(api.callReviews.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits, transcriptId: hidden })).rejects.toThrow(/not shared with Dealmaker/);
  });
});
