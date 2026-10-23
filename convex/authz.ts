import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function requireUser(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in required.");
  return identity;
}

export async function activeMembership(ctx: Ctx, userId: string): Promise<Doc<"members"> | null> {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.find((row) => row.active) ?? null;
}

export async function requireMember(ctx: Ctx) {
  const identity = await requireUser(ctx);
  const member = await activeMembership(ctx, identity.subject);
  if (!member) throw new Error("You need a workspace.");
  return { identity, member };
}

export function requireOwner(member: Doc<"members">) {
  if (member.role !== "owner") throw new Error("Only an owner can change that.");
}
