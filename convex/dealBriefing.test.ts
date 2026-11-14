/**
 * @vitest-environment edge-runtime
 *
 * Deal Briefing (Dealmaker, "pre-call brief"): what code knows about a lead from the CRM, their linked calls,
 * the setter's hand-off and the Playbook; the checks; and whole runs with a scripted model: a brief with
 * readiness established only by quotes found in their source, a revision after a failed check, a code-only
 * brief with no model call when nothing is known, and a brief without a CRM from what a person typed.
 * docs/rebuild/dealmaker.md, sections 0.8 and 4.3.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ScriptedModel } from "./lib/toolRouter";
import { moneyIn, runChecks } from "./skills/dealBriefing/checks";
import { computeBrief, type BriefInput } from "./skills/dealBriefing/compute";
import { readinessOf } from "./skills/dealBriefing/render";
import type { Brief, BriefRecord } from "./skills/dealBriefing/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";

const HANDOFF = "Booked from the webinar. Jordan said the partner signs off on anything over $2,000.";

const CALL_TEXT = [
  "Closer: What made you book this call?",
  "Jordan: We need more booked calls every month, the pipeline is thin.",
  "Closer: Who else is involved in the decision?",
  "Jordan: I have to check with my business partner before we sign anything.",
  "Jordan: Our budget is around $3,000 a month.",
  "Closer: I'll send the case study on Friday.",
].join("\n");

function input(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    briefingId: "b1",
    projectId: "proj1",
    leadName: "Jordan Lee",
    crm: { label: "HighLevel", accountName: "Aster Coaching", currency: "USD", timezone: null },
    contact: { ref: "c1", name: "Jordan Lee", email: "jordan@example.com", phone: null, source: "Facebook ads", tags: [], addedAt: NOW - 12 * DAY, lastActivityAt: NOW - 2 * DAY },
    deal: { ref: "d1", pipelineRef: "pipe1", stageRef: "stProposal", status: "open", value: 4500, source: "Facebook ads", contactRef: "c1", ownerRef: null, createdAt: NOW - 12 * DAY, updatedAt: NOW - 2 * DAY, stageChangedAt: NOW - 5 * DAY, statusChangedAt: null },
    stage: { pipeline: "Sales calls", stage: "Proposal sent" },
    call: { ref: "a1", startsAt: NOW + DAY, status: "confirmed", contactRef: "c1", dealRef: null },
    activities: [
      { ref: "x1", kind: "sms", direction: "outbound", at: NOW - 2 * DAY, contactRef: "c1", dealRef: null, status: null, seconds: null, fromStageRef: null, toStageRef: null },
      { ref: "x2", kind: "call", direction: "outbound", at: NOW - 6 * DAY, contactRef: "c1", dealRef: null, status: "completed", seconds: 1500, fromStageRef: null, toStageRef: null },
      { ref: "x3", kind: "stage_change", direction: null, at: NOW - 5 * DAY, contactRef: "c1", dealRef: "d1", status: null, seconds: null, fromStageRef: "stBooked", toStageRef: "stProposal" },
    ],
    appointments: [
      { ref: "a0", startsAt: NOW - 6 * DAY, status: "showed", contactRef: "c1", dealRef: null },
      { ref: "a1", startsAt: NOW + DAY, status: "confirmed", contactRef: "c1", dealRef: null },
    ],
    transcripts: [{ id: "t1", title: "Discovery call", callDate: "2026-11-08", text: CALL_TEXT }],
    handoff: { text: HANDOFF, by: "Sam Setter" },
    about: null,
    playbook: [
      { id: "i2", folder: "objections", kind: "objection", title: "I need to talk to my partner", body: "", basis: "hypothesis" },
      { id: "i1", folder: "offer", kind: "package", title: "Growth retainer", body: "$3,000 a month: ads, booking and follow-up.", basis: "firstParty" },
      { id: "i3", folder: "closing", kind: "voice", title: "Sign off as Dana", body: "", basis: "firstParty" },
    ],
    now: NOW,
    ...overrides,
  };
}

/** A brief that passes every check, written from what the record holds. */
function goodBrief(record: BriefRecord): Brief {
  const pkg = record.playbook.find((row) => row.kind === "package")!;
  return {
    summary: "Jordan had a discovery call and is waiting on a proposal. Who signs is not settled.",
    readiness: [
      { field: "need", finding: "More booked calls each month", quote: "We need more booked calls every month", sourceId: "c1" },
      { field: "budget", finding: "Around $3,000 a month", quote: "Our budget is around $3,000 a month.", sourceId: "c1" },
      { field: "decider", finding: "A business partner signs off", quote: "the partner signs off on anything over $2,000", sourceId: "h1" },
    ],
    commitments: [{ owner: "us", what: "Send the case study", due: "Friday", quote: "I'll send the case study on Friday.", sourceId: "c1" }],
    cover: [
      { point: "Ask when the partner can join a call", refs: ["c1", "h1"] },
      { point: "Walk through the Growth retainer", refs: [pkg.id] },
    ],
    objections: [{ objection: "Needs the partner's agreement", quote: "I have to check with my business partner", sourceId: "c1" }],
    offerFit: { itemId: pkg.id, why: "It covers the booked calls Jordan asked for." },
    disagreements: [],
    openingQuestion: "What has changed since we last spoke?",
  };
}

describe("what a brief knows (code)", () => {
  it("reads who and so far from the CRM, the lead's calls, the hand-off and the Playbook, offer first", () => {
    const record = computeBrief(input());
    const fact = (label: string) => record.facts.find((row) => row.label === label);
    expect(fact("Booked call")?.display).toMatch(/^Sun, Nov 15, 3:00 PM UTC \(confirmed\)$/);
    expect(fact("Deal stage")?.display).toBe("Proposal sent (Sales calls)");
    expect(fact("Deal value")?.display).toBe("$4,500");
    expect(fact("Days since the lead was added")).toMatchObject({ display: "12", kind: "measured" });
    expect(fact("Touches recorded")?.display).toBe("1 call, 1 text, 0 emails");
    expect(fact("Last touch")?.display).toBe("a text (outbound) on Nov 12, 2026");
    expect(fact("Other booked calls")?.display).toBe("1 call, 1 showed");
    expect(record.sources.map((row) => [row.id, row.type])).toEqual([
      ["c1", "call"],
      ["h1", "handoff"],
    ]);
    // The voice item is not something a brief draws on; the package comes before the objection.
    expect(record.playbook.map((row) => [row.id, row.kind])).toEqual([
      ["p1", "package"],
      ["p2", "objection"],
    ]);
    expect(record).toMatchObject({ firstCall: false, needsModel: true, missing: [] });
  });

  it("calls no model when nothing is known beyond the booking, and says what it could not read", () => {
    const record = computeBrief(input({ transcripts: [], handoff: null, playbook: [] }));
    expect(record).toMatchObject({ firstCall: true, needsModel: false });
    expect(record.missing).toEqual(["No earlier call with this lead is linked and shared with Dealmaker, so nothing is quoted from one.", "The Playbook's Offer folder is empty, so the brief names no package."]);
    const noCrm = computeBrief(input({ crm: null, contact: null, deal: null, stage: null, call: null, activities: [], appointments: [], transcripts: [], handoff: null, about: { text: "Runs a 3-person agency.", by: "Dana" } }));
    expect(noCrm.facts).toEqual([]);
    expect(noCrm.sources.map((row) => row.id)).toEqual(["n1"]);
    expect(noCrm.missing[0]).toMatch(/^Not enough data: no CRM is connected here/);
  });
});

describe("pre-call brief checks (code)", () => {
  const record = computeBrief(input());

  it("passes a brief grounded in what was read, and establishes readiness only from quotes found", () => {
    const brief = goodBrief(record);
    expect(runChecks(brief, record)).toMatchObject({ passed: true });
    const readiness = readinessOf(brief, record);
    expect(readiness.map((row) => [row.field, row.established, row.kind])).toEqual([
      ["need", true, "buyer"],
      ["budget", true, "buyer"],
      ["decider", true, "rep"],
      ["timing", false, null],
      ["fit", false, null],
    ]);
    // A finding whose quote is not in its source establishes nothing.
    const made = readinessOf({ ...brief, readiness: [{ field: "timing", finding: "This quarter", quote: "we want to start this quarter", sourceId: "c1" }] }, record);
    expect(made.find((row) => row.field === "timing")?.established).toBe(false);
  });

  it("fails a brief that misquotes, invents an objection or a package, prices, guesses, pressures, or skips the opening", () => {
    const good = goodBrief(record);
    const fail = (brief: Brief) => runChecks(brief, record).results.filter((row) => !row.passed).map((row) => row.id);
    expect(fail({ ...good, commitments: [{ ...good.commitments[0], quote: "I'll send the proposal tonight." }] })).toEqual([1]);
    expect(fail({ ...good, objections: [{ objection: "Too expensive", quote: "", sourceId: "p1" }] })).toEqual([2]);
    expect(fail({ ...good, offerFit: { itemId: "p2", why: "x" } })).toEqual([3]);
    expect(fail({ ...good, summary: "Offer the retainer at $2,500 to close this week." })).toEqual([4]);
    expect(fail({ ...good, summary: "Jordan is probably in his 40s with kids." })).toEqual([5]);
    expect(fail({ ...good, summary: "Tell Jordan there are only 2 spots left." })).toEqual([6]);
    expect(fail({ ...good, summary: "This retainer is guaranteed to double booked calls." })).toEqual([6]);
    expect(fail({ ...good, openingQuestion: "Start with the price." })).toEqual([7]);
    expect(fail({ ...good, cover: [{ point: "Talk about the weather", refs: ["zz"] }] })).toEqual([7]);
    expect(runChecks(null, record).passed).toBe(false);
  });

  it("reads money as written", () => {
    expect(moneyIn("Around $3,000 a month, or 2.5k USD, or £300")).toEqual([3000, 2500, 300]);
    expect(moneyIn("3 calls and 12 days")).toEqual([]);
  });
});

// ---------- Whole runs ----------

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

/** A scripted model that answers from the ids the brief was given. `guessFirst` fails the first draft once. */
function script(options: { guessFirst?: boolean } = {}) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const text = String(params.messages[0].content);
    inputs.push(text);
    const revise = text.startsWith("Revise the pre-call brief");
    if (!text.startsWith("Brief the closer") && !revise) throw new Error(`unscripted call: ${text.slice(0, 40)}`);
    const record = computeBrief(input());
    const brief = goodBrief(record);
    return { text: JSON.stringify(options.guessFirst && !revise ? { ...brief, summary: "Jordan is married and in a hurry." } : brief) };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

async function setup(options: { crm?: boolean; history?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  // Dealmaker is planned in the catalog; these runs exercise the skill as it will run once it is live.
  await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", AGENT)).unique())!;
    await ctx.db.patch(agent._id, { status: "live" });
    for (const workKind of ["classify", "research", "write", "summarize"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  const fixture = input();
  if (options.crm !== false) {
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", {
        workspaceId,
        provider: "highlevel",
        status: "connected",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: NOW + DAY,
        scopes: [],
        accountId: "loc1",
        accountName: "Aster Coaching",
        currency: "USD",
        connectedBy: "dana",
        connectedAt: NOW - 30 * DAY,
        lastSyncAt: NOW - HOUR,
        callsOk: 0,
        callsFailed: 0,
      });
      const base = { workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "pipe1", name: "Sales calls", stages: [{ id: "stBooked", name: "Call booked", position: 0 }, { id: "stProposal", name: "Proposal sent", position: 1 }] });
      const deal = fixture.deal!;
      await ctx.db.insert("crmDeals", { ...base, externalId: deal.ref, pipelineId: deal.pipelineRef, stageId: deal.stageRef, status: deal.status, value: deal.value, source: "Facebook ads", contactId: "c1", createdAt: deal.createdAt!, updatedAt: deal.updatedAt!, lastStageChangeAt: deal.stageChangedAt! });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", email: "jordan@example.com", source: "Facebook ads", tags: [], addedAt: NOW - 12 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c2", name: "Riley Park", tags: [], addedAt: NOW - DAY });
      for (const row of fixture.activities) {
        await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: row.ref, kind: row.kind as "call", direction: row.direction ?? undefined, at: row.at, contactId: "c1", dealId: row.dealRef ?? undefined, status: row.status ?? undefined, fromStage: row.fromStageRef ?? undefined, toStage: row.toStageRef ?? undefined });
      }
      for (const row of fixture.appointments) await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: row.ref, kind: "appointment", at: row.startsAt, contactId: "c1", status: row.status });
      await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a9", kind: "appointment", at: NOW + 2 * DAY, contactId: "c2", status: "booked" });
    });
  }
  if (options.history !== false) {
    await t.run(async (ctx) => {
      await ctx.db.insert("callTranscripts", { workspaceId, title: "Discovery call", tool: "Fathom", callDate: "2026-11-08", text: CALL_TEXT, words: 60, addedBy: "dana", createdAt: NOW - 6 * DAY, consentConfirmedAt: NOW - 6 * DAY, agents: [AGENT], crmContactRef: "c1", crmDealRef: "d1" });
      // Another lead's call, and a call not shared with Dealmaker: neither reaches this brief.
      await ctx.db.insert("callTranscripts", { workspaceId, title: "Riley intro", tool: "Fathom", text: "Riley: we are fine for now.", words: 5, addedBy: "dana", createdAt: NOW - DAY, consentConfirmedAt: NOW - DAY, agents: [AGENT], crmContactRef: "c2" });
      await ctx.db.insert("callTranscripts", { workspaceId, title: "Strategist only", tool: "Fathom", text: "Jordan: private.", words: 2, addedBy: "dana", createdAt: NOW - DAY, consentConfirmedAt: NOW - DAY, crmContactRef: "c1" });
      for (const row of fixture.playbook) {
        await ctx.db.insert("playbookItems", { workspaceId, folder: row.folder as "offer", kind: row.kind as "package", title: row.title, body: row.body, source: { type: row.basis === "hypothesis" ? "starter" : "person" }, basis: row.basis as "firstParty", status: "active", createdBy: "dana", createdAt: 1, updatedAt: 1 });
      }
    });
  }
  return { t, owner, workspaceId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function runBrief(s: Setup, args: { contactRef?: string; dealRef?: string; appointmentRef?: string; leadName?: string; about?: string; handoff?: string }) {
  const { maxCredits } = await s.owner.query(api.dealBriefings.quote, { workspaceId: s.workspaceId });
  const { briefingId, runId } = await s.owner.mutation(api.dealBriefings.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits, ...args });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  const briefing = await s.t.run((ctx) => ctx.db.get(briefingId as Id<"dealBriefings">));
  const asset = briefing?.assetId ? await s.t.run((ctx) => ctx.db.get(briefing.assetId!)) : null;
  const versions = await s.t.run((ctx) => ctx.db.query("assetVersions").collect());
  const evidence = await s.t.run((ctx) => ctx.db.query("evidence").collect());
  const sources = await s.t.run((ctx) => ctx.db.query("sourceRefs").collect());
  return { status, briefing, asset, versions, evidence, sources };
}

describe("a pre-call brief, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("reads the lead through the CRM layer and their own shared calls, writes once, and saves a ready brief", async () => {
    const inputs = script();
    const s = await setup();
    const out = await runBrief(s, { contactRef: "c1", appointmentRef: "a1", handoff: HANDOFF });
    expect(out.status).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED CONTENT");
    expect(inputs[0]).toContain("Hand-off from dana (dana's own account)");
    // Only this lead's call shared with Dealmaker is read.
    expect(inputs[0]).toContain("We need more booked calls every month");
    expect(inputs[0]).not.toContain("Riley");
    expect(inputs[0]).not.toContain("private.");
    expect(out.briefing).toMatchObject({ status: "ready", leadName: "Jordan Lee", startsAt: NOW + DAY, writtenBy: "dana" });
    expect(out.asset).toMatchObject({ kind: "preCallBrief", status: "draft", currentVersion: 1 });
    expect(out.asset?.title).toMatch(/^Pre-call brief: Jordan Lee, Sun, Nov 15/);
    const body = out.versions[0].body;
    expect(body).toContain("| Need | More booked calls each month | Buyer's words (call: Discovery call (2026-11-08))");
    expect(body).toContain("| Who decides | A business partner signs off | Rep's account (Hand-off from dana)");
    expect(body).toContain("| Timing | Unresolved | Not enough data |");
    expect(body).toContain("**Growth retainer.**");
    // The CRM, the call and the hand-off are each a Your data source; facts cite the CRM.
    expect(out.sources.map((row) => row.title).sort()).toEqual(["Hand-off from dana", "Your CRM: Aster Coaching (HighLevel)", "Your call: Discovery call (2026-11-08)"]);
    const crm = out.sources.find((row) => row.title.startsWith("Your CRM"))!;
    expect(out.evidence.find((row) => row.claimKey === "fact-F1")).toMatchObject({ basis: "firstParty", sourceRefIds: [crm._id] });
    expect(out.evidence.find((row) => row.claimKey === "ready-timing")).toMatchObject({ basis: "insufficient" });
    expect(out.evidence.find((row) => row.claimKey === "opening")).toMatchObject({ basis: "inferred" });
    // A brief proposes nothing in the CRM and contacts nobody.
    expect(await s.t.run((ctx) => ctx.db.query("crmActions").collect())).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("approvals").collect())).toEqual([]);
  });

  it("revises once when the first draft guesses about the lead, and keeps both versions", async () => {
    const inputs = script({ guessFirst: true });
    const out = await runBrief(await setup(), { contactRef: "c1", appointmentRef: "a1", handoff: HANDOFF });
    expect(inputs.map((row) => row.split("\n")[0])).toEqual(["Brief the closer before their call with this lead.", "Revise the pre-call brief so it passes these failed checks, and change nothing else that passed."]);
    expect(inputs[1]).toContain("Nothing guessed about the lead as a person");
    expect(out.asset).toMatchObject({ status: "draft", currentVersion: 2 });
  });

  it("writes who and so far in code, with no model call, when nothing else is known", async () => {
    const inputs = script();
    const out = await runBrief(await setup({ history: false }), { contactRef: "c1" });
    expect(inputs).toEqual([]);
    expect(out.status).toBe("completed");
    expect(out.asset).toMatchObject({ status: "draft" });
    expect(out.versions[0].body).toContain("## First call");
    expect(out.versions[0].body).toContain("Deal stage: **Proposal sent (Sales calls)**");
  });

  it("works without a CRM from what a person typed, kept as their account", async () => {
    script();
    const s = await setup({ crm: false, history: false });
    await expect(s.owner.mutation(api.dealBriefings.request, { workspaceId: s.workspaceId, confirmedCredits: (await s.owner.query(api.dealBriefings.quote, { workspaceId: s.workspaceId })).maxCredits, leadName: "Jordan" })).rejects.toThrow(/No CRM is connected here/);
    const out = await runBrief(s, { leadName: "Jordan Lee", about: "Runs a three-person agency and wants more booked calls." });
    expect(out.briefing).toMatchObject({ status: "ready", about: "Runs a three-person agency and wants more booked calls.", writtenBy: "dana" });
    expect(out.sources.map((row) => row.title)).toEqual(["Note from dana"]);
  });

  it("refuses a lead Vistrial did not read, another lead's call or deal, a moved budget, and a Viewer", async () => {
    script();
    const s = await setup();
    const { maxCredits } = await s.owner.query(api.dealBriefings.quote, { workspaceId: s.workspaceId });
    const ask = (args: Record<string, string | number>) => s.owner.mutation(api.dealBriefings.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits, ...args });
    await expect(ask({})).rejects.toThrow("Pick the lead from your CRM.");
    await expect(ask({ contactRef: "nobody" })).rejects.toThrow(/has not read that lead/);
    await expect(ask({ contactRef: "c2", dealRef: "d1" })).rejects.toThrow("That deal is not this lead's.");
    await expect(ask({ contactRef: "c2", appointmentRef: "a1" })).rejects.toThrow(/not this lead's/);
    await expect(ask({ contactRef: "c1", confirmedCredits: maxCredits + 1 })).rejects.toThrow(/budget changed/);
    const invite = await s.owner.mutation(api.workspace.invite, { workspaceId: s.workspaceId, email: "vera@example.com", role: "viewer" });
    const viewer = s.t.withIdentity(person("vera"));
    await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
    await expect(viewer.mutation(api.dealBriefings.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits, contactRef: "c1" })).rejects.toThrow();
    expect(await s.t.run((ctx) => ctx.db.query("dealBriefings").collect())).toEqual([]);
  });
});
