/**
 * Credits. Every piece of AI work is charged at what it really cost times a markup (3× by default), in
 * cents of what the customer pays. The charge is written to our ledger first, then sent to Autumn, which
 * keeps the real balance over Stripe. When billing is on and the balance is empty, new work cannot start;
 * work already running finishes and is charged in full.
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { userError } from "./errors";

export const CREDITS_FEATURE = () => process.env.AUTUMN_FEATURE_ID || "credits";
export const PLAN_ID = () => process.env.AUTUMN_PLAN_ID || "growth";
export const TOPUP_ID = () => process.env.AUTUMN_TOPUP_ID || "topup";

/** The owner's choices: $179 a month with $150 of credits, packs of $10, $25 or $50, refill $10 under $2. */
export const PLAN = { name: "Growth", priceCents: 17900, includedCents: 15000 } as const;
export const TOPUP_PACKS_CENTS = [1000, 2500, 5000] as const;
export const AUTO_REFILL = { thresholdCents: 200, amountCents: 1000, maxPerMonth: 4 } as const;

export function markup(): number {
  const value = Number(process.env.BILLING_MARKUP ?? "3");
  return Number.isFinite(value) && value >= 1 ? value : 3;
}

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

/** The Growth plan is paid for: Autumn lists it and has not ended it. */
export function planActive(account: { planId?: string | null; planStatus?: string | null } | null | undefined): boolean {
  if (!account?.planId || account.planId !== PLAN_ID()) return false;
  return !["canceled", "cancelled", "expired", "incomplete", "incomplete_expired", "unpaid"].includes(account.planStatus ?? "");
}

export function priceFor(costCents: number, factor = markup()): number {
  return costCents > 0 ? Math.ceil(costCents * factor) : 0;
}

export async function accountFor(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("billingAccounts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
}

export const OUT_OF_CREDITS = "Your credit balance is empty. An owner can add credits in Billing to start new work.";

/** Throws when billing is on and this workspace has no credit left. Call before starting new work. */
export async function assertCanSpend(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  if (!billingOn()) return;
  const account = await accountFor(ctx, workspaceId);
  if (!account || account.balanceCents <= 0) throw userError(OUT_OF_CREDITS, "out_of_credits");
}

/**
 * Charges real AI cost to the workspace: a ledger row, the mirrored balance lowered at once, and the usage
 * sent to Autumn in the background. Never blocks; a run that is already going is always charged.
 */
export async function chargeUsage(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; costCents: number; source: "run" | "followup" | "intake" | "file"; ref: string },
) {
  if (args.costCents <= 0) return null;
  const factor = markup();
  const priceCents = priceFor(args.costCents, factor);
  const ledgerId = await ctx.db.insert("billingLedger", {
    workspaceId: args.workspaceId,
    source: args.source,
    ref: args.ref,
    costCents: args.costCents,
    priceCents,
    markup: factor,
    at: Date.now(),
  });
  const account = await accountFor(ctx, args.workspaceId);
  if (account) await ctx.db.patch(account._id, { balanceCents: account.balanceCents - priceCents });
  if (billingOn()) await ctx.scheduler.runAfter(0, internal.billingActions.push, { ledgerId });
  return ledgerId;
}
