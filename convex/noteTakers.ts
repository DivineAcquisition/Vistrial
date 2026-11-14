/**
 * The business's own note taker and HighLevel's call recordings, feeding Dealmaker's transcripts (build step
 * 11b). Fireflies is connected with the customer's own API key (it has no sign-in app for other products; see
 * docs/rebuild/integrations-setup.md, section 8), kept on the server like a token and never shown again. A
 * person chooses a call and confirms it was recorded lawfully; only then is its transcript read and added,
 * shared with Dealmaker. A HighLevel call recording is fetched and sent straight to Deepgram: the audio is
 * never stored, only the words. Fathom waits until its sign-in details are confirmed with Fathom.
 */

import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { liveToken } from "./highLevel";
import { memberAction, workspaceQuery } from "./lib/builders";
import { clientHere } from "./lib/clients";
import { crmConnectionFor } from "./lib/crm/read";
import { notAllowed, userError } from "./lib/errors";
import { HL_API, apiVersion } from "./lib/highLevel";
import {
  FIREFLIES_API,
  FIREFLIES_QUERY,
  NOTE_LIMITS,
  dayOf,
  deepgramLines,
  firefliesRecent,
  firefliesTranscript,
  firefliesUser,
  recordingPath,
  transcriptText,
  type NoteTakerCall,
} from "./lib/noteTakers";
import { isAdmin } from "./lib/roles";

const DAY = 86_400_000;
/** How far back HighLevel call recordings are offered, and the shortest call worth transcribing. */
const RECORDINGS = { days: 14, minSeconds: 30, max: 30 } as const;

export const NOTE_TEXT = {
  consent: "Confirm the call was recorded lawfully, with everyone on it agreeing where the law asks, before its words are read.",
  badKey: "Fireflies did not accept that key. Copy it again from Fireflies (Integrations, Fireflies API).",
  notConnected: "Connect Fireflies first.",
  unreachable: "Fireflies could not be reached. Try again in a minute.",
  noTranscript: "Fireflies has no transcript for that call yet.",
  already: "That call is already in your transcripts.",
  deepgramOff: "Transcribing recordings is not set up yet.",
  noRecording: "HighLevel has no recording for that call.",
  hlUnreachable: "HighLevel could not be reached. Try again in a minute.",
  notFound: "That call is not one Vistrial read from your CRM.",
} as const;

async function firefliesCall(key: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(FIREFLIES_API, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  if (response.status === 401 || response.status === 403) return { ok: false as const, code: "bad_key" };
  if (!response.ok) return { ok: false as const, code: `fireflies_${response.status}` };
  const body = (await response.json()) as { errors?: unknown[] };
  if (Array.isArray(body?.errors) && body.errors.length) return { ok: false as const, code: "fireflies_error" };
  return { ok: true as const, body };
}

/** The note takers and recordings as the Calls tab shows them. No key or token ever leaves the server. */
export const status = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = args.clientId ? { workspaceId: ctx.workspaceId, clientId: (await clientHere(ctx, ctx.workspaceId, args.clientId))._id } : { workspaceId: ctx.workspaceId };
    ctx.clients.require(scope.clientId);
    const fireflies = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId).eq("provider", "fireflies"))
      .first();
    const imported = new Set(
      (
        await ctx.db
          .query("callTranscripts")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
          .take(500)
      ).flatMap((row) => (row.sourceRef ? [row.sourceRef] : [])),
    );
    const connection = await crmConnectionFor(ctx, scope);
    const recordings: { ref: string; leadName: string; at: number; minutes: number; imported: boolean }[] = [];
    if (connection) {
      const now = Date.now();
      const calls = (
        await ctx.db
          .query("crmActivities")
          .withIndex("by_connection_at", (q) => q.eq("connectionId", connection._id).gte("at", now - RECORDINGS.days * DAY))
          .order("desc")
          .take(500)
      ).filter((row) => row.kind === "call" && (row.seconds ?? 0) >= RECORDINGS.minSeconds && row.contactId);
      for (const call of calls.slice(0, RECORDINGS.max)) {
        const contact = await ctx.db
          .query("crmContacts")
          .withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", call.contactId!))
          .first();
        recordings.push({
          ref: call.externalId,
          leadName: contact?.name ?? "A lead",
          at: call.at,
          minutes: Math.max(1, Math.round((call.seconds ?? 0) / 60)),
          imported: imported.has(`highlevel:${call.externalId}`),
        });
      }
    }
    return {
      canConnect: isAdmin(ctx.member.role),
      canImport: ctx.role !== "viewer",
      fireflies: fireflies ? { connected: fireflies.status === "connected", accountLabel: fireflies.accountLabel } : null,
      fathom: "Fathom connects once its sign-in is confirmed with Fathom. Until then, copy a Fathom transcript and add it in Transcripts.",
      transcribing: Boolean(process.env.DEEPGRAM_API_KEY?.trim()),
      recordings,
    };
  },
});

/** Connects Fireflies with the customer's own API key, after checking Fireflies accepts it. Owner or Admin. */
export const connectFireflies = memberAction({
  args: { apiKey: v.string() },
  handler: async (ctx, args): Promise<{ accountLabel: string }> => {
    const role: string | null = await ctx.runQuery(internal.integrations.roleOf, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (!role || !isAdmin(role)) notAllowed();
    const key = args.apiKey.trim();
    if (!/^[A-Za-z0-9._-]{16,200}$/.test(key)) throw userError(NOTE_TEXT.badKey);
    let result: Awaited<ReturnType<typeof firefliesCall>>;
    try {
      result = await firefliesCall(key, FIREFLIES_QUERY.me);
    } catch {
      throw userError(NOTE_TEXT.unreachable);
    }
    const user = result.ok ? firefliesUser(result.body) : null;
    if (!user) throw userError(NOTE_TEXT.badKey);
    await ctx.runMutation(internal.integrations.saveConnection, {
      workspaceId: ctx.workspaceId,
      provider: "fireflies",
      accessToken: key,
      scopes: [],
      accountId: user.id,
      accountLabel: user.name,
      connectedBy: ctx.userId,
    });
    return { accountLabel: user.name };
  },
});

export const firefliesKey = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", "fireflies"))
      .first();
    return row?.status === "connected" ? row.accessToken : null;
  },
});

export const importedRefs = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("callTranscripts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(500)
    ).flatMap((row) => (row.sourceRef ? [row.sourceRef] : [])),
});

/** Fireflies' recent calls, read live (nothing is kept until a person imports one). */
export const firefliesCalls = memberAction({
  args: {},
  handler: async (ctx): Promise<(NoteTakerCall & { imported: boolean })[]> => {
    const key: string | null = await ctx.runQuery(internal.noteTakers.firefliesKey, { workspaceId: ctx.workspaceId });
    if (!key) throw userError(NOTE_TEXT.notConnected);
    let result: Awaited<ReturnType<typeof firefliesCall>>;
    try {
      result = await firefliesCall(key, FIREFLIES_QUERY.recent, { limit: NOTE_LIMITS.recent });
    } catch {
      throw userError(NOTE_TEXT.unreachable);
    }
    if (!result.ok) throw userError(result.code === "bad_key" ? NOTE_TEXT.badKey : NOTE_TEXT.unreachable);
    const imported = new Set<string>(await ctx.runQuery(internal.noteTakers.importedRefs, { workspaceId: ctx.workspaceId }));
    return firefliesRecent(result.body).map((call) => ({ ...call, imported: imported.has(`fireflies:${call.id}`) }));
  },
});

/** Marks a transcript as imported for Dealmaker: where it came from, the lead, and Dealmaker's use of it. */
export const markImported = internalMutation({
  args: { transcriptId: v.id("callTranscripts"), sourceRef: v.string(), crmContactRef: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.transcriptId);
    if (!row) return null;
    const agents = [...new Set([...(row.agents ?? []), SALES_CONVERSION])];
    await ctx.db.patch(row._id, { sourceRef: args.sourceRef, agents, ...(args.crmContactRef ? { crmContactRef: args.crmContactRef } : {}) });
    return null;
  },
});

/**
 * Imports one Fireflies call's transcript, once the person confirms it was recorded lawfully. The transcript
 * is added through the same door as an upload (its checks, limits and client), then shared with Dealmaker.
 */
export const importFireflies = memberAction({
  args: { firefliesId: v.string(), consentConfirmed: v.boolean(), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args): Promise<Id<"callTranscripts">> => {
    if (!args.consentConfirmed) throw userError(NOTE_TEXT.consent);
    const sourceRef = `fireflies:${args.firefliesId.slice(0, 80)}`;
    const imported: string[] = await ctx.runQuery(internal.noteTakers.importedRefs, { workspaceId: ctx.workspaceId });
    if (imported.includes(sourceRef)) throw userError(NOTE_TEXT.already);
    const key: string | null = await ctx.runQuery(internal.noteTakers.firefliesKey, { workspaceId: ctx.workspaceId });
    if (!key) throw userError(NOTE_TEXT.notConnected);
    let result: Awaited<ReturnType<typeof firefliesCall>>;
    try {
      result = await firefliesCall(key, FIREFLIES_QUERY.one, { id: args.firefliesId });
    } catch {
      throw userError(NOTE_TEXT.unreachable);
    }
    if (!result.ok) throw userError(result.code === "bad_key" ? NOTE_TEXT.badKey : NOTE_TEXT.unreachable);
    const call = firefliesTranscript(result.body);
    if (!call || !call.lines.length) throw userError(NOTE_TEXT.noTranscript);
    const transcriptId: Id<"callTranscripts"> = await ctx.runMutation(api.transcripts.add, {
      workspaceId: ctx.workspaceId,
      title: call.title,
      tool: "Fireflies",
      callDate: dayOf(call.at),
      text: transcriptText(call.lines),
      consentConfirmed: true,
      ...(args.clientId ? { clientId: args.clientId } : {}),
    });
    await ctx.runMutation(internal.noteTakers.markImported, { transcriptId, sourceRef });
    return transcriptId;
  },
});

export const recordingJob = internalQuery({
  args: { connectionId: v.id("crmConnections"), messageRef: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const call = await ctx.db
      .query("crmActivities")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId).eq("externalId", args.messageRef))
      .first();
    if (!connection || !call || call.kind !== "call") return null;
    const contact = call.contactId
      ? await ctx.db
          .query("crmContacts")
          .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId).eq("externalId", call.contactId!))
          .first()
      : null;
    return { locationId: connection.accountId, contactRef: call.contactId ?? null, at: call.at, leadName: (contact as Doc<"crmContacts"> | null)?.name ?? "A lead" };
  },
});

export const crmConnectionOf = internalQuery({
  args: { workspaceId: v.id("workspaces"), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => (await crmConnectionFor(ctx, { workspaceId: args.workspaceId, ...(args.clientId ? { clientId: args.clientId } : {}) }))?._id ?? null,
});

/**
 * Transcribes one HighLevel call recording, once the person confirms it was recorded lawfully: the audio is
 * read from HighLevel and sent straight to Deepgram, and only the words are added, linked to the lead.
 */
export const transcribeRecording = memberAction({
  args: { messageRef: v.string(), consentConfirmed: v.boolean(), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args): Promise<Id<"callTranscripts">> => {
    if (!args.consentConfirmed) throw userError(NOTE_TEXT.consent);
    // The person may see this organization or client: the same check the Calls tab makes.
    const seen = await ctx.runQuery(api.noteTakers.status, { workspaceId: ctx.workspaceId, ...(args.clientId ? { clientId: args.clientId } : {}) });
    const listed = seen.recordings.find((row) => row.ref === args.messageRef);
    if (!listed) throw userError(NOTE_TEXT.notFound);
    if (listed.imported) throw userError(NOTE_TEXT.already);
    const deepgram = process.env.DEEPGRAM_API_KEY?.trim();
    if (!deepgram) throw userError(NOTE_TEXT.deepgramOff);
    const connectionId: Id<"crmConnections"> | null = await ctx.runQuery(internal.noteTakers.crmConnectionOf, { workspaceId: ctx.workspaceId, ...(args.clientId ? { clientId: args.clientId } : {}) });
    if (!connectionId) throw userError(NOTE_TEXT.notFound);
    const job: { locationId: string; contactRef: string | null; at: number; leadName: string } | null = await ctx.runQuery(internal.noteTakers.recordingJob, {
      connectionId,
      messageRef: args.messageRef,
    });
    if (!job) throw userError(NOTE_TEXT.notFound);
    const live = await liveToken(ctx, connectionId);
    if (!live.ok) throw userError(NOTE_TEXT.hlUnreachable);
    const path = recordingPath(args.messageRef, job.locationId);
    let audio: Blob;
    try {
      const response = await fetch(`${HL_API}${path}`, { headers: { Authorization: `Bearer ${live.token}`, Version: apiVersion(path) } });
      if (response.status === 404) throw userError(NOTE_TEXT.noRecording);
      if (!response.ok) throw userError(NOTE_TEXT.hlUnreachable);
      audio = await response.blob();
    } catch (error) {
      if ((error as { data?: unknown }).data) throw error;
      throw userError(NOTE_TEXT.hlUnreachable);
    }
    if (!audio.size) throw userError(NOTE_TEXT.noRecording);
    // Straight to Deepgram; the audio is never written anywhere.
    let words: ReturnType<typeof deepgramLines> = [];
    try {
      const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&diarize=true&paragraphs=true", {
        method: "POST",
        headers: { Authorization: `Token ${deepgram}`, "Content-Type": audio.type || "audio/wav" },
        body: audio,
      });
      if (!response.ok) {
        console.error(`Recording not transcribed: Deepgram answered ${response.status}.`);
        throw userError("The recording could not be transcribed. Try again later.");
      }
      words = deepgramLines(await response.json());
    } catch (error) {
      if ((error as { data?: unknown }).data) throw error;
      throw userError("The recording could not be transcribed. Try again later.");
    }
    if (!words.length) throw userError("No words could be heard in the recording.");
    const transcriptId: Id<"callTranscripts"> = await ctx.runMutation(api.transcripts.add, {
      workspaceId: ctx.workspaceId,
      title: `Call with ${job.leadName}`.slice(0, NOTE_LIMITS.title),
      tool: "HighLevel call recording",
      callDate: dayOf(job.at),
      text: transcriptText(words),
      consentConfirmed: true,
      ...(args.clientId ? { clientId: args.clientId } : {}),
    });
    await ctx.runMutation(internal.noteTakers.markImported, { transcriptId, sourceRef: `highlevel:${args.messageRef}`, ...(job.contactRef ? { crmContactRef: job.contactRef } : {}) });
    return transcriptId;
  },
});
