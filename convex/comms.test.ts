/**
 * @vitest-environment edge-runtime
 *
 * Dealmaker's Comms (build step 13a): drafts in lanes, Dealmaker's own checks before a message is proposed,
 * and the approvals path carrying it from there.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_ALLOWED } from "./lib/errors";
import { STOP_WORDS, hasPrice } from "./lib/dealmaker/autonomy";
import { COMMS_TEXT, fileAgentDraft } from "./comms";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

async function setup(options: { messaging?: boolean } = { messaging: true }) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "vera@example.com", role: "viewer" });
  const viewer = t.withIdentity(person("vera"));
  await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
  await t.run(async (ctx) => {
    const now = Date.now();
    const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: now + DAY, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", timezone: "America/New_York", connectedBy: "nora", connectedAt: now, lastSyncAt: now, callsOk: 0, callsFailed: 0, actingEnabled: true, ...(options.messaging ? { messagingEnabled: true } : {}) });
    const base = { workspaceId, connectionId, seenAt: now };
    await ctx.db.insert("crmDeals", { ...base, externalId: "opp1", pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: "con1" });
    await ctx.db.insert("crmContacts", { ...base, externalId: "con1", name: "Jordan Lee", phone: "+15555550101", email: "jordan@example.com", tags: ["opted-in"], addedAt: now });
    await ctx.db.insert("crmContacts", { ...base, externalId: "con2", name: "Sam Ray", phone: "+15555550102", tags: [], addedAt: now });
  });
  return { t, owner, viewer, workspaceId };
}

const draft = { contactRef: "con1", dealRef: "opp1", kind: "reminder", channel: "sms" as const, body: "See you at 3pm today for our call." };

describe("Comms", () => {
  it("spots a price in a draft", () => {
    expect(hasPrice("It is $4,500 a month.")).toBe(true);
    expect(hasPrice("Our fee covers the setup.")).toBe(true);
    expect(hasPrice("See you at 3pm.")).toBe(false);
  });

  it("drafts, edits, and proposes through the approvals path, where the message waits for a person", async () => {
    const { t, owner, workspaceId } = await setup();
    const draftId = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft });
    await owner.mutation(api.comms.updateDraft, { workspaceId, draftId, channel: "sms", body: "See you at 3pm today. Reply here if the time no longer works." });
    let view = await owner.query(api.comms.view, { workspaceId });
    expect(view.lanes.find((row) => row.id === "drafted")!.items[0]).toMatchObject({ kindLabel: "Call reminders", body: "See you at 3pm today. Reply here if the time no longer works." });

    const result = await owner.mutation(api.comms.submitDraft, { workspaceId, draftId });
    // Nothing was ever sent to this lead, so the first message waits for a person.
    expect(result).toEqual({ outcome: "proposed", reason: STOP_WORDS.first });
    view = await owner.query(api.comms.view, { workspaceId });
    expect(view.lanes.find((row) => row.id === "waiting")!.items).toHaveLength(1);
    const actions = await t.run((ctx) => ctx.db.query("crmActions").collect());
    expect(actions[0]).toMatchObject({ kind: "send_sms", contactId: "con1", state: "proposed" });
    expect(await message(owner.mutation(api.comms.updateDraft, { workspaceId, draftId, channel: "sms", body: "x" }))).toBe(COMMS_TEXT.notEditable);
  });

  it("holds a message to a paused lead, or a lead without a consent tag, before it is ever proposed", async () => {
    const { t, owner, workspaceId } = await setup();
    await owner.mutation(api.playbookInterview.answerConsent, { workspaceId, tags: ["opted-in"], channels: ["sms"] });
    const noConsent = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft, contactRef: "con2" });
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: noConsent })).toEqual({ outcome: "held", reason: COMMS_TEXT.noConsent });

    await owner.mutation(api.dealmakerTeam.pauseLead, { workspaceId, contactRef: "con1", reason: "Said stop." });
    const paused = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft });
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: paused })).toEqual({ outcome: "held", reason: STOP_WORDS.paused });
    expect(await t.run((ctx) => ctx.db.query("crmActions").collect())).toHaveLength(0);
    const view = await owner.query(api.comms.view, { workspaceId });
    expect(view.lanes.find((row) => row.id === "held")!.items).toHaveLength(2);
  });

  it("keeps the draft and says what to do when messaging is off; Viewers cannot draft", async () => {
    const { owner, viewer, workspaceId } = await setup({ messaging: false });
    const draftId = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft });
    const result = await owner.mutation(api.comms.submitDraft, { workspaceId, draftId });
    expect(result.outcome).toBe("notProposed");
    const view = await owner.query(api.comms.view, { workspaceId });
    expect(view.lanes.find((row) => row.id === "drafted")!.items[0].note).toMatch(/Copy the text and send it/);
    expect(await message(viewer.mutation(api.comms.createDraft, { workspaceId, ...draft }))).toBe(NOT_ALLOWED);
  });

  it("stops an approved message to a lead who was paused after it was proposed", async () => {
    const { t, owner, workspaceId } = await setup();
    const draftId = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft });
    await owner.mutation(api.comms.submitDraft, { workspaceId, draftId });
    const action = (await t.run((ctx) => ctx.db.query("crmActions").first()))!;
    await t.run((ctx) => ctx.db.patch(action._id, { state: "approved" }));
    await owner.mutation(api.dealmakerTeam.pauseLead, { workspaceId, contactRef: "con1", reason: "Said stop." });
    expect(await t.mutation(internal.crmActions.claim, { actionId: action._id })).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(action._id)))?.resultCode).toBe("paused");
    const view = await owner.query(api.comms.view, { workspaceId });
    expect(view.lanes.find((row) => row.id === "failed")!.items[0].note).toBe("This lead is paused after they asked us to stop, so nothing was sent.");
  });

  it("lets the Owner's switch stand in for SEND only on Dealmaker's own untouched low-stakes drafts, and records which switch allowed it", async () => {
    const { t, owner, workspaceId } = await setup();
    // Jordan was messaged before, so this is not a first message.
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query("crmConnections").first())!;
      await ctx.db.insert("crmActions", { workspaceId, connectionId: connection._id, kind: "send_sms", contactId: "con1", body: "Earlier.", summary: "Earlier text", why: "Earlier.", state: "done", proposedBy: "agent", proposedAt: Date.now() - 3 * DAY, doneAt: Date.now() - 3 * DAY } as never);
    });
    await owner.mutation(api.dealmakerTeam.setAutonomy, { workspaceId, kind: "reminder", automatic: true });
    const agentReminder = () =>
      t.run((ctx) => fileAgentDraft(ctx, { workspaceId, contactRef: "con1", dealRef: "opp1", kind: "reminder", channel: "sms", body: "See you at 3pm today for our call.", why: "A call is booked for today.", trigger: "reminder" }));

    // Dealmaker's own reminder, untouched: the switch is the standing SEND.
    const untouched = await agentReminder();
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: untouched })).toEqual({ outcome: "sending", reason: STOP_WORDS.autonomous });
    const approved = (await t.run((ctx) => ctx.db.query("crmActions").collect())).find((row) => row.state === "approved")!;
    expect(approved.decidedBy).toBe("owner-switch:reminder");
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.some((row) => row.action === "crm.action.approvedBySwitch" && row.actorId === "owner-switch:reminder")).toBe(true);

    // A Member's own words labelled "reminder" wait for SEND, switch or not.
    const handWritten = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft, body: "Anything at all." });
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: handWritten })).toEqual({ outcome: "proposed", reason: STOP_WORDS.kind });

    // Dealmaker's reminder once a person edited it: a person's words, so SEND.
    const edited = await agentReminder();
    await owner.mutation(api.comms.updateDraft, { workspaceId, draftId: edited, channel: "sms", body: "See you at 3pm. Also, have you thought about upgrading?" });
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: edited })).toEqual({ outcome: "proposed", reason: STOP_WORDS.kind });

    // A price stops the switch even on Dealmaker's own draft.
    const priced = await t.run((ctx) => fileAgentDraft(ctx, { workspaceId, contactRef: "con1", kind: "reminder", channel: "sms", body: "Reminder: the $4,500 invoice is due.", why: "Due.", trigger: "reminder" }));
    expect((await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: priced })).outcome).toBe("proposed");
    const proposed = (await t.run((ctx) => ctx.db.query("crmActions").collect())).filter((row) => row.state === "proposed");
    expect(proposed).toHaveLength(3);
  });

  it("files Dealmaker's drafts only with a known kind", async () => {
    const { t, workspaceId } = await setup();
    await expect(t.run((ctx) => fileAgentDraft(ctx, { workspaceId, contactRef: "con1", kind: "anything", channel: "sms", body: "Hi.", why: "x" }))).rejects.toThrow(/Unknown message kind/);
  });

  it("refuses at send time a lead without a consent tag, however the message was approved", async () => {
    const { t, owner, workspaceId } = await setup();
    const draftId = await owner.mutation(api.comms.createDraft, { workspaceId, ...draft });
    await owner.mutation(api.comms.submitDraft, { workspaceId, draftId });
    const action = (await t.run((ctx) => ctx.db.query("crmActions").first()))!;
    await t.run((ctx) => ctx.db.patch(action._id, { state: "approved" }));
    // The business names a consent tag Jordan does not have, after the message was approved.
    await owner.mutation(api.playbookInterview.answerConsent, { workspaceId, tags: ["texts-ok"], channels: ["sms"] });
    expect(await t.mutation(internal.crmActions.claim, { actionId: action._id })).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(action._id)))?.resultCode).toBe("no_consent_tag");
  });
});
