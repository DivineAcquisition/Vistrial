/**
 * The organizations a person can open, and adding another to an account. An organization is one of the
 * account owner's own businesses (a row in `workspaces`). docs/rebuild/organizations-and-clients.md.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { writeAudit } from "./lib/audit";
import { signedInMutation, signedInQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { createWorkspaceFor } from "./lib/newWorkspace";
import { ADD_ORGANIZATION_CLOSED, MAX_ORGANIZATIONS, accountMember, addingOrganizationsOpen, organizationsOf } from "./lib/organizations";
import { roleOf } from "./lib/roles";

const MAX_NAME = 80;

/**
 * Every organization the signed-in person can open, oldest first, and each account they are on. This is
 * what the organization selector lists. An organization they have no member row in is never here, even
 * when it belongs to an account they are on.
 */
export const mine = signedInQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .take(200);
    const organizations = [];
    for (const member of memberships) {
      if (!member.active) continue;
      const workspace = await ctx.db.get(member.workspaceId);
      if (!workspace || workspace.status !== "active") continue;
      const settings = await ctx.db
        .query("workspaceSettings")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .unique();
      organizations.push({
        workspaceId: workspace._id,
        name: workspace.name,
        role: roleOf(member.role),
        accountId: workspace.accountId ?? null,
        setupDone: settings?.setupDone ?? false,
        createdAt: workspace.createdAt,
      });
    }
    organizations.sort((a, b) => a.createdAt - b.createdAt);

    const accountRows = await ctx.db
      .query("accountMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .take(50);
    const accounts = [];
    for (const row of accountRows) {
      if (!row.active) continue;
      const account = await ctx.db.get(row.accountId);
      if (!account) continue;
      const count = (await organizationsOf(ctx, account._id)).length;
      accounts.push({
        accountId: account._id,
        name: account.name,
        owner: row.role === "owner",
        organizations: count,
        /** Only an Owner adds an organization, and only where adding is switched on. */
        canAdd: row.role === "owner" && addingOrganizationsOpen() && count < MAX_ORGANIZATIONS,
        addClosedReason: row.role === "owner" && !addingOrganizationsOpen() ? ADD_ORGANIZATION_CLOSED : null,
      });
    }
    return { organizations, accounts };
  },
});

/**
 * Adds another organization to an account. Owners of the account only. Every Owner of the account becomes
 * an Owner in it; nobody else can open it until they are given a role there.
 */
export const create = signedInMutation({
  args: { accountId: v.id("accounts"), name: v.string() },
  handler: async (ctx, args): Promise<Id<"workspaces">> => {
    const account = await ctx.db.get(args.accountId);
    const me = account ? await accountMember(ctx, account._id, ctx.userId) : null;
    // Someone who is not on the account learns nothing about it.
    if (!account || !me || !me.active) notFound();
    if (me.role !== "owner") throw userError("Only an Owner of the account can add an organization.", "not_allowed");
    if (!addingOrganizationsOpen()) throw userError(ADD_ORGANIZATION_CLOSED, "not_allowed");
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name) throw userError("Name the organization.");
    if (name.length > MAX_NAME) throw userError(`Keep the name under ${MAX_NAME} characters.`);
    const existing = await organizationsOf(ctx, account._id);
    if (existing.length >= MAX_ORGANIZATIONS) throw userError(`An account can hold ${MAX_ORGANIZATIONS} organizations. Contact us if you need more.`, "limit");
    if (existing.some((row) => row.name.trim().toLowerCase() === name.toLowerCase())) throw userError("You already have an organization with that name.");
    const first = existing[0];
    const firstSettings = first
      ? await ctx.db
          .query("workspaceSettings")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", first._id))
          .unique()
      : null;
    const workspaceId = await createWorkspaceFor(ctx, {
      userId: ctx.userId,
      displayName: me.displayName || ctx.name,
      email: me.email ?? (ctx.email || undefined),
      name,
      timezone: first?.timezone,
      defaultCountry: firstSettings?.defaultCountry,
      accountId: account._id,
    });
    await writeAudit(ctx, { workspaceId, actorType: "user", actorId: ctx.userId, action: "organization.added", subject: account._id, count: existing.length + 1 });
    return workspaceId;
  },
});

/** The account's name, shown on Billing and when a person is on more than one account. Owners only. */
export const renameAccount = signedInMutation({
  args: { accountId: v.id("accounts"), name: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    const me = account ? await accountMember(ctx, account._id, ctx.userId) : null;
    if (!account || !me || !me.active) notFound();
    if (me.role !== "owner") throw userError("Only an Owner of the account can rename it.", "not_allowed");
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name) throw userError("Name the account.");
    if (name.length > MAX_NAME) throw userError(`Keep the name under ${MAX_NAME} characters.`);
    await ctx.db.patch(account._id, { name });
    return null;
  },
});

