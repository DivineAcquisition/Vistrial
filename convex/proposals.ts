/**
 * Proposals on request (Dealmaker, Proposal Architect; docs/rebuild/dealmaker.md, 0.8 and 4.5). A person picks a
 * call review that passed its checks; Dealmaker writes a proposal from the lead's own words and the Offer folder
 * after the budget is confirmed. It never sets a price. The proposal goes to a lead, so it waits for a person's
 * review in the approvals queue; sending it is a separate step.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { capsFor, previewChoice, skillNeeds } from "./lib/modelChoice";
import { itemsOf } from "./lib/playbook";
import { requireWork } from "./lib/roles";
import { startRunFor } from "./runs";
import { PROPOSAL_LIMITS, SKILL_SLUG } from "./skills/proposalArchitect/shapes";

export const PROPOSAL_TEXT = {
  budgetMoved: "The budget changed. Check the new one and confirm again.",
  notPassed: "Only a call review that passed its checks can become a proposal.",
  noOffer: "Add a package and the price a proposal may use to the Playbook's Offer folder first.",
  running: "A proposal for this call is already being written.",
} as const;

async function budgetCaps(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }) {
  const choice = await previewChoice(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, picked: undefined, needs: skillNeeds(SKILL_SLUG) });
  return capsFor(ctx, { workspaceId: ctx.workspaceId, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, choice });
}

/** The most one proposal may use, in credits, shown before a person confirms. */
export const quote = workspaceQuery({
  args: {},
  handler: async (ctx) => ({ maxCredits: priceFor((await budgetCaps(ctx)).maxCostCentsPerRun) }),
});

type ProposalState = "running" | "ready" | "needsReview" | "failed";

async function stateOf(ctx: Pick<QueryCtx, "db">, row: Doc<"proposals">): Promise<ProposalState> {
  if (row.status === "ready") return row.view?.checksPassed ? "ready" : "needsReview";
  if (row.status === "failed") return "failed";
  const run = row.runId ? await ctx.db.get(row.runId) : null;
  return run && run.status !== "queued" && run.status !== "running" ? "failed" : "running";
}

async function shown(ctx: Pick<QueryCtx, "db">, row: Doc<"proposals">, canRequest: boolean) {
  const asset = row.assetId ? await ctx.db.get(row.assetId) : null;
  return {
    id: row._id,
    reviewId: row.reviewId,
    leadName: row.leadName,
    state: await stateOf(ctx, row),
    view: row.view ?? null,
    /** A person approved it in the approvals queue: it may now be sent. */
    approved: asset?.status === "approved",
    canRequest,
    createdAt: row.createdAt,
  };
}

export const request = workspaceMutation({
  args: { reviewId: v.id("callReviews"), confirmedCredits: v.number() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(review.clientId);
    if (review.status !== "ready" || !review.view?.checksPassed) throw userError(PROPOSAL_TEXT.notPassed);
    if (args.confirmedCredits !== priceFor((await budgetCaps(ctx)).maxCostCentsPerRun)) throw userError(PROPOSAL_TEXT.budgetMoved);
    const scope = { workspaceId: ctx.workspaceId, ...(review.clientId ? { clientId: review.clientId } : {}) };
    const offer = (await itemsOf(ctx, scope)).filter((row) => row.folder === "offer");
    if (!offer.some((row) => row.kind === "package") || !offer.some((row) => row.kind === "price")) throw userError(PROPOSAL_TEXT.noOffer);
    const earlier = await ctx.db
      .query("proposals")
      .withIndex("by_workspace_review", (q) => q.eq("workspaceId", ctx.workspaceId).eq("reviewId", review._id))
      .collect();
    for (const row of earlier) if ((await stateOf(ctx, row)) === "running") throw userError(PROPOSAL_TEXT.running);
    const now = Date.now();
    const leadName = review.leadName.slice(0, PROPOSAL_LIMITS.leadName);
    const projectId = await ctx.db.insert("researchProjects", {
      ...scope,
      title: `Proposal: ${leadName}`.slice(0, 80),
      objective: "A proposal for one lead, from what they said on the call and the approved offer.",
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
    const proposalId = await ctx.db.insert("proposals", {
      ...scope,
      projectId,
      reviewId: review._id,
      ...(review.contactRef ? { contactRef: review.contactRef } : {}),
      ...(review.dealRef ? { dealRef: review.dealRef } : {}),
      leadName,
      status: "running",
      createdBy: ctx.identity.subject,
      createdAt: now,
    });
    const runId = await startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, projectId });
    await ctx.db.patch(proposalId, { runId });
    // The audit row names the proposal only, never the lead.
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "proposal.requested", subject: proposalId });
    return { proposalId, runId };
  },
});

/** One proposal as the Calls tab draws it. */
export const proposal = workspaceQuery({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.proposalId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(row.clientId);
    return shown(ctx, row, ctx.role !== "viewer");
  },
});

/** The newest proposal for one call review, if any, and what asking for one would cost. */
export const forReview = workspaceQuery({
  args: { reviewId: v.id("callReviews") },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(review.clientId);
    const rows = await ctx.db
      .query("proposals")
      .withIndex("by_workspace_review", (q) => q.eq("workspaceId", ctx.workspaceId).eq("reviewId", review._id))
      .collect();
    const latest = rows.sort((a, b) => b.createdAt - a.createdAt)[0];
    const scope = { workspaceId: ctx.workspaceId, ...(review.clientId ? { clientId: review.clientId } : {}) };
    const offer = (await itemsOf(ctx, scope)).filter((row) => row.folder === "offer");
    const offerReady = offer.some((row) => row.kind === "package") && offer.some((row) => row.kind === "price");
    const canRequest = ctx.role !== "viewer" && review.status === "ready" && Boolean(review.view?.checksPassed) && offerReady;
    return {
      latest: latest ? await shown(ctx, latest, canRequest) : null,
      canRequest,
      blocked: !review.view?.checksPassed ? PROPOSAL_TEXT.notPassed : !offerReady ? PROPOSAL_TEXT.noOffer : null,
      maxCredits: priceFor((await budgetCaps(ctx)).maxCostCentsPerRun),
    };
  },
});
