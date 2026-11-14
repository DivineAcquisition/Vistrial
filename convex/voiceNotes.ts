/**
 * Voice notes (build step 14): an Owner records the speaker reading the consent statement and a short
 * passage; ElevenLabs clones the voice from that recording (ELEVENLABS_API_KEY; without it every screen says
 * "Voice notes are not set up yet"). A draft marked as a voice note gets its audio made on request, for
 * exactly its words, so a person listens before sending it on. Every voice note waits for the typed SEND and
 * goes as an audio attachment to a text or email, never a voicemail drop (docs/rebuild/dealmaker.md,
 * decision 3).
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { ownerMutation, workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { notFound, userError } from "./lib/errors";
import { isOwner } from "./lib/roles";
import { SAMPLE_PASSAGE, VOICE_LIMITS, VOICE_TEXT, consentStatement, sameName, voiceFailWords } from "./lib/dealmaker/voice";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };
type ReadCtx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };

const ELEVENLABS = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_multilingual_v2";

function providerKey() {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

/** Whether ElevenLabs is set up on this deployment. Readable from a query: no key value ever leaves here. */
export function voiceNotesSetUp() {
  return providerKey() !== null;
}

async function readScope(ctx: ReadCtx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** The current voice (not removed) for this organization or client. */
export async function currentVoice(ctx: Pick<QueryCtx, "db">, scope: Scope) {
  const rows = await ctx.db
    .query("dealmakerVoices")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
    .collect();
  return rows.filter((row) => row.status !== "removed").sort((a, b) => b.confirmedAt - a.confirmedAt)[0] ?? null;
}

/** Why a voice note cannot be made or sent right now, or null when the voice is ready. */
export async function voiceProblem(ctx: Pick<QueryCtx, "db">, scope: Scope): Promise<string | null> {
  if (!voiceNotesSetUp()) return VOICE_TEXT.notSetUp;
  const voice = await currentVoice(ctx, scope);
  if (!voice) return VOICE_TEXT.noVoice;
  if (voice.status === "cloning") return VOICE_TEXT.cloning;
  if (voice.status !== "ready") return voiceFailWords(voice.failCode);
  return null;
}

/** Deletes a draft's audio file, if it has one. */
export async function dropAudio(ctx: MutationCtx, draft: Doc<"dealmakerDrafts">) {
  if (draft.audio?.storageId) await ctx.storage.delete(draft.audio.storageId);
}

async function businessName(ctx: Pick<QueryCtx, "db">, scope: Scope) {
  if (scope.clientId) return (await ctx.db.get(scope.clientId))?.name ?? "this business";
  return (await ctx.db.get(scope.workspaceId))?.name ?? "this business";
}

/** The voice set-up as the Comms tab shows it. */
export const status = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const voice = await currentVoice(ctx, scope);
    return {
      setUp: voiceNotesSetUp(),
      canRecord: isOwner(ctx.member.role),
      business: await businessName(ctx, scope),
      passage: SAMPLE_PASSAGE,
      limits: { sampleSecondsMin: VOICE_LIMITS.sampleSecondsMin, sampleSecondsMax: VOICE_LIMITS.sampleSecondsMax, script: VOICE_LIMITS.script },
      voice: voice
        ? {
            speakerName: voice.speakerName,
            status: voice.status,
            confirmedAt: voice.confirmedAt,
            words:
              voice.status === "ready"
                ? "Ready for voice notes."
                : voice.status === "cloning"
                  ? VOICE_TEXT.cloning
                  : voice.status === "notSetUp"
                    ? VOICE_TEXT.notSetUp
                    : voiceFailWords(voice.failCode),
          }
        : null,
    };
  },
});

/** Where the consent recording is uploaded. Owners only. */
export const sampleUploadUrl = ownerMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/**
 * An Owner confirms a recording of the speaker reading the consent statement, by typing the speaker's name.
 * Replaces any earlier voice, then clones it when ElevenLabs is set up. A refusal comes back as its reason.
 */
export const recordVoice = ownerMutation({
  args: { clientId: v.optional(v.id("clients")), speakerName: v.string(), typedName: v.string(), storageId: v.id("_storage"), seconds: v.number() },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const scope: Scope = { workspaceId: ctx.workspaceId, ...forClient };
    const speakerName = args.speakerName.replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.speakerName);
    const file = await ctx.db.system.get(args.storageId);
    // A refused recording is deleted, so the refusal is returned rather than thrown (a throw would undo it).
    const fail = async (reason: string) => {
      if (file) await ctx.storage.delete(args.storageId);
      return { ok: false as const, reason };
    };
    // No voice is collected that could not be used.
    if (!voiceNotesSetUp()) return fail(VOICE_TEXT.notSetUp);
    if (!speakerName || !sameName(speakerName, args.typedName)) return fail(VOICE_TEXT.nameMismatch);
    if (!file || !(file.contentType ?? "").startsWith("audio/") || file.size > VOICE_LIMITS.sampleBytes) return fail(VOICE_TEXT.badRecording);
    if (args.seconds < VOICE_LIMITS.sampleSecondsMin) return fail(VOICE_TEXT.tooShort);
    const earlier = await currentVoice(ctx, scope);
    if (earlier) await retire(ctx, earlier);
    const now = Date.now();
    const voiceId = await ctx.db.insert("dealmakerVoices", {
      ...scope,
      speakerName,
      statement: consentStatement(speakerName, await businessName(ctx, scope)),
      sampleStorageId: args.storageId,
      sampleSeconds: Math.min(VOICE_LIMITS.sampleSecondsMax, Math.round(args.seconds)),
      confirmedBy: ctx.identity.subject,
      confirmedAt: now,
      status: "cloning",
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.voiceNotes.cloneVoice, { voiceId });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.voice_consent_recorded", subject: voiceId });
    return { ok: true as const, voiceId };
  },
});

/** Tries the clone again, for a voice recorded before ElevenLabs was set up or one that failed. */
export const retryVoice = ownerMutation({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const voice = await currentVoice(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    if (!voice || voice.status === "ready" || voice.status === "cloning") notFound();
    if (!voiceNotesSetUp()) throw userError(VOICE_TEXT.notSetUp);
    if (!voice.sampleStorageId) throw userError(voiceFailWords("file_missing"));
    await ctx.db.patch(voice._id, { status: "cloning", failCode: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.voiceNotes.cloneVoice, { voiceId: voice._id });
    return null;
  },
});

async function retire(ctx: MutationCtx, voice: Doc<"dealmakerVoices">) {
  if (voice.sampleStorageId) await ctx.storage.delete(voice.sampleStorageId);
  await ctx.db.patch(voice._id, { status: "removed", sampleStorageId: undefined, removedAt: Date.now(), updatedAt: Date.now() });
  if (voice.providerVoiceId) await ctx.scheduler.runAfter(0, internal.voiceNotes.deleteProviderVoice, { providerVoiceId: voice.providerVoiceId });
}

/** Deletes the voice: the recording here and the clone at ElevenLabs. */
export const removeVoice = ownerMutation({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const voice = await currentVoice(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    if (!voice) notFound();
    await retire(ctx, voice);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.voice_removed", subject: voice._id });
    return null;
  },
});

export const voiceJob = internalQuery({
  args: { voiceId: v.id("dealmakerVoices") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.voiceId);
    return row?.status === "cloning" && row.sampleStorageId ? { storageId: row.sampleStorageId } : null;
  },
});

export const finishClone = internalMutation({
  args: { voiceId: v.id("dealmakerVoices"), providerVoiceId: v.optional(v.string()), failCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.voiceId);
    if (!row) return null;
    if (row.status !== "cloning") {
      // Removed while it was cloning: delete what ElevenLabs made.
      if (args.providerVoiceId) await ctx.scheduler.runAfter(0, internal.voiceNotes.deleteProviderVoice, { providerVoiceId: args.providerVoiceId });
      return null;
    }
    await ctx.db.patch(
      row._id,
      args.providerVoiceId
        ? { status: "ready", providerVoiceId: args.providerVoiceId, failCode: undefined, updatedAt: Date.now() }
        : { status: args.failCode === "not_set_up" ? "notSetUp" : "failed", failCode: args.failCode, updatedAt: Date.now() },
    );
    return null;
  },
});

/** Clones the voice from the consent recording with ElevenLabs. Never throws; the reason is kept as a code. */
export const cloneVoice = internalAction({
  args: { voiceId: v.id("dealmakerVoices") },
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.runQuery(internal.voiceNotes.voiceJob, args);
    if (!job) return null;
    const fail = (failCode: string) => ctx.runMutation(internal.voiceNotes.finishClone, { voiceId: args.voiceId, failCode });
    try {
      const key = providerKey();
      if (!key) {
        await fail("not_set_up");
        return null;
      }
      const sample = await ctx.storage.get(job.storageId);
      if (!sample) {
        await fail("file_missing");
        return null;
      }
      const form = new FormData();
      // A generic name: ElevenLabs never learns whose voice or business this is.
      form.append("name", `Vistrial voice ${args.voiceId.slice(-8)}`);
      form.append("files", sample, "consent-recording");
      form.append("remove_background_noise", "true");
      const response = await fetch(`${ELEVENLABS}/voices/add`, { method: "POST", headers: { "xi-api-key": key }, body: form });
      if (!response.ok) {
        console.error(`Voice not cloned: ElevenLabs answered ${response.status}.`);
        await fail(`elevenlabs_${response.status}`);
        return null;
      }
      const id = ((await response.json()) as { voice_id?: unknown } | null)?.voice_id;
      if (typeof id !== "string" || !id) {
        await fail("empty");
        return null;
      }
      await ctx.runMutation(internal.voiceNotes.finishClone, { voiceId: args.voiceId, providerVoiceId: id });
    } catch {
      console.error("Voice not cloned: ElevenLabs could not be reached.");
      await fail("unreachable");
    }
    return null;
  },
});

/** Deletes a cloned voice at ElevenLabs. Best effort: a failure is logged, never retried with the key shown. */
export const deleteProviderVoice = internalAction({
  args: { providerVoiceId: v.string() },
  handler: async (_ctx, args): Promise<null> => {
    const key = providerKey();
    if (!key) return null;
    try {
      const response = await fetch(`${ELEVENLABS}/voices/${encodeURIComponent(args.providerVoiceId)}`, { method: "DELETE", headers: { "xi-api-key": key } });
      if (!response.ok) console.error(`Voice not deleted at ElevenLabs: it answered ${response.status}.`);
    } catch {
      console.error("Voice not deleted at ElevenLabs: it could not be reached.");
    }
    return null;
  },
});

/** Makes a voice note's audio for exactly the draft's words, so a person can listen before sending it on. */
export const makeAudio = workspaceMutation({
  args: { draftId: v.id("dealmakerDrafts") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.draftId);
    if (!row || row.workspaceId !== ctx.workspaceId || row.status === "discarded") notFound();
    ctx.clients.require(row.clientId);
    if (row.status === "proposed") throw userError("This message has already been proposed, so it can no longer be edited.");
    if (!row.voice) throw userError("This message is not a voice note.");
    const scope: Scope = { workspaceId: row.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
    const problem = await voiceProblem(ctx, scope);
    if (problem) throw userError(problem);
    if (row.audio?.status === "making") return null;
    await dropAudio(ctx, row);
    await ctx.db.patch(row._id, { audio: { status: "making", text: row.body, at: Date.now() }, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.voiceNotes.renderAudio, { draftId: row._id });
    return null;
  },
});

export const audioJob = internalQuery({
  args: { draftId: v.id("dealmakerDrafts") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.draftId);
    if (!row || row.audio?.status !== "making") return null;
    const voice = await currentVoice(ctx, { workspaceId: row.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) });
    return { text: row.audio.text, providerVoiceId: voice?.status === "ready" ? (voice.providerVoiceId ?? null) : null };
  },
});

/** Keeps the audio only if the words are still the ones it was made from; otherwise deletes it. */
export const finishAudio = internalMutation({
  args: { draftId: v.id("dealmakerDrafts"), text: v.string(), storageId: v.optional(v.id("_storage")), failCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.draftId);
    const current = row && row.status !== "discarded" && row.status !== "proposed" && row.audio?.status === "making" && row.audio.text === args.text && row.body === args.text;
    if (!current) {
      if (args.storageId) await ctx.storage.delete(args.storageId);
      return null;
    }
    await ctx.db.patch(row._id, {
      audio: args.storageId
        ? { status: "ready", text: args.text, storageId: args.storageId, at: Date.now() }
        : { status: "failed", text: args.text, failCode: args.failCode ?? "empty", at: Date.now() },
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Speaks the draft's words in the cloned voice with ElevenLabs and stores the audio. Never throws. */
export const renderAudio = internalAction({
  args: { draftId: v.id("dealmakerDrafts") },
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.runQuery(internal.voiceNotes.audioJob, args);
    if (!job) return null;
    const fail = (failCode: string) => ctx.runMutation(internal.voiceNotes.finishAudio, { draftId: args.draftId, text: job.text, failCode });
    try {
      const key = providerKey();
      if (!key) {
        await fail("not_set_up");
        return null;
      }
      if (!job.providerVoiceId) {
        await fail("no_voice");
        return null;
      }
      const response = await fetch(`${ELEVENLABS}/text-to-speech/${encodeURIComponent(job.providerVoiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: job.text, model_id: TTS_MODEL }),
      });
      if (!response.ok) {
        console.error(`Voice note not made: ElevenLabs answered ${response.status}.`);
        await fail(`elevenlabs_${response.status}`);
        return null;
      }
      const audio = await response.blob();
      if (!audio.size) {
        await fail("empty");
        return null;
      }
      const storageId = await ctx.storage.store(new Blob([await audio.arrayBuffer()], { type: "audio/mpeg" }));
      await ctx.runMutation(internal.voiceNotes.finishAudio, { draftId: args.draftId, text: job.text, storageId });
    } catch {
      console.error("Voice note not made: ElevenLabs could not be reached.");
      await fail("unreachable");
    }
    return null;
  },
});
