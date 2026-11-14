/**
 * @vitest-environment edge-runtime
 *
 * Voice notes (build step 14): a voice cloned only from an Owner-confirmed consent recording; without
 * ElevenLabs every screen says it is not set up; a voice note's audio is made for its exact words and thrown
 * away when they change; every voice note waits for a person, and its audio rides on the approved message.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED } from "./lib/errors";
import { writeRequest } from "./lib/crmActions";
import { VOICE_TEXT, consentStatement, sameName } from "./lib/dealmaker/voice";
import { fileAgentDraft } from "./comms";
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

type Call = { url: string; method: string; key: string | null; body: unknown };

function stubElevenLabs() {
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", key: new Headers(init.headers).get("xi-api-key"), body: init.body });
    if (url.endsWith("/voices/add")) return new Response(JSON.stringify({ voice_id: "voice123" }), { status: 200 });
    if (url.includes("/text-to-speech/")) return new Response(new Blob(["mp3 bytes"], { type: "audio/mpeg" }), { status: 200 });
    return new Response("{}", { status: 200 });
  });
  return calls;
}

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
  const member = t.withIdentity(person("milo"));
  await member.mutation(api.workspace.acceptInvite, { token: invite.token });
  await t.run(async (ctx) => {
    const now = Date.now();
    const connectionId = await ctx.db.insert("crmConnections", {
      workspaceId,
      provider: "highlevel",
      status: "connected",
      accessToken: "token",
      refreshToken: "refresh",
      tokenExpiresAt: now + DAY,
      scopes: [],
      accountId: "loc1",
      accountName: "Northlight",
      currency: "USD",
      connectedBy: "nora",
      connectedAt: now,
      lastSyncAt: now,
      callsOk: 0,
      callsFailed: 0,
      actingEnabled: true,
      messagingEnabled: true,
    });
    const base = { workspaceId, connectionId, seenAt: now };
    await ctx.db.insert("crmDeals", { ...base, externalId: "opp1", pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: "con1" });
    await ctx.db.insert("crmContacts", { ...base, externalId: "con1", name: "Jordan Lee", phone: "+15555550101", tags: ["opted-in"], addedAt: now });
  });
  await owner.mutation(api.playbookInterview.answerConsent, { workspaceId, tags: ["opted-in"], channels: ["sms", "voice"] });
  const recording = () => t.run((ctx) => ctx.storage.store(new Blob(["fake audio"], { type: "audio/webm" }))) as Promise<Id<"_storage">>;
  return { t, owner, member, workspaceId, recording };
}

const record = (storageId: Id<"_storage">, typedName = "Nora Quinn") => ({ speakerName: "Nora Quinn", typedName, storageId, seconds: 45 });
const voiceDraft = { contactRef: "con1", dealRef: "opp1", kind: "followUp", channel: "sms" as const, body: "Hi Jordan, it's Nora. Just checking the plan made sense.", voice: true };

describe("voice note rules", () => {
  it("matches the typed name to the speaker's, and words the consent statement", () => {
    expect(sameName("Nora  Quinn", " nora quinn")).toBe(true);
    expect(sameName("Nora Quinn", "Nora")).toBe(false);
    expect(consentStatement("Nora Quinn", "Northlight")).toMatch(/^My name is Nora Quinn\. I agree that Vistrial may make a copy of my voice for Northlight/);
  });

  it("attaches only an https audio link to a text or email", () => {
    expect(writeRequest({ kind: "send_sms", contactId: "con1", body: "Hi", attachments: ["https://files.example.com/a.mp3"] }).body).toMatchObject({
      attachments: ["https://files.example.com/a.mp3"],
    });
    expect(writeRequest({ kind: "send_sms", contactId: "con1", body: "Hi", attachments: ["http://files.example.com/a.mp3"] }).body).not.toHaveProperty("attachments");
    expect(writeRequest({ kind: "send_sms", contactId: "con1", body: "Hi" }).body).not.toHaveProperty("attachments");
  });
});

describe("voice notes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("says it is not set up without ElevenLabs, collects no voice, and holds a voice note", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { t, owner, workspaceId, recording } = await setup();
    const storageId = await recording();
    expect(await owner.mutation(api.voiceNotes.recordVoice, { workspaceId, ...record(storageId) })).toEqual({ ok: false, reason: VOICE_TEXT.notSetUp });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) === null)).toBe(true);
    expect(await owner.query(api.voiceNotes.status, { workspaceId })).toMatchObject({ setUp: false, canRecord: true, voice: null });
    const draftId = await owner.mutation(api.comms.createDraft, { workspaceId, ...voiceDraft });
    expect((await owner.query(api.comms.view, { workspaceId })).voiceProblem).toBe(VOICE_TEXT.notSetUp);
    expect(await message(owner.mutation(api.voiceNotes.makeAudio, { workspaceId, draftId }))).toBe(VOICE_TEXT.notSetUp);
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId })).toEqual({ outcome: "held", reason: VOICE_TEXT.notSetUp });
    expect(await t.run((ctx) => ctx.db.query("crmActions").collect())).toHaveLength(0);
  });

  it("refuses a recording an Owner did not confirm by the speaker's name, a short one, and anyone but an Owner", async () => {
    stubElevenLabs();
    const { t, owner, member, workspaceId, recording } = await setup();
    const first = await recording();
    expect(await owner.mutation(api.voiceNotes.recordVoice, { workspaceId, ...record(first, "Someone Else") })).toEqual({ ok: false, reason: VOICE_TEXT.nameMismatch });
    // A refused recording is deleted.
    expect(await t.run(async (ctx) => (await ctx.storage.get(first)) === null)).toBe(true);
    expect(await owner.mutation(api.voiceNotes.recordVoice, { workspaceId, ...record(await recording()), seconds: 10 })).toEqual({ ok: false, reason: VOICE_TEXT.tooShort });
    expect(await message(member.mutation(api.voiceNotes.recordVoice, { workspaceId, ...record(await recording()) }))).toBe(NOT_ALLOWED);
    expect((await member.query(api.voiceNotes.status, { workspaceId })).canRecord).toBe(false);
  });

  it("clones the voice, makes the audio for exact words, waits for a person, and carries the audio on the message", async () => {
    const calls = stubElevenLabs();
    const { t, owner, workspaceId, recording } = await setup();
    // Jordan was messaged before, and the Owner made reminders automatic: a voice note still waits for SEND.
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query("crmConnections").first())!;
      await ctx.db.insert("crmActions", {
        workspaceId,
        connectionId: connection._id,
        kind: "send_sms",
        contactId: "con1",
        body: "Earlier.",
        summary: "Earlier text",
        why: "Earlier.",
        state: "done",
        proposedBy: "agent",
        proposedAt: Date.now() - 3 * DAY,
        doneAt: Date.now() - 3 * DAY,
      } as never);
    });
    await owner.mutation(api.dealmakerTeam.setAutonomy, { workspaceId, kind: "reminder", automatic: true });

    await owner.mutation(api.voiceNotes.recordVoice, { workspaceId, ...record(await recording()) });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await owner.query(api.voiceNotes.status, { workspaceId })).voice).toMatchObject({ status: "ready" });
    const clone = calls.find((row) => row.url.endsWith("/voices/add"))!;
    expect(clone).toMatchObject({ method: "POST", key: "test-key" });
    // ElevenLabs never learns whose voice it is.
    expect(String((clone.body as FormData).get("name"))).not.toMatch(/Nora|Northlight/);

    const draftId = await t.run((ctx) =>
      fileAgentDraft(ctx, {
        workspaceId,
        contactRef: "con1",
        dealRef: "opp1",
        kind: "reminder",
        channel: "sms",
        body: "See you at 3pm today, Jordan.",
        why: "A call is booked for today.",
        trigger: "reminder",
        voice: true,
      }),
    );
    expect(await message(owner.mutation(api.comms.submitDraft, { workspaceId, draftId }))).toBe(VOICE_TEXT.notMade);

    await owner.mutation(api.voiceNotes.makeAudio, { workspaceId, draftId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const tts = calls.find((row) => row.url.includes("/text-to-speech/voice123"))!;
    expect(JSON.parse(String(tts.body))).toMatchObject({ text: "See you at 3pm today, Jordan." });
    let item = (await owner.query(api.comms.view, { workspaceId })).lanes.find((row) => row.id === "drafted")!.items[0];
    expect(item.audio).toMatchObject({ status: "ready" });
    expect(item.audio?.url).toBeTruthy();

    // New words throw the audio away.
    const before = (await t.run((ctx) => ctx.db.get(draftId)))!.audio!.storageId!;
    await owner.mutation(api.comms.updateDraft, { workspaceId, draftId, channel: "sms", body: "See you at 3pm today." });
    expect(await t.run(async (ctx) => (await ctx.storage.get(before)) === null)).toBe(true);
    item = (await owner.query(api.comms.view, { workspaceId })).lanes.find((row) => row.id === "drafted")!.items[0];
    expect(item.audio).toMatchObject({ status: "none", url: null });

    await owner.mutation(api.voiceNotes.makeAudio, { workspaceId, draftId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId })).toEqual({ outcome: "proposed", reason: VOICE_TEXT.everyOne });
    const action = (await t.run((ctx) => ctx.db.query("crmActions").collect())).find((row) => row.state === "proposed")!;
    expect(action.audioStorageId).toBe((await t.run((ctx) => ctx.db.get(draftId)))!.audio!.storageId);
    const list = await owner.query(api.crmActions.list, { workspaceId });
    expect(list.actions.find((row) => row.id === action._id)?.audioUrl).toBeTruthy();
  });

  it("holds a voice note until consent tags are named and voice is an allowed channel", async () => {
    stubElevenLabs();
    const { owner, workspaceId } = await setup();
    await owner.mutation(api.playbookInterview.answerConsent, { workspaceId, tags: [], channels: ["sms", "voice"] });
    const draftId = await owner.mutation(api.comms.createDraft, { workspaceId, ...voiceDraft });
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId })).toEqual({ outcome: "held", reason: VOICE_TEXT.noConsentTags });
    await owner.mutation(api.playbookInterview.answerConsent, { workspaceId, tags: ["opted-in"], channels: ["sms"] });
    const second = await owner.mutation(api.comms.createDraft, { workspaceId, ...voiceDraft });
    expect(await owner.mutation(api.comms.submitDraft, { workspaceId, draftId: second })).toEqual({ outcome: "held", reason: VOICE_TEXT.notAChannel });
  });

  it("removes the voice: the recording here and the clone at ElevenLabs", async () => {
    const calls = stubElevenLabs();
    const { t, owner, workspaceId, recording } = await setup();
    const storageId = await recording();
    await owner.mutation(api.voiceNotes.recordVoice, { workspaceId, ...record(storageId) });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await owner.mutation(api.voiceNotes.removeVoice, { workspaceId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) === null)).toBe(true);
    expect(calls.some((row) => row.method === "DELETE" && row.url.endsWith("/voices/voice123"))).toBe(true);
    expect((await owner.query(api.voiceNotes.status, { workspaceId })).voice).toBeNull();
  });
});
