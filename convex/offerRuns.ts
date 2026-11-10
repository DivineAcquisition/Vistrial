/**
 * Running Offer Intelligence from a saved offer. Kept apart from `offers.ts` because the skill itself reads
 * that module, and starting a run loads every skill.
 */

import { v } from "convex/values";

import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { workspaceMutation } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";
import { liveFact, writeFact } from "./lib/facts";
import { offerDetailsText } from "./lib/offerCards";
import { OPEN_RUN, contentOf, ownCard, versionsOf } from "./offers";
import { startRunFor } from "./runs";

/**
 * "Analyse this offer": runs Offer Intelligence on the card's saved, current version. The card is what the
 * business states about its offer, so it is written to memory as the owner's words first; the run then sets
 * it beside competitors from approved research. Goes through the run path's own caps and credit check.
 * Owners and Managers.
 */
export const analyse = workspaceMutation({
  args: { cardId: v.id("offerCards") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const card = await ownCard(ctx, ctx.workspaceId, args.cardId);
    if (card.archived) throw userError("This offer was put away.");
    const versions = await versionsOf(ctx, ctx.workspaceId, card._id);
    const current = versions.find((row) => row.version === card.currentVersion);
    if (!current) notFound();
    const approved = await ctx.db
      .query("assets")
      .withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", "marketReport").eq("status", "approved"))
      .first();
    if (!approved) throw userError("Approve a market report first. The analysis sets your offer beside competitors from approved research only.");
    for (const row of card.analyses ?? []) {
      const run = await ctx.db.get(row.runId);
      if (run && OPEN_RUN.includes(run.status)) throw userError("An analysis of this offer is already running.");
    }
    const details = offerDetailsText(contentOf(current));
    if ((await liveFact(ctx, ctx.workspaceId, "offerDetails"))?.value !== details) {
      await writeFact(ctx, { workspaceId: ctx.workspaceId, sourceType: "owner", recordedBy: ctx.identity.subject, verifiedBy: ctx.identity.subject, factKey: "offerDetails", value: details });
    }
    const runId = await startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: GROWTH_ARCHITECT, skillSlug: "offer-intelligence" });
    const now = Date.now();
    await ctx.db.patch(card._id, { analyses: [...(card.analyses ?? []), { runId, version: current.version, at: now }].slice(-20), updatedAt: now });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "offer.analyse", subject: card._id, count: current.version });
    return { runId, version: current.version };
  },
});
