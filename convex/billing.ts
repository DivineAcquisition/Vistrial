/**
 * Credits billing: what the app reads and the ledger it keeps. Calls to Autumn (over Stripe) live in
 * billingActions.ts, which runs in Node because the Autumn SDK is too large for the default runtime.
 */
import { isAdmin, isOwner } from "./lib/roles";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { AUTO_REFILL, EXTRA_ORG, PLAN, PLAN_ID, TOPUP_PACKS_CENTS, accountFor, autumnMode, billingOn, billingOwner, markup, planActive } from "./lib/billing";
import { notAllowed, userError } from "./lib/errors";
import { createWorkspaceFor } from "./lib/newWorkspace";
import { ADD_ORGANIZATION_CLOSED, MAX_ORGANIZATIONS, accountMember, addingOrganizationsOpen, organizationsOf } from "./lib/organizations";
import { writeAudit } from "./lib/audit";
import { unlockOnboarding } from "./lib/onboarding";
import { workspaceQuery } from "./lib/builders";

// ---------------------------------------------------------------------------------------------- read

const DAYS_30 = 30 * 86_400_000;

async function spentSince(ctx: QueryCtx, workspaceId: Id<"workspaces">, since: number) {
  const rows = await ctx.db
    .query("billingLedger")
    .withIndex("by_workspace_at", (q) => q.eq("workspaceId", workspaceId).gte("at", since))
    .take(2000);
  return rows.reduce((sum, row) => sum + row.priceCents, 0);
}

/**
 * Billing as one organization's member sees it: the account's shared balance and plan, this organization's
 * charges, and (for an Owner of the account) what every organization used and the price of adding one.
 */
export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const mirror = await accountFor(ctx, ctx.workspaceId);
    const owner = await billingOwner(ctx, ctx.workspaceId);
    const seesLedger = isAdmin(ctx.member.role);
    const isAccountOwner = isOwner(ctx.member.role);
    const ledger = seesLedger
      ? await ctx.db
          .query("billingLedger")
          .withIndex("by_workspace_at", (q) => q.eq("workspaceId", ctx.workspaceId))
          .order("desc")
          .take(50)
      : [];
    const since = Date.now() - DAYS_30;
    const here = await ctx.db.get(ctx.workspaceId);
    // What each organization used. An Owner sees all of them; anyone else only the one they are in.
    const all = owner.account ? await organizationsOf(ctx, owner.account._id) : here ? [here] : [];
    const organizations = [];
    for (const organization of all) {
      const mine = organization._id === ctx.workspaceId;
      if (!mine && !isAccountOwner) continue;
      organizations.push({
        workspaceId: organization._id,
        name: organization.name,
        current: mine,
        first: organization._id === owner.firstWorkspaceId,
        spent30dCents: seesLedger ? await spentSince(ctx, organization._id, since) : null,
      });
    }
    const paidExtra = mirror?.extraOrganizations ?? 0;
    const extraCount = Math.max(0, all.length - 1);
    return {
      on: billingOn(),
      testMode: billingOn() && autumnMode() === "test",
      canManage: isAccountOwner,
      markup: markup(),
      plan: { ...PLAN, id: PLAN_ID() },
      packs: [...TOPUP_PACKS_CENTS],
      autoRefillDefaults: AUTO_REFILL,
      accountName: owner.account?.name ?? here?.name ?? "",
      account: mirror
        ? {
            balanceCents: mirror.balanceCents,
            planId: mirror.planId ?? null,
            planStatus: mirror.planStatus ?? null,
            nextResetAt: mirror.nextResetAt ?? null,
            autoRefill: mirror.autoRefill ?? null,
            refreshedAt: mirror.refreshedAt,
          }
        : null,
      organizations,
      /** The price of one more organization, and whether this person can add one here and now. */
      extra: {
        priceCents: EXTRA_ORG.priceCents,
        includedCents: EXTRA_ORG.includedCents,
        count: extraCount,
        paid: paidExtra,
        /** What the account pays each month, and the credits it gets, with its extra organizations. */
        monthlyCents: PLAN.priceCents + extraCount * EXTRA_ORG.priceCents,
        monthlyCreditsCents: PLAN.includedCents + extraCount * EXTRA_ORG.includedCents,
        canAdd: isAccountOwner && Boolean(owner.account) && addingOrganizationsOpen() && all.length < MAX_ORGANIZATIONS,
        closedReason: isAccountOwner && !addingOrganizationsOpen() ? ADD_ORGANIZATION_CLOSED : null,
        needsPlan: billingOn() && !planActive(mirror),
        pendingName: isAccountOwner ? (owner.account?.pendingOrganization?.name ?? null) : null,
      },
      spent30dCents: ledger.filter((row) => row.at >= since).reduce((sum, row) => sum + row.priceCents, 0),
      ledger: ledger.map((row) => ({
        id: row._id,
        source: row.source,
        ref: row.ref,
        costCents: row.costCents,
        priceCents: row.priceCents,
        at: row.at,
        synced: Boolean(row.syncedAt),
      })),
    };
  },
});

// ------------------------------------------------------------------------------- ledger and mirror

/** Who Autumn bills for this organization: the account's customer id, name and an Owner's email. */
export const customerInfo = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const owner = await billingOwner(ctx, args.workspaceId);
    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", owner.firstWorkspaceId))
      .take(200);
    const first = members.filter((row) => row.active && isOwner(row.role)).sort((a, b) => a._creationTime - b._creationTime)[0];
    const workspace = await ctx.db.get(owner.firstWorkspaceId);
    return { customerId: owner.customerId, name: owner.account?.name ?? workspace?.name ?? "Workspace", email: first?.email ?? null };
  },
});

/** Charges written while Autumn answered are not in its number yet; they are kept off the mirror. */
async function unsyncedFor(ctx: QueryCtx, workspaceIds: Id<"workspaces">[]) {
  let total = 0;
  for (const workspaceId of workspaceIds) {
    const pending = await ctx.db
      .query("billingLedger")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(100);
    total += pending.filter((row) => !row.syncedAt).reduce((sum, row) => sum + row.priceCents, 0);
  }
  return total;
}

export const saveAccount = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    balanceCents: v.number(),
    planId: v.optional(v.string()),
    planStatus: v.optional(v.string()),
    nextResetAt: v.optional(v.number()),
    autoRefill: v.optional(v.object({ enabled: v.boolean(), thresholdCents: v.number(), amountCents: v.number() })),
    /** How many organizations beyond the first the customer is paying for. */
    extraOrganizations: v.optional(v.number()),
    /** Credits bought in packs, when Autumn reports them. */
    packsCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId, ...fields } = args;
    const owner = await billingOwner(ctx, workspaceId);
    const organizations = owner.account ? await organizationsOf(ctx, owner.account._id) : [];
    const spenders = organizations.length > 0 ? organizations.map((row) => row._id) : [workspaceId];
    const unsynced = await unsyncedFor(ctx, spenders);
    const next = { ...fields, balanceCents: fields.balanceCents - unsynced, refreshedAt: Date.now(), ...(owner.account ? { accountId: owner.account._id } : {}) };
    const mirror = await accountFor(ctx, workspaceId);
    if (mirror) await ctx.db.patch(mirror._id, next);
    else await ctx.db.insert("billingAccounts", { workspaceId: owner.firstWorkspaceId, ...next });
    // Paying for the plan is what unlocks a new organization after its free session.
    if (planActive(next)) await unlockOnboarding(ctx, workspaceId, "plan");
    // An organization the Owner confirmed is created once its payment shows: never before.
    const pending = owner.account?.pendingOrganization;
    if (owner.account && pending && (fields.extraOrganizations ?? 0) > Math.max(0, organizations.length - 1)) {
      const requester = await accountMember(ctx, owner.account._id, pending.requestedBy);
      const first = organizations[0];
      const created = await createWorkspaceFor(ctx, {
        userId: pending.requestedBy,
        displayName: requester?.displayName ?? "Owner",
        email: requester?.email,
        name: pending.name,
        timezone: first?.timezone,
        accountId: owner.account._id,
      });
      await ctx.db.patch(owner.account._id, { pendingOrganization: undefined });
      await writeAudit(ctx, { workspaceId: created, actorType: "user", actorId: pending.requestedBy, action: "organization.added", subject: owner.account._id, count: organizations.length + 1 });
      return { created };
    }
    return { created: null };
  },
});

/** What the action that buys an organization needs to know first. Internal: it never reaches a browser. */
export const purchaseContext = internalQuery({
  args: { workspaceId: v.id("workspaces"), userId: v.string() },
  handler: async (ctx, args) => {
    const owner = await billingOwner(ctx, args.workspaceId);
    if (!owner.account) return null;
    const me = await accountMember(ctx, owner.account._id, args.userId);
    const mirror = await accountFor(ctx, args.workspaceId);
    const organizations = await organizationsOf(ctx, owner.account._id);
    return {
      accountId: owner.account._id,
      customerId: owner.customerId,
      isOwner: Boolean(me?.active && me.role === "owner"),
      organizations: organizations.length,
      paidExtra: mirror?.extraOrganizations ?? 0,
      planActive: planActive(mirror),
      pending: owner.account.pendingOrganization ?? null,
    };
  },
});

/** Checks the name and holds it on the account until the payment lands. One at a time. */
export const holdOrganization = internalMutation({
  args: { accountId: v.id("accounts"), userId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    const me = account ? await accountMember(ctx, account._id, args.userId) : null;
    if (!account || !me?.active || me.role !== "owner") notAllowed();
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name) throw userError("Name the organization.");
    if (name.length > 80) throw userError("Keep the name under 80 characters.");
    const existing = await organizationsOf(ctx, account._id);
    if (existing.length >= MAX_ORGANIZATIONS) throw userError(`An account can hold ${MAX_ORGANIZATIONS} organizations. Contact us if you need more.`, "limit");
    if (existing.some((row) => row.name.trim().toLowerCase() === name.toLowerCase())) throw userError("You already have an organization with that name.");
    await ctx.db.patch(account._id, { pendingOrganization: { name, requestedBy: args.userId, requestedAt: Date.now() } });
    return name;
  },
});

/** Lets go of a held name when the payment did not go through. */
export const releaseOrganization = internalMutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (account?.pendingOrganization) await ctx.db.patch(account._id, { pendingOrganization: undefined });
    return null;
  },
});

/** Where billing is off nothing is charged, so the organization held is simply created. */
export const createHeldOrganization = internalMutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args): Promise<Id<"workspaces"> | null> => {
    const account = await ctx.db.get(args.accountId);
    const pending = account?.pendingOrganization;
    if (!account || !pending) return null;
    const requester = await accountMember(ctx, account._id, pending.requestedBy);
    const organizations = await organizationsOf(ctx, account._id);
    const created = await createWorkspaceFor(ctx, {
      userId: pending.requestedBy,
      displayName: requester?.displayName ?? "Owner",
      email: requester?.email,
      name: pending.name,
      timezone: organizations[0]?.timezone,
      accountId: account._id,
    });
    await ctx.db.patch(account._id, { pendingOrganization: undefined });
    await writeAudit(ctx, { workspaceId: created, actorType: "user", actorId: pending.requestedBy, action: "organization.added", subject: account._id, count: organizations.length + 1 });
    return created;
  },
});

export const ledgerRow = internalQuery({
  args: { ledgerId: v.id("billingLedger") },
  handler: (ctx, args) => ctx.db.get(args.ledgerId),
});

export const markSynced = internalMutation({
  args: { ledgerId: v.id("billingLedger"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ledgerId, args.error ? { syncError: args.error.slice(0, 300) } : { syncedAt: Date.now(), syncError: undefined });
  },
});

export const unsynced = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("billingLedger")
      .withIndex("by_synced", (q) => q.eq("syncedAt", undefined))
      .take(100);
    return rows.filter((row) => row.at < Date.now() - 60_000).map((row) => row._id);
  },
});

/** The small read every page uses for the out-of-credits notice. */
export const status = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    if (!billingOn()) return { on: false, balanceCents: null, low: false, empty: false, canManage: isOwner(ctx.member.role), markup: markup() };
    const account = await accountFor(ctx, ctx.workspaceId);
    const balanceCents = account?.balanceCents ?? 0;
    return { on: true, balanceCents, low: balanceCents > 0 && balanceCents <= AUTO_REFILL.thresholdCents, empty: balanceCents <= 0, canManage: isOwner(ctx.member.role), markup: markup() };
  },
});

/**
 * After Vistrial grants credits: records who granted how much and why, and lets the workspace past the
 * onboarding paywall, the same way paying for the plan does. Internal only.
 */
export const recordGrant = internalMutation({
  args: { workspaceId: v.id("workspaces"), amountCents: v.number(), reason: v.string(), grantedBy: v.string() },
  handler: async (ctx, args) => {
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorType: "system",
      actorId: args.grantedBy,
      action: "billing.credits_granted",
      subject: `${args.amountCents}c: ${args.reason}`.slice(0, 200),
    });
    await unlockOnboarding(ctx, args.workspaceId, "grant");
    return null;
  },
});

/** The mirrored account, for internal callers that report a balance back. */
export const accountOf = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const account = await accountFor(ctx, args.workspaceId);
    return account ? { balanceCents: account.balanceCents } : null;
  },
});


/** What the add-on should be after an organization was archived or brought back. Internal: read by settleExtraOrganizations. */
export const settleContext = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return null;
    const organizations = await organizationsOf(ctx, account._id);
    const first = ctx.db.normalizeId("workspaces", account.billingCustomerId);
    const mirror = first ? await accountFor(ctx, first) : null;
    return {
      customerId: account.billingCustomerId,
      firstWorkspaceId: first,
      wanted: Math.max(0, organizations.length - 1),
      paid: mirror?.extraOrganizations ?? 0,
      endsAtRenewal: account.extraEndsAtRenewal === true,
    };
  },
});

export const markExtraEnding = internalMutation({
  args: { accountId: v.id("accounts"), ending: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, { extraEndsAtRenewal: args.ending ? true : undefined });
    return null;
  },
});
