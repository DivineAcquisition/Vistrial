import { v } from "convex/values";

import { staffMutation, staffQuery, openGrant } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notFound } from "./lib/errors";

const HOUR_MS = 60 * 60 * 1000;

export const listMine = staffQuery({
  args: {},
  handler: async (ctx) => {
    const grants = await ctx.db
      .query("staffAccessGrants")
      .withIndex("by_staff", (q) => q.eq("staffUserId", ctx.identity.subject))
      .take(50);
    const now = Date.now();
    return grants
      .filter((row) => row.revokedAt === undefined && row.expiresAt > now)
      .map((row) => ({ id: row._id, workspaceId: row.workspaceId, expiresAt: row.expiresAt }));
  },
});

export const grant = staffMutation({
  args: {
    workspaceId: v.id("workspaces"),
    reason: v.string(),
    hours: v.number(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) notFound();
    const reason = args.reason.trim();
    if (reason.length < 8) throw new Error("A reason is required.");
    if (args.hours < 1 || args.hours > 72) throw new Error("Choose a grant between 1 and 72 hours.");
    const now = Date.now();
    const grantId = await ctx.db.insert("staffAccessGrants", {
      staffUserId: ctx.identity.subject,
      workspaceId: args.workspaceId,
      reason,
      startsAt: now,
      expiresAt: now + args.hours * HOUR_MS,
    });
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: "staff.grant_created",
      subject: grantId,
      count: args.hours,
    });
    return grantId;
  },
});

export const enter = staffMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { workspace, grant: open } = await openGrant(ctx, ctx.identity.subject, args.workspaceId);
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: "staff.entered",
      subject: open._id,
    });
    return { id: workspace._id, name: workspace.name };
  },
});
