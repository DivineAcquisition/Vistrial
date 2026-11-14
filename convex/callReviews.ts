/**
 * Call reviews on request (Dealmaker, Conversation Intelligence; docs/rebuild/dealmaker.md, 0.8 and 4.2). A
 * person picks a call: a transcript shared with Dealmaker, the closer's notes, or both. The review runs as
 * Dealmaker's work after the budget is confirmed. The review itself waits for no approval (answer 12.3); what
 * it files does: the recap is a Comms draft and every CRM update an approval.
 *
 * Coaching notes are the Owner's only (0.8): `review` strips them for everyone else.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { capsFor, previewChoice, skillNeeds } from "./lib/modelChoice";
import { requireWork } from "./lib/roles";
import { startRunFor } from "./runs";
import { REVIEW_LIMITS, SKILL_SLUG } from "./skills/callReview/shapes";

export const REVIEW_TEXT = {
  budgetMoved: "The budget changed. Check the new one and confirm again.",
  nothing: "Pick a call transcript or the notes from a call.",
  notShared: "That call is not shared with Dealmaker.",
  noNote: "Those call notes are not here.",
  twoLeads: "The transcript and the notes are about different leads.",
  running: "A review of this call is already being written.",
} as const;

async function budgetCaps(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }) {
  const choice = await previewChoice(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, picked: undefined, needs: skillNeeds(SKILL_SLUG) });
  return capsFor(ctx, { workspaceId: ctx.workspaceId, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, choice });
}

/** The most one review may use, in credits, shown before a person confirms. */
export const quote = workspaceQuery({
  args: {},
  handler: async (ctx) => ({ maxCredits: priceFor((await budgetCaps(ctx)).maxCostCentsPerRun) }),
});

export const request = workspaceMutation({
  args: {
    clientId: v.optional(v.id("clients")),
    transcriptId: v.optional(v.id("callTranscripts")),
    callNoteId: v.optional(v.id("callNotes")),
    confirmedCredits: v.number(),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    if (args.confirmedCredits !== priceFor((await budgetCaps(ctx)).maxCostCentsPerRun)) throw userError(REVIEW_TEXT.budgetMoved);
    if (!args.transcriptId && !args.callNoteId) throw userError(REVIEW_TEXT.nothing);
    const transcript = args.transcriptId ? await ctx.db.get(args.transcriptId) : null;
    if (args.transcriptId && (!transcript || transcript.workspaceId !== ctx.workspaceId || transcript.clientId !== forClient.clientId || !(transcript.agents ?? []).includes(SALES_CONVERSION))) throw userError(REVIEW_TEXT.notShared);
    const note = args.callNoteId ? await ctx.db.get(args.callNoteId) : null;
    if (args.callNoteId && (!note || note.workspaceId !== ctx.workspaceId || note.clientId !== forClient.clientId)) throw userError(REVIEW_TEXT.noNote);
    const contactRef = transcript?.crmContactRef ?? note?.contactRef;
    if (transcript?.crmContactRef && note?.contactRef && transcript.crmContactRef !== note.contactRef) throw userError(REVIEW_TEXT.twoLeads);
    const dealRef = transcript?.crmDealRef ?? note?.dealRef;
    if (args.transcriptId) {
      const open = await ctx.db
        .query("callReviews")
        .withIndex("by_workspace_transcript", (q) => q.eq("workspaceId", ctx.workspaceId).eq("transcriptId", args.transcriptId))
        .collect();
      if (open.some((row) => row.status === "running")) throw userError(REVIEW_TEXT.running);
    }
    const crm = await crmFor(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    const contact = crm && contactRef ? await crm.contact(contactRef) : null;
    const leadName = (contact?.name ?? note?.leadName ?? transcript?.title ?? "A lead").slice(0, REVIEW_LIMITS.leadName);
    const now = Date.now();
    const projectId = await ctx.db.insert("researchProjects", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      title: `Call review: ${leadName}`.slice(0, 80),
      objective: "What happened on one sales call, and what comes next.",
      market: "",
      geography: "",
      competitors: [],
      platforms: ["customerData"],
      suppliedUrls: [],
      status: "draft",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    const reviewId = await ctx.db.insert("callReviews", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      projectId,
      ...(transcript ? { transcriptId: transcript._id } : {}),
      ...(note ? { callNoteId: note._id } : {}),
      ...(contact ? { contactRef: contact.ref } : {}),
      ...(contact && dealRef ? { dealRef } : {}),
      leadName,
      status: "running",
      createdBy: ctx.identity.subject,
      createdAt: now,
    });
    const runId = await startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, projectId });
    await ctx.db.patch(reviewId, { runId });
    // The audit row names the review only, never the lead.
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "callReview.requested", subject: reviewId });
    return { reviewId, runId };
  },
});

type ReviewState = "running" | "ready" | "needsReview" | "failed";

async function stateOf(ctx: Pick<QueryCtx, "db">, row: Doc<"callReviews">): Promise<ReviewState> {
  if (row.status === "ready") return row.view?.checksPassed ? "ready" : "needsReview";
  if (row.status === "failed") return "failed";
  const run = row.runId ? await ctx.db.get(row.runId) : null;
  return run && run.status !== "queued" && run.status !== "running" ? "failed" : "running";
}

/** One review as the Calls tab draws it. Coaching notes only for the Owner. */
export const review = workspaceQuery({
  args: { reviewId: v.id("callReviews") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reviewId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(row.clientId);
    const state = await stateOf(ctx, row);
    return {
      id: row._id,
      leadName: row.leadName,
      state,
      view: row.view ?? null,
      coaching: ctx.role === "owner" ? (row.coaching ?? []) : null,
      createdAt: row.createdAt,
    };
  },
});

/** Reviews made lately for the organization or a client, newest first. */
export const recent = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client || client.workspaceId !== ctx.workspaceId) notFound();
    }
    ctx.clients.require(args.clientId);
    const rows = await ctx.db
      .query("callReviews")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", args.clientId))
      .order("desc")
      .take(20);
    const caps = await budgetCaps(ctx);
    return {
      canRequest: ctx.role !== "viewer",
      maxCredits: priceFor(caps.maxCostCentsPerRun),
      reviews: await Promise.all(rows.map(async (row) => ({ id: row._id, leadName: row.leadName, state: await stateOf(ctx, row), createdAt: row.createdAt }))),
    };
  },
});
