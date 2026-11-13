import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { signedInMutation, signedInQuery } from "./lib/builders";
import { userError } from "./lib/errors";
import { closeAccountMemberIfUnused } from "./lib/organizations";
import { isOwner } from "./lib/roles";

/**
 * Leaving Vistrial for good. The sign-in itself is deleted by Clerk from the browser; this file
 * takes the person out of every organization first, so no organization is left listing someone who
 * can no longer sign in. An organization is never left without an Owner: its last Owner has to hand
 * it on, or ask us to close it, before they can go.
 */

type Membership = { row: Doc<"members">; name: string; lastOwner: boolean };

async function memberships(ctx: QueryCtx | MutationCtx, userId: string): Promise<Membership[]> {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const out: Membership[] = [];
  for (const row of rows) {
    if (!row.active) continue;
    const workspace = await ctx.db.get(row.workspaceId);
    if (!workspace || workspace.status !== "active") {
      out.push({ row, name: workspace?.name ?? "An organization", lastOwner: false });
      continue;
    }
    let lastOwner = false;
    if (isOwner(row.role)) {
      const others = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", row.workspaceId))
        .collect();
      lastOwner = !others.some((other) => other.active && other.userId !== userId && isOwner(other.role));
    }
    out.push({ row, name: workspace.name, lastOwner });
  }
  return out;
}

/** What deleting the account would do, shown before the person commits to it. */
export const closing = signedInQuery({
  args: {},
  handler: async (ctx) => {
    const all = await memberships(ctx, ctx.userId);
    return {
      /** Organizations the person would simply leave. */
      leaves: all.filter((item) => !item.lastOwner).map((item) => item.name),
      /** Organizations that would be left with no Owner. Any of these blocks the delete. */
      blockedBy: all.filter((item) => item.lastOwner).map((item) => item.name),
    };
  },
});

/**
 * Takes the signed-in person out of every organization. Refuses, changing nothing, while they are
 * the only Owner of one. Safe to run twice: the second run finds nothing left to leave.
 */
export const leaveEverything = signedInMutation({
  args: {},
  handler: async (ctx) => {
    const all = await memberships(ctx, ctx.userId);
    const blockedBy = all.filter((item) => item.lastOwner).map((item) => item.name);
    if (blockedBy.length > 0) {
      throw userError(`You are the only Owner of ${blockedBy.join(", ")}. Make someone else an Owner first, or ask us to close it.`, "not_allowed");
    }
    const now = Date.now();
    for (const { row } of all) {
      await ctx.db.patch(row._id, { active: false, removedAt: now });
      const workspace = await ctx.db.get(row.workspaceId);
      if (workspace?.accountId) await closeAccountMemberIfUnused(ctx, workspace.accountId, ctx.userId);
      await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "user", actorId: ctx.userId, action: "member.left", subject: row._id });
    }
    return { left: all.length };
  },
});
