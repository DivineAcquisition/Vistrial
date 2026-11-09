import { v } from "convex/values";

import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound, userError } from "./lib/errors";
import { writeFact } from "./lib/facts";

/** Feedback on one asset, or the workspace's latest. Every member can read it. */
export const list = workspaceQuery({
  args: { assetId: v.optional(v.id("assets")) },
  handler: async (ctx, args) => {
    const rows = args.assetId
      ? await ctx.db
          .query("feedback")
          .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", args.assetId!))
          .order("desc")
          .take(100)
      : await ctx.db
          .query("feedback")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
          .order("desc")
          .take(100);
    return rows.map((row) => ({
      id: row._id,
      assetId: row.assetId,
      assetVersionId: row.assetVersionId,
      kind: row.kind,
      reason: row.reason,
      createdAt: row.createdAt,
      promotedFactId: row.promotedFactId ?? null,
    }));
  },
});

/**
 * A person turns feedback into a business fact, for example "Do not lead with price". Promoting is a
 * person confirming it, so the fact is verified, with the feedback as its source. Never automatic.
 */
export const promote = workspaceMutation({
  args: { feedbackId: v.id("feedback"), factKey: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const row = await ctx.db.get(args.feedbackId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    if (row.promotedFactId) throw userError("This feedback is already a business fact.");
    const factId = await writeFact(ctx, {
      workspaceId: ctx.workspaceId,
      factKey: args.factKey,
      value: args.value,
      sourceType: "feedback",
      sourceReference: row._id,
      recordedBy: ctx.identity.subject,
      verifiedBy: ctx.identity.subject,
    });
    await ctx.db.patch(row._id, { promotedFactId: factId });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "feedback.promoted",
      subject: row._id,
    });
    return factId;
  },
});
