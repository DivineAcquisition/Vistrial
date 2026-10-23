import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { writeAudit } from "./lib/audit";

async function revokeGrants(ctx: { db: import("./_generated/server").MutationCtx["db"] }, userId: string) {
  const grants = await ctx.db
    .query("staffAccessGrants")
    .withIndex("by_staff", (q) => q.eq("staffUserId", userId))
    .take(100);
  const now = Date.now();
  for (const grant of grants) {
    if (grant.revokedAt === undefined) await ctx.db.patch(grant._id, { revokedAt: now });
  }
}

export const enroll = internalMutation({
  args: {
    userId: v.string(),
    role: v.union(v.literal("platform_admin"), v.literal("service_team")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId.trim();
    if (!userId) throw new Error("Not found.");
    const existing = await ctx.db
      .query("staff")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) throw new Error("Already enrolled.");
    const staffId = await ctx.db.insert("staff", { userId, role: args.role });
    await writeAudit(ctx, {
      actorType: "system",
      actorId: "system",
      action: "staff.enrolled",
      subject: staffId,
    });
    return staffId;
  },
});

export const remove = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = args.userId.trim();
    const existing = await ctx.db
      .query("staff")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing) throw new Error("Not found.");
    await revokeGrants(ctx, userId);
    await ctx.db.delete(existing._id);
    await writeAudit(ctx, {
      actorType: "system",
      actorId: "system",
      action: "staff.removed",
      subject: existing._id,
    });
    return null;
  },
});

export const rotate = internalMutation({
  args: {
    fromUserId: v.string(),
    toUserId: v.string(),
    role: v.union(v.literal("platform_admin"), v.literal("service_team")),
  },
  handler: async (ctx, args) => {
    const fromUserId = args.fromUserId.trim();
    const toUserId = args.toUserId.trim();
    if (!fromUserId || !toUserId || fromUserId === toUserId) throw new Error("Not found.");
    const from = await ctx.db
      .query("staff")
      .withIndex("by_user", (q) => q.eq("userId", fromUserId))
      .unique();
    if (!from) throw new Error("Not found.");
    const already = await ctx.db
      .query("staff")
      .withIndex("by_user", (q) => q.eq("userId", toUserId))
      .unique();
    if (already) throw new Error("Already enrolled.");
    await revokeGrants(ctx, fromUserId);
    await ctx.db.delete(from._id);
    await writeAudit(ctx, {
      actorType: "system",
      actorId: "system",
      action: "staff.removed",
      subject: from._id,
    });
    const staffId = await ctx.db.insert("staff", { userId: toUserId, role: args.role });
    await writeAudit(ctx, {
      actorType: "system",
      actorId: "system",
      action: "staff.enrolled",
      subject: staffId,
    });
    return staffId;
  },
});
