/**
 * Accounts and the organizations under them. An organization is a row in `workspaces`; an account is who
 * pays for one or more of them. docs/rebuild/organizations-and-clients.md.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { autumnMode, billingOn } from "./billing";
import { isOwner } from "./roles";

type Ctx = QueryCtx | MutationCtx;

/** The most organizations one account may hold. A guard against a runaway loop, not a product limit. */
export const MAX_ORGANIZATIONS = 25;

export const ADD_ORGANIZATION_CLOSED = "Adding another organization is not switched on yet. Contact us and we will add it for you.";

/**
 * Whether an Owner may add an organization right now. Each one after the first is paid for, and the
 * payment is not built in this step, so on a deployment that charges real money this stays closed. Where
 * billing is off (local, tests) or in Stripe test mode it is open.
 */
export function addingOrganizationsOpen(): boolean {
  return !billingOn() || autumnMode() === "test";
}

export async function organizationsOf(ctx: Ctx, accountId: Id<"accounts">) {
  const rows = await ctx.db
    .query("workspaces")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .take(MAX_ORGANIZATIONS + 5);
  return rows.filter((row) => row.status === "active").sort((a, b) => a.createdAt - b.createdAt);
}

export async function accountMember(ctx: Ctx, accountId: Id<"accounts">, userId: string) {
  return ctx.db
    .query("accountMembers")
    .withIndex("by_account_user", (q) => q.eq("accountId", accountId).eq("userId", userId))
    .unique();
}

export async function activeAccountOwners(ctx: Ctx, accountId: Id<"accounts">) {
  const rows = await ctx.db
    .query("accountMembers")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .take(500);
  return rows.filter((row) => row.active && row.role === "owner");
}

/** Adds the person to the account, or brings their row up to date. Never lowers an owner. */
export async function upsertAccountMember(
  ctx: MutationCtx,
  input: { accountId: Id<"accounts">; userId: string; role: "owner" | "member"; displayName: string; email?: string; active?: boolean },
) {
  const row = await accountMember(ctx, input.accountId, input.userId);
  const active = input.active ?? true;
  if (!row) {
    return ctx.db.insert("accountMembers", {
      accountId: input.accountId,
      userId: input.userId,
      role: input.role,
      displayName: input.displayName,
      active,
      ...(input.email ? { email: input.email } : {}),
      ...(active ? {} : { removedAt: Date.now() }),
    });
  }
  const role = row.role === "owner" && row.active ? "owner" : input.role;
  await ctx.db.patch(row._id, {
    role,
    displayName: input.displayName || row.displayName,
    ...(input.email ? { email: input.email } : {}),
    ...(active || row.active ? { active: true, removedAt: undefined } : {}),
  });
  return row._id;
}

/** Makes the account for a workspace that has none, with the workspace's own id as its billing customer. */
export async function accountForWorkspace(ctx: MutationCtx, workspace: Doc<"workspaces">, createdBy: string): Promise<Id<"accounts">> {
  if (workspace.accountId) return workspace.accountId;
  const accountId = await ctx.db.insert("accounts", {
    name: workspace.name,
    billingCustomerId: workspace._id,
    createdBy,
    createdAt: Date.now(),
  });
  await ctx.db.patch(workspace._id, { accountId });
  return accountId;
}

/** The person's member row in an organization, made or brought back with the given role. */
export async function upsertMember(
  ctx: MutationCtx,
  input: { workspaceId: Id<"workspaces">; userId: string; role: Doc<"members">["role"]; displayName: string; email?: string },
) {
  const earlier = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", input.workspaceId).eq("userId", input.userId))
    .unique();
  if (!earlier) {
    return ctx.db.insert("members", {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      displayName: input.displayName,
      active: true,
      ...(input.email ? { email: input.email } : {}),
    });
  }
  // An invite or a grant never lowers someone who is already an active Owner here.
  const role = earlier.active && isOwner(earlier.role) ? earlier.role : input.role;
  await ctx.db.patch(earlier._id, {
    role,
    displayName: input.displayName || earlier.displayName,
    ...(input.email ? { email: input.email } : {}),
    active: true,
    removedAt: undefined,
  });
  return earlier._id;
}

/** When the person holds no organization of the account any more, their account row is closed too. */
export async function closeAccountMemberIfUnused(ctx: MutationCtx, accountId: Id<"accounts">, userId: string) {
  const organizations = await organizationsOf(ctx, accountId);
  for (const organization of organizations) {
    const row = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", organization._id).eq("userId", userId))
      .unique();
    if (row?.active) return;
  }
  const row = await accountMember(ctx, accountId, userId);
  if (row?.active) await ctx.db.patch(row._id, { active: false, removedAt: Date.now() });
}
