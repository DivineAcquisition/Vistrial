/**
 * Credits. Every piece of AI work is charged at what it really cost times a markup (3× by default), in
 * cents of what the customer pays. The charge is written to our ledger first, then sent to Autumn, which
 * keeps the real balance over Stripe. When billing is on and the balance is empty, new work cannot start;
 * work already running finishes and is charged in full.
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { markup, priceFor } from "./credits";
import { addToUsage, attributionFor, type LedgerSource } from "./usage";

export { markup, priceFor };
import { userError } from "./errors";

export const CREDITS_FEATURE = () => process.env.AUTUMN_FEATURE_ID || "credits";
export const PLAN_ID = () => process.env.AUTUMN_PLAN_ID || "growth";
export const TOPUP_ID = () => process.env.AUTUMN_TOPUP_ID || "topup";
export const EXTRA_ORG_ID = () => process.env.AUTUMN_EXTRA_ORG_ID || "extra_org";

/**
 * The owner's choices: $179 a month with $150 of credits, packs of $10, $25 or $50, refill $10 under $2.
 * Its name is the one the pricing page sells (src/lib/marketing/pricing.ts); Autumn still knows it by PLAN_ID.
 */
export const PLAN = { name: "Private Access", priceCents: 17900, includedCents: 15000 } as const;
/** Each organization after the first: $99 a month, and $50 more credits in the account's shared balance. */
export const EXTRA_ORG = { priceCents: 9900, includedCents: 5000 } as const;
export const TOPUP_PACKS_CENTS = [1000, 2500, 5000] as const;
export const AUTO_REFILL = { thresholdCents: 200, amountCents: 1000, maxPerMonth: 4 } as const;

/**
 * Which Autumn key this deployment uses. AUTUMN_MODE=test picks AUTUMN_TEST_SECRET_KEY (Stripe test mode,
 * nothing real is charged): set it on dev. Otherwise the live AUTUMN_SECRET_KEY is used, as on production.
 */
export function autumnMode(): "test" | "live" {
  return process.env.AUTUMN_MODE === "test" ? "test" : "live";
}

export function autumnKey(): string | undefined {
  return autumnMode() === "test" ? process.env.AUTUMN_TEST_SECRET_KEY : process.env.AUTUMN_SECRET_KEY;
}

/** Billing is on once the deployment holds the Autumn key for its mode. Without one (local, tests) work is never blocked. */
export function billingOn(): boolean {
  return Boolean(autumnKey());
}

/**
 * Whether an Owner may buy another organization here. On by default in Stripe test mode and off where
 * real money is charged, until BILLING_EXTRA_ORGS=on is set (docs/rebuild/organizations-and-clients.md, 6.4).
 */
export function extraOrgsOpen(): boolean {
  const flag = process.env.BILLING_EXTRA_ORGS?.trim().toLowerCase();
  if (flag === "on") return true;
  if (flag === "off") return false;
  return autumnMode() === "test";
}

/**
 * How many extra organizations a customer is paying for, from the add-on's subscription as Autumn reports
 * it. The add-on is bought as a quantity of credits (5,000 per organization); a plain count is read too.
 */
export function extraUnitsFrom(subscriptions: { planId?: string; status?: string; quantity?: number }[] | undefined): number {
  const row = (subscriptions ?? []).find((entry) => entry.planId === EXTRA_ORG_ID() && planActive({ planId: PLAN_ID(), planStatus: entry.status }));
  if (!row) return 0;
  const quantity = Math.max(0, Math.round(row.quantity ?? 1));
  return quantity >= EXTRA_ORG.includedCents ? Math.round(quantity / EXTRA_ORG.includedCents) : Math.max(1, quantity);
}

/** The plan is paid for: Autumn lists it and has not ended it. */
export function planActive(account: { planId?: string | null; planStatus?: string | null } | null | undefined): boolean {
  if (!account?.planId || account.planId !== PLAN_ID()) return false;
  return !["canceled", "cancelled", "expired", "incomplete", "incomplete_expired", "unpaid"].includes(account.planStatus ?? "");
}

/**
 * Who is billed for an organization: its account, and the customer id Autumn knows it by. A workspace
 * the accounts backfill has not reached yet is its own account, billed under its own id as it always was.
 */
export async function billingOwner(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const workspace = await ctx.db.get(workspaceId);
  const account = workspace?.accountId ? await ctx.db.get(workspace.accountId) : null;
  if (!account) return { account: null, customerId: workspaceId as string, firstWorkspaceId: workspaceId };
  // The customer id of an account is its first organization's id, which is also where its mirror row began.
  const first = ctx.db.normalizeId("workspaces", account.billingCustomerId);
  return { account, customerId: account.billingCustomerId, firstWorkspaceId: first ?? workspaceId };
}

/** The credit balance an organization spends from: one row per account, shared by all its organizations. */
export async function accountFor(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const owner = await billingOwner(ctx, workspaceId);
  if (owner.account) {
    const shared = await ctx.db
      .query("billingAccounts")
      .withIndex("by_account", (q) => q.eq("accountId", owner.account!._id))
      .first();
    if (shared) return shared;
  }
  // Not stamped with its account yet: the row is still keyed by the account's first organization.
  return ctx.db
    .query("billingAccounts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", owner.firstWorkspaceId))
    .unique();
}

export const OUT_OF_CREDITS = "Your credit balance is empty. An owner can add credits in Billing to start new work.";

/** Throws when billing is on and this organization's account has no credit left. Call before starting new work. */
export async function assertCanSpend(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  if (!billingOn()) return;
  const account = await accountFor(ctx, workspaceId);
  if (!account || account.balanceCents <= 0) throw userError(OUT_OF_CREDITS, "out_of_credits");
}

/**
 * Charges real AI cost to the workspace: a ledger row, the mirrored balance lowered at once, and the usage
 * sent to Autumn in the background. Never blocks; a run that is already going is always charged. Each row
 * says who and what it was for, and is folded into the usage page's rollup (lib/usage.ts).
 */
export async function chargeUsage(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    costCents: number;
    source: LedgerSource;
    ref: string;
    /** The model that did this step, when the caller knows it better than the record does (a run's steps). */
    model?: string;
  },
) {
  if (args.costCents <= 0) return null;
  const factor = markup();
  const priceCents = priceFor(args.costCents, factor);
  // Work for a client is marked with it, so what a client costs to serve can be added up later.
  const who = await attributionFor(ctx, args.workspaceId, args.source, args.ref);
  // A run's own record keeps only the model that wrote, so a step's model comes from the step; a tool call has none.
  const model = args.model ?? (args.source === "run" ? undefined : who.model);
  const at = Date.now();
  const ledgerId = await ctx.db.insert("billingLedger", {
    workspaceId: args.workspaceId,
    ...(who.clientId ? { clientId: who.clientId } : {}),
    source: args.source,
    ref: args.ref,
    costCents: args.costCents,
    priceCents,
    markup: factor,
    at,
    ...(who.startedBy ? { startedBy: who.startedBy } : {}),
    ...(who.agentSlug ? { agentSlug: who.agentSlug } : {}),
    ...(who.skillSlug ? { skillSlug: who.skillSlug } : {}),
    ...(model ? { model } : {}),
    inUsage: true,
  });
  await addToUsage(ctx, { workspaceId: args.workspaceId, source: args.source, ref: args.ref, priceCents, at, model }, who);
  const account = await accountFor(ctx, args.workspaceId);
  if (account) await ctx.db.patch(account._id, { balanceCents: account.balanceCents - priceCents });
  if (billingOn()) await ctx.scheduler.runAfter(0, internal.billingActions.push, { ledgerId });
  return ledgerId;
}
