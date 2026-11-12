/**
 * The organizations a person can open, and adding another to an account. An organization is one of the
 * account owner's own businesses (a row in `workspaces`). docs/rebuild/organizations-and-clients.md.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { writeAudit } from "./lib/audit";
import { internal } from "./_generated/api";
import { cancelOpen } from "./controls";
import { ownerMutation, signedInMutation, signedInQuery, workspaceQuery } from "./lib/builders";
import { EXTRA_ORG, accountFor, billingOn, billingOwner, extraOrgsOpen } from "./lib/billing";
import { dollarWords } from "./lib/credits";
import { notFound, userError } from "./lib/errors";
import { createWorkspaceFor } from "./lib/newWorkspace";
import { ADD_ORGANIZATION_CLOSED, MAX_ORGANIZATIONS, accountMember, addingOrganizationsOpen, organizationsOf } from "./lib/organizations";
import { isOwner, roleOf } from "./lib/roles";

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
    /** Archived organizations, for their Owners only: read-only, and they can be brought back. */
    const archived = [];
    for (const member of memberships) {
      if (!member.active) continue;
      const workspace = await ctx.db.get(member.workspaceId);
      if (!workspace) continue;
      if (workspace.status !== "active") {
        if (isOwner(member.role)) archived.push({ workspaceId: workspace._id, name: workspace.name, accountId: workspace.accountId ?? null, archivedAt: workspace.archivedAt ?? null });
        continue;
      }
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
        /** What one more organization costs, to show and confirm before adding. Null where nothing is charged. */
        addPrice: billingOn() ? { priceCents: EXTRA_ORG.priceCents, includedCents: EXTRA_ORG.includedCents } : null,
      });
    }
    return { organizations, accounts, archived };
  },
});

/**
 * Adds another organization to an account where nothing is charged for it (billing off: local and test
 * deployments). Owners of the account only. Every Owner of the account becomes
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
    // Where billing is on, an organization is paid for: it is added through billingActions.addOrganization,
    // which shows the price and takes the Owner's confirmation. This path charges nothing, so it is closed.
    if (billingOn()) throw userError("Add the organization from Billing, where its price is shown and confirmed.", "not_allowed");
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


const FIRST_ORGANIZATION = "This is the account's first organization: the plan and the credit balance are held under it, so it cannot be archived. To stop the plan, use Billing.";

/** What archiving this organization would do to the bill, in words for the confirmation. */
function feeWords(billed: boolean, automatic: boolean): string {
  if (!billed) return "Nothing is charged for it here, so nothing changes on a bill.";
  const price = dollarWords(EXTRA_ORG.priceCents);
  return automatic
    ? `Its ${price} a month stops at your next renewal. There is no refund or credit for the part of this month already paid, and the credits it added stay until then.`
    : `Its ${price} a month does not stop by itself yet. Contact us after archiving and we will stop it from your next renewal.`;
}

/** Whether this organization is archived, and what an Owner can do about it. Any member may read it. */
export const archiveState = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const workspace = await ctx.db.get(ctx.workspaceId);
    if (!workspace) notFound();
    const owner = await billingOwner(ctx, ctx.workspaceId);
    const first = owner.firstWorkspaceId === ctx.workspaceId;
    const active = owner.account ? await organizationsOf(ctx, owner.account._id) : [workspace];
    const mirror = await accountFor(ctx, ctx.workspaceId);
    const paid = mirror?.extraOrganizations ?? 0;
    // Bringing one back needs a paid place for it. Where nothing is charged there is always one.
    const placeFree = !billingOn() || active.length - 1 < paid;
    return {
      archived: workspace.status === "archived",
      archivedAt: workspace.archivedAt ?? null,
      isOwner: isOwner(ctx.role),
      canArchive: isOwner(ctx.role) && workspace.status === "active" && !first,
      cannotArchiveReason: first ? FIRST_ORGANIZATION : null,
      feeWords: feeWords(billingOn(), extraOrgsOpen()),
      canRestore: isOwner(ctx.role) && workspace.status === "archived" && placeFree,
      cannotRestoreReason: placeFree ? null : "Its place on the plan has ended. Contact us and we will bring it back.",
    };
  },
});

/**
 * Archives an organization: it becomes read-only, leaves the selector's main list, and its open runs stop.
 * Owners only. Nothing is deleted, and it can be brought back. The account's first organization cannot be
 * archived, because the plan and the balance are held under its id.
 */
export const archive = ownerMutation({
  /** The Owner typed the organization's name to confirm. */
  args: { confirmName: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(ctx.workspaceId);
    if (!workspace) notFound();
    const owner = await billingOwner(ctx, ctx.workspaceId);
    if (owner.firstWorkspaceId === ctx.workspaceId) throw userError(FIRST_ORGANIZATION, "not_allowed");
    if (args.confirmName.trim().toLowerCase() !== workspace.name.trim().toLowerCase()) throw userError("Type the organization's name exactly to archive it.");
    await ctx.db.patch(workspace._id, { status: "archived", archivedAt: Date.now(), archivedBy: ctx.identity.subject });
    await cancelOpen(ctx, workspace._id, "cancelled");
    await writeAudit(ctx, { workspaceId: workspace._id, actorType: "user", actorId: ctx.identity.subject, action: "organization.archived", subject: workspace._id });
    if (owner.account && billingOn()) await ctx.scheduler.runAfter(0, internal.billingActions.settleExtraOrganizations, { accountId: owner.account._id });
    return null;
  },
});

/** Brings an archived organization back. Owners only, and only while the account still has a paid place for it. */
export const restore = ownerMutation({
  args: {},
  archivedToo: true,
  handler: async (ctx) => {
    const workspace = await ctx.db.get(ctx.workspaceId);
    if (!workspace) notFound();
    if (workspace.status === "active") return null;
    const owner = await billingOwner(ctx, ctx.workspaceId);
    const active = owner.account ? await organizationsOf(ctx, owner.account._id) : [];
    if (active.length >= MAX_ORGANIZATIONS) throw userError(`An account can hold ${MAX_ORGANIZATIONS} organizations. Contact us if you need more.`, "limit");
    if (billingOn()) {
      const mirror = await accountFor(ctx, ctx.workspaceId);
      if (active.length - 1 >= (mirror?.extraOrganizations ?? 0)) throw userError("Its place on the plan has ended. Contact us and we will bring it back.", "not_allowed");
    }
    await ctx.db.patch(workspace._id, { status: "active", archivedAt: undefined, archivedBy: undefined });
    await writeAudit(ctx, { workspaceId: workspace._id, actorType: "user", actorId: ctx.identity.subject, action: "organization.restored", subject: workspace._id });
    if (owner.account && billingOn()) await ctx.scheduler.runAfter(0, internal.billingActions.settleExtraOrganizations, { accountId: owner.account._id });
    return null;
  },
});
