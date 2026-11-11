/**
 * What the access builders read from inside an action. Internal only: an action cannot open the database,
 * so `memberAction` asks here whether the caller belongs to the organization.
 */
import { v } from "convex/values";

import { internalQuery } from "./_generated/server";

/** The caller's stored role in this organization, or null when they are not an active member of it. */
export const memberRole = internalQuery({
  args: { workspaceId: v.id("workspaces"), userId: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", args.userId))
      .unique();
    return member?.active ? member.role : null;
  },
});
