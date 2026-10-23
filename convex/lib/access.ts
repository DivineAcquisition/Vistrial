import type { Doc } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { UserIdentity } from "convex/server";

import { notFound } from "./errors";

type Ctx = QueryCtx | MutationCtx;

/**
 * Clerk puts this on the session token from the token settings.
 * It is never accepted as a function argument.
 * Only the boolean true counts. A missing claim, false, or a string is refused.
 */
export function hasSecondFactor(identity: UserIdentity): boolean {
  return identity.secondFactor === true;
}

export async function requireIdentity(ctx: Ctx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) notFound();
  return identity;
}

export async function requireMember(ctx: Ctx, workspaceId: Id<"workspaces">) {
  const identity = await requireIdentity(ctx);
  const workspace = await ctx.db.get(workspaceId);
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", identity.subject))
    .unique();
  if (!workspace || !member || !member.active) notFound();
  return { identity, member, workspaceId };
}

export async function activeMembership(ctx: Ctx, userId: string): Promise<Doc<"members"> | null> {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(5);
  return rows.find((row) => row.active) ?? null;
}

export async function requireStaff(ctx: Ctx) {
  const identity = await requireIdentity(ctx);
  if (!hasSecondFactor(identity)) notFound();
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_user", (q) => q.eq("userId", identity.subject))
    .unique();
  if (!staff) notFound();
  return { identity, staff };
}

export async function requireGrant(ctx: Ctx, staffUserId: string, workspaceId: Id<"workspaces">) {
  const workspace = await ctx.db.get(workspaceId);
  const now = Date.now();
  const grants = await ctx.db
    .query("staffAccessGrants")
    .withIndex("by_staff_workspace", (q) => q.eq("staffUserId", staffUserId).eq("workspaceId", workspaceId))
    .take(10);
  const open = grants.find(
    (row) => row.revokedAt === undefined && row.startsAt <= now && row.expiresAt > now,
  );
  if (!workspace || !open) notFound();
  return { workspace, grant: open };
}
