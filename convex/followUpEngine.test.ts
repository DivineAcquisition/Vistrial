/**
 * @vitest-environment edge-runtime
 *
 * Follow-up Engine (build step 13b-2): the deals that need one next message are found in code from the
 * Pipeline board; one model step writes them; code drops a draft that names a price or invents urgency; what
 * passes lands in Comms as Dealmaker's own draft, with the kind its trigger set. Nothing is sent.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { ScriptedModel } from "./lib/toolRouter";
import { FOLLOW_UP_TEXT } from "./dealFollowUps";
import { checkWritten } from "./skills/followUpEngine/tools";
import type { ScanRecord } from "./skills/followUpEngine/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";

type Draft = { id: string; subject: string; body: string };

function script(drafts: (input: string) => Draft[]) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const text = String(params.messages[0].content);
    inputs.push(text);
    if (!text.startsWith("Write one message for each lead")) throw new Error(`unscripted call: ${text.slice(0, 40)}`);
    return { text: JSON.stringify({ drafts: drafts(text) }) };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

async function setup(options: { crm?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
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
  if (options.crm !== false) {
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", connectedBy: "nora", connectedAt: NOW - 30 * DAY, lastSyncAt: NOW, callsOk: 0, callsFailed: 0 });
      const base = { workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Call booked", position: 0 }] });
      const deal = (externalId: string, contactId: string) =>
        ctx.db.insert("crmDeals", { ...base, externalId, pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId, createdAt: NOW - 3 * DAY, updatedAt: NOW - DAY, lastStageChangeAt: NOW - 3 * DAY });
      await deal("opp1", "con1");
      await deal("opp2", "con2");
      await deal("opp3", "con3");
      await deal("opp4", "con4");
      await ctx.db.insert("crmContacts", { ...base, externalId: "con1", name: "Jordan Lee", phone: "+15555550101", tags: [], addedAt: NOW - 3 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "con2", name: "Sam Ray", email: "sam@example.com", tags: [], addedAt: NOW - 3 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "con3", name: "Ana Diaz", phone: "+15555550103", tags: [], addedAt: NOW - 3 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "con4", name: "Lee Park", phone: "+15555550104", tags: [], addedAt: NOW - 3 * DAY });
      // Jordan wrote last, so the reply is ours. Sam, Ana and Lee have no messages yet.
      await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "x1", kind: "sms", direction: "inbound", at: NOW - DAY, contactId: "con1" });
      // Ana already has a message waiting in Comms; Lee asked us to stop.
      await ctx.db.insert("dealmakerDrafts", { workspaceId, contactRef: "con3", dealRef: "opp3", kind: "followUp", channel: "sms", body: "Hi Ana.", why: "Written by a person.", trigger: "person", status: "draft", createdBy: "nora", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("dealmakerPauses", { workspaceId, contactRef: "con4", reason: "Said stop.", pausedBy: "nora", pausedAt: NOW - DAY });
    });
  }
  return { t, owner, workspaceId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function run(s: Setup) {
  const { maxCredits } = await s.owner.query(api.dealFollowUps.quote, { workspaceId: s.workspaceId });
  const { runId } = await s.owner.mutation(api.dealFollowUps.draft, { workspaceId: s.workspaceId, confirmedCredits: maxCredits });
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  const drafts = await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect());
  return { status, drafts: drafts.filter((row) => row.trigger !== "person") };
}

describe("the Follow-up Engine's checks", () => {
  const scanned: ScanRecord = {
    candidates: [
      { id: "d1", dealRef: "opp1", contactRef: "con1", firstName: "Jordan", trigger: "answer", channel: "sms", stage: "Call booked", context: [] },
      { id: "d2", dealRef: "opp2", contactRef: "con2", firstName: "Sam", trigger: "firstReply", channel: "email", stage: "Call booked", context: [] },
    ],
    voice: [],
    lessons: [],
    offer: [],
    proof: [],
    skipped: [],
  };

  it("drops a price, invented urgency, an email with no subject, a second draft for one deal, and a draft for no deal", () => {
    const checked = checkWritten(
      [
        { id: "d1", subject: "", body: "Happy to help, Jordan. What time suits you?" },
        { id: "d1", subject: "", body: "Another one." },
        { id: "d2", subject: "", body: "Hi Sam." },
        { id: "d2", subject: "Hello", body: "It is $3,000 a month." },
        { id: "d2", subject: "Hello", body: "Only 2 spots left, act now." },
        { id: "d9", subject: "", body: "Hi." },
      ],
      scanned,
    );
    expect(checked.map((row) => row.passed)).toEqual([true, false, false, false, false, false]);
    expect(checked.map((row) => row.why)).toEqual(["", "A second draft for the same deal.", "An email needs a subject.", "It names a price; Dealmaker never sets one.", "It invents urgency.", "It is for no deal that was found."]);
  });
});

describe("a round of follow-ups, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("drafts the reply that is ours and the first message, skips a lead with a message open and a paused lead, and drops a priced draft", async () => {
    const s = await setup();
    const inputs = script(() => [
      { id: "d1", subject: "", body: "Thanks Jordan, good question. Want to pick a time to talk it through?" },
      { id: "d2", subject: "Your call with Northlight", body: "Hi Sam, it is $3,000 a month." },
    ]);
    const result = await run(s);
    expect(result.status).toBe("completed");
    expect(inputs).toHaveLength(1);
    // Only Jordan and Sam reach the model; Ana has a message open and Lee is paused.
    expect(inputs[0]).toMatch(/Lead d1 \(text message\)/);
    expect(inputs[0]).toMatch(/Lead d2 \(email\)/);
    expect(inputs[0]).not.toMatch(/Lead d3/);
    expect(inputs[0]).not.toMatch(/Ana|Lee Park/);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({ contactRef: "con1", dealRef: "opp1", kind: "answer", channel: "sms", trigger: "answer", status: "draft" });
    expect(result.drafts[0].createdBy).not.toBe("nora");
    expect(result.drafts[0].editedBy).toBeUndefined();

    // The next round skips Jordan, whose draft is now open, and writes only Sam's.
    const second = script(() => [{ id: "d1", subject: "Your call with Northlight", body: "Hi Sam, thanks for reaching out. When suits you for a short call?" }]);
    const next = await run(s);
    expect(next.status).toBe("completed");
    expect(second[0]).toMatch(/Lead d1 \(email\)/);
    expect(second[0]).not.toMatch(/Lead d2/);
    expect(next.drafts.find((row) => row.contactRef === "con2")).toMatchObject({ kind: "firstMessage", channel: "email", title: "Your call with Northlight" });
  });

  it("calls no model when nothing is due, and refuses without a CRM", async () => {
    const s = await setup();
    // Every lead has a message open.
    await s.t.run(async (ctx) => {
      for (const contactRef of ["con1", "con2"]) await ctx.db.insert("dealmakerDrafts", { workspaceId: s.workspaceId, contactRef, kind: "followUp", channel: "sms", body: "Hi.", why: "x", trigger: "person", status: "draft", createdBy: "nora", createdAt: NOW, updatedAt: NOW });
    });
    const inputs = script(() => []);
    const result = await run(s);
    expect(result.status).toBe("completed");
    expect(inputs).toHaveLength(0);

    const bare = await setup({ crm: false });
    const { maxCredits } = await bare.owner.query(api.dealFollowUps.quote, { workspaceId: bare.workspaceId });
    await expect(bare.owner.mutation(api.dealFollowUps.draft, { workspaceId: bare.workspaceId, confirmedCredits: maxCredits })).rejects.toThrow(FOLLOW_UP_TEXT.noCrm);
  });
});
