import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { accountForWorkspace, upsertAccountMember } from "./lib/organizations";
import { isOwner, roleOf } from "./lib/roles";

/**
 * Moves every workspace that existed before accounts did onto the new shape
 * (docs/rebuild/organizations-and-clients.md, section 5):
 *
 *   1. each workspace gets an account of its own, whose billing customer id is the workspace's id, so the
 *      customer Autumn already holds is reused and nothing moves there;
 *   2. each of its members gets a row on that account (an owner stays an owner);
 *   3. roles are rewritten: manager becomes admin, rep becomes member;
 *   4. its invitations get the account and the new role words.
 *
 * A cron (convex/crons.ts) calls `backfillIfNeeded` every few minutes on every deployment, so production
 * finishes without anyone running it. To run it by hand: `organizationsMigration:backfill`. Running it
 * again changes nothing: every step looks for its own result first. `organizationsMigration:remaining`
 * must report zero everywhere before the old role words are taken out of the schema.
 */

const WORKSPACES_PER_BATCH = 20;
const ROWS_PER_WORKSPACE = 300;
const OLD_ROLES = ["manager", "rep"] as const;

async function migrateWorkspace(ctx: MutationCtx, workspace: Doc<"workspaces">) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .take(ROWS_PER_WORKSPACE);
  const firstOwner = members
    .filter((row) => isOwner(row.role))
    .sort((a, b) => Number(b.active) - Number(a.active) || a._creationTime - b._creationTime)[0];
  const hadAccount = workspace.accountId !== undefined;
  const accountId = await accountForWorkspace(ctx, workspace, firstOwner?.userId ?? "system");
  for (const member of members) {
    // A workspace made after accounts existed already wrote its account rows; only fill what is missing.
    if (!hadAccount || member.role === "manager" || member.role === "rep") {
      await upsertAccountMember(ctx, {
        accountId,
        userId: member.userId,
        role: isOwner(member.role) && member.active ? "owner" : "member",
        displayName: member.displayName,
        email: member.email,
        active: member.active,
      });
    }
    if (member.role === "manager" || member.role === "rep") await ctx.db.patch(member._id, { role: roleOf(member.role) });
  }
  const invitations = await ctx.db
    .query("invitations")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .take(ROWS_PER_WORKSPACE);
  for (const invitation of invitations) {
    const role = roleOf(invitation.role);
    if (invitation.accountId === accountId && invitation.role === role) continue;
    await ctx.db.patch(invitation._id, { accountId, role: role === "owner" ? "admin" : role });
  }
  return members.length === ROWS_PER_WORKSPACE || invitations.length === ROWS_PER_WORKSPACE;
}

export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("workspaces").paginate({ numItems: WORKSPACES_PER_BATCH, cursor: args.cursor ?? null });
    let more = false;
    for (const workspace of page.page) {
      if (await migrateWorkspace(ctx, workspace)) more = true;
    }
    // A workspace with more rows than one batch holds is visited again from the same cursor.
    const next = more ? (args.cursor ?? null) : page.isDone ? undefined : page.continueCursor;
    if (next !== undefined) await ctx.scheduler.runAfter(0, internal.organizationsMigration.backfill, { cursor: next });
    return { workspaces: page.page.length, done: next === undefined };
  },
});

/** Index reads only, so the cron costs nothing once the work is done. */
async function needsBackfill(ctx: QueryCtx) {
  const orphan = await ctx.db
    .query("workspaces")
    .withIndex("by_account", (q) => q.eq("accountId", undefined))
    .first();
  if (orphan) return true;
  for (const role of OLD_ROLES) {
    if (await ctx.db.query("members").withIndex("by_role", (q) => q.eq("role", role)).first()) return true;
  }
  return false;
}

/** Starts the backfill only when something still needs it. Once nothing does it writes and schedules nothing. */
export const backfillIfNeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(await needsBackfill(ctx))) return false;
    await ctx.scheduler.runAfter(0, internal.organizationsMigration.backfill, {});
    return true;
  },
});

/** What is still on the old shape. All zero means the old role words and the fallbacks can go. */
export const remaining = internalQuery({
  args: {},
  handler: async (ctx) => {
    let workspacesWithoutAccount = 0;
    for await (const row of ctx.db.query("workspaces").withIndex("by_account", (q) => q.eq("accountId", undefined))) {
      void row;
      workspacesWithoutAccount += 1;
    }
    let membersWithOldRole = 0;
    for (const role of OLD_ROLES) {
      for await (const row of ctx.db.query("members").withIndex("by_role", (q) => q.eq("role", role))) {
        void row;
        membersWithOldRole += 1;
      }
    }
    let invitationsWithOldRole = 0;
    for await (const row of ctx.db.query("invitations")) {
      if (row.role === "manager" || row.role === "rep") invitationsWithOldRole += 1;
    }
    return { workspacesWithoutAccount, membersWithOldRole, invitationsWithOldRole };
  },
});

/**
 * For rolling back to the code from before the four roles only: Convex will not deploy a schema that the
 * stored rows do not fit, so admin goes back to manager and member to rep. It refuses while any Viewer
 * exists, because the old roles have nothing to map a Viewer to. Run by hand, never by a cron.
 */
export const revertRoles = internalMutation({
  args: { confirm: v.literal("put the old role words back") },
  handler: async (ctx) => {
    const viewer = await ctx.db.query("members").withIndex("by_role", (q) => q.eq("role", "viewer")).first();
    if (viewer) throw new Error("A Viewer exists. Change every Viewer to another role first.");
    let changed = 0;
    for (const [from, to] of [["admin", "manager"], ["member", "rep"]] as const) {
      const rows = await ctx.db.query("members").withIndex("by_role", (q) => q.eq("role", from)).take(2000);
      for (const row of rows) {
        await ctx.db.patch(row._id, { role: to });
        changed += 1;
      }
    }
    return { changed };
  },
});
