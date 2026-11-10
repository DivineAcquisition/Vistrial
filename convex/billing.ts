/**
 * Credits billing: what the app reads and the ledger it keeps. Calls to Autumn (over Stripe) live in
 * billingActions.ts, which runs in Node because the Autumn SDK is too large for the default runtime.
 */
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { AUTO_REFILL, PLAN, PLAN_ID, TOPUP_PACKS_CENTS, accountFor, autumnMode, billingOn, markup, planActive } from "./lib/billing";
import { writeAudit } from "./lib/audit";
import { unlockOnboarding } from "./lib/onboarding";
import { workspaceQuery } from "./lib/builders";

// ---------------------------------------------------------------------------------------------- read

export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const account = await accountFor(ctx, ctx.workspaceId);
    const seesLedger = ctx.member.role !== "rep";
    const ledger = seesLedger
      ? await ctx.db
          .query("billingLedger")
          .withIndex("by_workspace_at", (q) => q.eq("workspaceId", ctx.workspaceId))
          .order("desc")
          .take(50)
      : [];
    const since = Date.now() - 30 * 86_400_000;
    return {
      on: billingOn(),
      testMode: billingOn() && autumnMode() === "test",
      canManage: ctx.member.role === "owner",
      markup: markup(),
      plan: { ...PLAN, id: PLAN_ID() },
      packs: [...TOPUP_PACKS_CENTS],
      autoRefillDefaults: AUTO_REFILL,
      account: account
        ? {
            balanceCents: account.balanceCents,
            planId: account.planId ?? null,
            planStatus: account.planStatus ?? null,
            nextResetAt: account.nextResetAt ?? null,
            autoRefill: account.autoRefill ?? null,
            refreshedAt: account.refreshedAt,
          }
        : null,
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

export const customerInfo = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    const owner = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    return { name: workspace?.name ?? "Workspace", email: (owner as { email?: string } | null)?.email ?? null };
  },
});

export const saveAccount = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    balanceCents: v.number(),
    planId: v.optional(v.string()),
    planStatus: v.optional(v.string()),
    nextResetAt: v.optional(v.number()),
    autoRefill: v.optional(v.object({ enabled: v.boolean(), thresholdCents: v.number(), amountCents: v.number() })),
  },
  handler: async (ctx, args) => {
    const { workspaceId, ...fields } = args;
    // Charges written while Autumn answered are not in its number yet; keep them off the mirror.
    const pending = await ctx.db
      .query("billingLedger")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(100);
    const unsynced = pending.filter((row) => !row.syncedAt).reduce((sum, row) => sum + row.priceCents, 0);
    const next = { ...fields, balanceCents: fields.balanceCents - unsynced, refreshedAt: Date.now() };
    const account = await accountFor(ctx, workspaceId);
    if (account) await ctx.db.patch(account._id, next);
    else await ctx.db.insert("billingAccounts", { workspaceId, ...next });
    // Paying for the plan is what unlocks a new workspace after its free session.
    if (planActive(next)) await unlockOnboarding(ctx, workspaceId, "plan");
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
    if (!billingOn()) return { on: false, balanceCents: null, low: false, empty: false, canManage: ctx.member.role === "owner" };
    const account = await accountFor(ctx, ctx.workspaceId);
    const balanceCents = account?.balanceCents ?? 0;
    return { on: true, balanceCents, low: balanceCents > 0 && balanceCents <= AUTO_REFILL.thresholdCents, empty: balanceCents <= 0, canManage: ctx.member.role === "owner" };
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

