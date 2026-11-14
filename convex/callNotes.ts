/**
 * Call notes after a sales call (Dealmaker, build step 11; docs/rebuild/dealmaker.md, 0.8 "Conversation
 * Intelligence"): a short form a closer fills in on their phone, with a voice memo of up to a minute.
 *
 * Everything here is the closer's own account (doctrine 0.0, "a rep's account"), never the buyer's words: the
 * fit fields become readiness facts of kind "rep" with the closer's name, the next step becomes a commitment
 * the closer owns, and the objections heard are counted later by the Objection Playbook. The memo is the
 * closer's own voice, not the call: Deepgram transcribes it, and the audio is deleted once it has.
 * Nothing here contacts the lead or changes the CRM.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { itemsOf } from "./lib/playbook";
import { requireWork } from "./lib/roles";

export const NOTE_LIMITS = {
  nextStep: 300,
  fitValue: 300,
  objections: 10,
  leadName: 80,
  /** The memo: a minute of the closer's voice, and no file larger than this. */
  memoSeconds: 75,
  memoBytes: 4_000_000,
  transcript: 6000,
} as const;

export const OUTCOMES = ["nextCall", "proposal", "thinking", "yes", "no", "notFit", "noShow"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** The outcome in the closer's words. A yes or a no is their account: marking the deal won or lost stays the Owner's. */
export const OUTCOME_WORDS: Record<Outcome, string> = {
  nextCall: "Booked another call",
  proposal: "Asked for a proposal",
  thinking: "Wants time to think",
  yes: "Said yes",
  no: "Said no",
  notFit: "Not a fit",
  noShow: "Did not show",
};

const FIT_FIELDS = ["need", "budget", "decider", "timing", "fit"] as const;
const fitField = v.union(...FIT_FIELDS.map((row) => v.literal(row)));

export const NOTE_TEXT = {
  pickLead: "Pick the lead from your CRM.",
  notRead: "Vistrial has not read that lead from your CRM. Read it again, then try.",
  notTheirs: "That deal is not this lead's.",
  noCrmNeedsName: "No CRM is connected here. Say who the call was with.",
  tooLong: "Keep each note shorter.",
  memoTooLong: `Keep the memo to a minute.`,
  objection: "Pick objections from your Playbook, or write one in a few words.",
} as const;

const clip = (text: string | undefined, max: number) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Where a memo can be uploaded. The closer records their own voice, never the call. */
export const memoUploadUrl = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    requireWork(ctx.member.role);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Saves the closer's notes. The lead must be one Vistrial read (or, with no CRM, named). With a deal, each fit
 * field becomes a readiness fact (a rep's account, with the closer's name) and the next step a commitment the
 * closer owns. A memo is transcribed in the background.
 */
export const save = workspaceMutation({
  args: {
    clientId: v.optional(v.id("clients")),
    contactRef: v.optional(v.string()),
    dealRef: v.optional(v.string()),
    appointmentRef: v.optional(v.string()),
    leadName: v.optional(v.string()),
    outcome: v.union(...OUTCOMES.map((row) => v.literal(row))),
    nextStep: v.optional(v.string()),
    nextStepDue: v.optional(v.number()),
    fit: v.array(v.object({ field: fitField, value: v.string() })),
    objections: v.array(v.object({ title: v.string(), itemId: v.optional(v.id("playbookItems")) })),
    memo: v.optional(v.object({ storageId: v.id("_storage"), seconds: v.number() })),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const crm = await crmFor(ctx, scope);
    let leadName: string;
    if (crm) {
      if (!args.contactRef) throw userError(NOTE_TEXT.pickLead);
      const contact = await crm.contact(args.contactRef);
      if (!contact) throw userError(NOTE_TEXT.notRead);
      if (args.dealRef !== undefined) {
        const deal = await crm.deal(args.dealRef);
        if (!deal || deal.contactRef !== contact.ref) throw userError(NOTE_TEXT.notTheirs);
      }
      leadName = clip(contact.name ?? contact.email ?? "This lead", NOTE_LIMITS.leadName);
    } else {
      leadName = clip(args.leadName, NOTE_LIMITS.leadName);
      if (!leadName) throw userError(NOTE_TEXT.noCrmNeedsName);
    }

    const nextStep = clip(args.nextStep, NOTE_LIMITS.nextStep + 1);
    if (nextStep.length > NOTE_LIMITS.nextStep) throw userError(NOTE_TEXT.tooLong);
    const fit = args.fit.map((row) => ({ field: row.field, value: clip(row.value, NOTE_LIMITS.fitValue + 1) })).filter((row) => row.value);
    if (fit.some((row) => row.value.length > NOTE_LIMITS.fitValue)) throw userError(NOTE_TEXT.tooLong);
    // One value per field: the last one given.
    const byField = new Map(fit.map((row) => [row.field, row]));

    // Objections: a Playbook item of this business, or a few words of the closer's own.
    if (args.objections.length > NOTE_LIMITS.objections) throw userError(NOTE_TEXT.objection);
    const items = new Map((await itemsOf(ctx, scope)).filter((row) => row.folder === "objections").map((row) => [row._id as string, row]));
    const objections = args.objections.map((row) => {
      if (row.itemId) {
        const item = items.get(row.itemId);
        if (!item) throw userError(NOTE_TEXT.objection);
        return { title: item.title, itemId: item._id };
      }
      const title = clip(row.title, 120);
      if (!title) throw userError(NOTE_TEXT.objection);
      return { title };
    });

    if (args.memo && (args.memo.seconds <= 0 || args.memo.seconds > NOTE_LIMITS.memoSeconds)) throw userError(NOTE_TEXT.memoTooLong);
    const now = Date.now();
    const callNoteId = await ctx.db.insert("callNotes", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      ...(crm && args.contactRef ? { contactRef: args.contactRef } : {}),
      ...(crm && args.dealRef ? { dealRef: args.dealRef } : {}),
      ...(args.appointmentRef ? { appointmentRef: args.appointmentRef.slice(0, 100) } : {}),
      leadName,
      outcome: args.outcome,
      ...(nextStep ? { nextStep } : {}),
      ...(args.nextStepDue && nextStep ? { nextStepDue: args.nextStepDue } : {}),
      fit: [...byField.values()],
      objections,
      ...(args.memo ? { memo: { status: "transcribing" as const, storageId: args.memo.storageId, seconds: Math.round(args.memo.seconds) } } : {}),
      writtenBy: ctx.member.displayName,
      createdBy: ctx.identity.subject,
      createdAt: now,
    });

    // The closer's account reaches the Pipeline: readiness facts and the next step, owned by the closer.
    if (crm && args.dealRef) {
      for (const row of byField.values()) {
        await ctx.db.insert("dealFacts", { workspaceId: ctx.workspaceId, ...forClient, dealRef: args.dealRef, field: row.field, value: row.value, kind: "rep", author: ctx.member.displayName, sourceRef: `callNote:${callNoteId}`, recordedBy: ctx.identity.subject, recordedAt: now });
      }
      if (nextStep) {
        await ctx.db.insert("dealCommitments", { workspaceId: ctx.workspaceId, ...forClient, dealRef: args.dealRef, text: nextStep, owner: ctx.member._id, ...(args.nextStepDue ? { due: args.nextStepDue } : {}), sourceRef: `callNote:${callNoteId}`, createdBy: ctx.identity.subject, createdAt: now });
      }
    }
    if (args.memo) await ctx.scheduler.runAfter(0, internal.callNotes.transcribe, { callNoteId });
    // The audit row names the note only, never the lead.
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "callNote.saved", subject: callNoteId });
    return callNoteId;
  },
});

export const memoOf = internalQuery({
  args: { callNoteId: v.id("callNotes") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.callNoteId);
    return row?.memo?.status === "transcribing" && row.memo.storageId ? { storageId: row.memo.storageId } : null;
  },
});

/** Saves the transcript (or why there is none) and deletes the audio either way. */
export const finishMemo = internalMutation({
  args: { callNoteId: v.id("callNotes"), transcript: v.optional(v.string()), failCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.callNoteId);
    if (!row?.memo || row.memo.status !== "transcribing") return null;
    if (row.memo.storageId) await ctx.storage.delete(row.memo.storageId);
    const transcript = (args.transcript ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_LIMITS.transcript);
    await ctx.db.patch(row._id, {
      memo: transcript
        ? { status: "done", seconds: row.memo.seconds, transcript }
        : { status: "failed", seconds: row.memo.seconds, failCode: args.failCode ?? "empty" },
    });
    return null;
  },
});

/** Deepgram's answer, read defensively: the first channel's best transcript. */
export function transcriptOf(body: unknown): string {
  const results = (body as { results?: { channels?: { alternatives?: { transcript?: unknown }[] }[] } } | null)?.results;
  const text = results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof text === "string" ? text : "";
}

/**
 * Transcribes a memo with Deepgram (DEEPGRAM_API_KEY). With no key it records "not set up" and keeps the
 * notes; the audio is deleted whatever happens. Never throws.
 */
export const transcribe = internalAction({
  args: { callNoteId: v.id("callNotes") },
  handler: async (ctx, args): Promise<null> => {
    const memo = await ctx.runQuery(internal.callNotes.memoOf, { callNoteId: args.callNoteId });
    if (!memo) return null;
    const fail = (failCode: string) => ctx.runMutation(internal.callNotes.finishMemo, { callNoteId: args.callNoteId, failCode });
    try {
      const key = process.env.DEEPGRAM_API_KEY?.trim();
      if (!key) {
        await fail("not_set_up");
        return null;
      }
      const blob = await ctx.storage.get(memo.storageId);
      if (!blob) {
        await fail("file_missing");
        return null;
      }
      if (blob.size > NOTE_LIMITS.memoBytes) {
        await fail("too_large");
        return null;
      }
      const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true", {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!response.ok) {
        console.error(`Memo not transcribed: Deepgram answered ${response.status}.`);
        await fail(`deepgram_${response.status}`);
        return null;
      }
      await ctx.runMutation(internal.callNotes.finishMemo, { callNoteId: args.callNoteId, transcript: transcriptOf(await response.json()) });
    } catch {
      console.error("Memo not transcribed: Deepgram could not be reached.");
      await fail("unreachable");
    }
    return null;
  },
});

const MEMO_WORDS: Record<string, string> = {
  not_set_up: "Voice memos are not set up yet, so this one was not transcribed.",
  too_large: "The memo was too long to transcribe.",
  empty: "No words could be heard in the memo.",
};

function noteView(row: Doc<"callNotes">) {
  return {
    id: row._id,
    leadName: row.leadName,
    contactRef: row.contactRef ?? null,
    appointmentRef: row.appointmentRef ?? null,
    outcome: row.outcome,
    outcomeWords: OUTCOME_WORDS[row.outcome],
    nextStep: row.nextStep ?? null,
    nextStepDue: row.nextStepDue ?? null,
    fit: row.fit,
    objections: row.objections.map((item) => item.title),
    memo: row.memo ? { status: row.memo.status, seconds: row.memo.seconds, transcript: row.memo.transcript ?? null, problem: row.memo.status === "failed" ? (MEMO_WORDS[row.memo.failCode ?? ""] ?? "The memo could not be transcribed.") : null } : null,
    writtenBy: row.writtenBy,
    createdAt: row.createdAt,
  };
}

/** Recent call notes for the organization or a client, newest first, with the Playbook's objections to pick from. */
export const recent = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    let clientId: Id<"clients"> | undefined;
    if (args.clientId) {
      const client = await clientHere(ctx, ctx.workspaceId, args.clientId);
      ctx.clients.require(client._id);
      clientId = client._id;
    } else {
      ctx.clients.require(undefined);
    }
    const scope = { workspaceId: ctx.workspaceId, ...(clientId ? { clientId } : {}) };
    const rows = await ctx.db
      .query("callNotes")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", clientId))
      .order("desc")
      .take(30);
    const objections = (await itemsOf(ctx, scope)).filter((row) => row.folder === "objections").map((row) => ({ id: row._id, title: row.title }));
    return { notes: rows.map(noteView), objections, outcomes: OUTCOMES.map((id) => ({ id, label: OUTCOME_WORDS[id] })), canWrite: ctx.role !== "viewer" };
  },
});

/** One note, for the person who may see its client. */
export const get = workspaceQuery({
  args: { callNoteId: v.id("callNotes") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.callNoteId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(row.clientId);
    return noteView(row);
  },
});
