import { v } from "convex/values";

import { writeAudit } from "./audit";
import { requireUser } from "./authz";
import { mutation } from "./_generated/server";

const HOUR_MS = 60 * 60 * 1000;

async function requireStaff(ctx: Parameters<typeof requireUser>[0]) {
  const identity = await requireUser(ctx);
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_user", (q) => q.eq("userId", identity.subject))
    .unique();
  if (!staff) throw new Error("Staff only.");
  return { identity, staff };
}

export const grant = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    reason: v.string(),
    hours: v.number(),
  },
  handler: async (ctx, args) => {
    const { identity, staff } = await requireStaff(ctx);
    if (!staff.mfaEnrolled) throw new Error("Second factor is required.");
    const reason = args.reason.trim();
    if (reason.length < 8) throw new Error("A reason is required.");
    if (args.hours < 1 || args.hours > 72) throw new Error("Choose a grant between 1 and 72 hours.");
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("That workspace is not available.");
    const now = Date.now();
    const grantId = await ctx.db.insert("staffAccessGrants", {
      staffUserId: identity.subject,
      workspaceId: args.workspaceId,
      reason,
      startsAt: now,
      expiresAt: now + args.hours * HOUR_MS,
    });
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorType: "staff",
      actorId: identity.subject,
      action: "staff.grant_created",
      subject: grantId,
      detail: { hours: String(args.hours), role: staff.role },
    });
    return grantId;
  },
});

export const enter = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { identity } = await requireStaff(ctx);
    const now = Date.now();
    const grants = await ctx.db
      .query("staffAccessGrants")
      .withIndex("by_staff", (q) => q.eq("staffUserId", identity.subject))
      .collect();
    const open = grants.find(
      (row) =>
        row.workspaceId === args.workspaceId &&
        row.revokedAt === undefined &&
        row.startsAt <= now &&
        row.expiresAt > now,
    );
    if (!open) return null;
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return null;
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorType: "staff",
      actorId: identity.subject,
      action: "staff.entered",
      subject: open._id,
      detail: {},
    });
    return { id: workspace._id, name: workspace.name };
  },
});
