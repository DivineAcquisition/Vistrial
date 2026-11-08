"use node";
/**
 * Everything that talks to Autumn. The workspace is the customer. Owners buy and manage; charges are sent
 * from the ledger in the background and retried hourly.
 */
import { Autumn } from "autumn-js";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { AUTO_REFILL, CREDITS_FEATURE, PLAN, PLAN_ID, TOPUP_ID, TOPUP_PACKS_CENTS, billingOn } from "./lib/billing";
import { memberAction } from "./lib/builders";
import { notAllowed, notFound } from "./lib/errors";

function client() {
  const secretKey = process.env.AUTUMN_SECRET_KEY;
  if (!secretKey) throw new Error("Billing is not set up on this deployment yet. Add AUTUMN_SECRET_KEY to its environment variables.");
  return new Autumn({ secretKey });
}

/** Only app pages can be the return address after paying. */
function safeReturn(origin: string | undefined, path: string) {
  const base = origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : (process.env.SITE_URL ?? "https://app.vistrial.io");
  return `${base.replace(/\/$/, "")}${path.startsWith("/app") ? path : "/app/billing"}`;
}

/** Billing actions need a member of the workspace; buying and managing need its Owner. */
async function requireRole(ctx: ActionCtx, workspaceId: Id<"workspaces">, userId: string, ownerOnly: boolean) {
  const role = await ctx.runQuery(internal.metaAds.roleOf, { workspaceId, userId });
  if (!role) notFound();
  if (ownerOnly && role !== "owner") notAllowed();
}

type CustomerShape = {
  balances?: Record<string, { remaining?: number; nextResetAt?: number | null } | undefined>;
  subscriptions?: { planId?: string; status?: string }[];
  billingControls?: { autoTopups?: { featureId: string; enabled: boolean; threshold: number; quantity: number }[] };
};

/** Reads the customer from Autumn (creating it the first time) and mirrors balance, plan and refill. */
async function refreshFrom(ctx: ActionCtx, workspaceId: Id<"workspaces">) {
  const autumn = client();
  const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId });
  const customer = (await autumn.customers.getOrCreate({ customerId: workspaceId, name: info.name, email: info.email ?? undefined })) as unknown as CustomerShape;
  const feature = CREDITS_FEATURE();
  const balance = customer.balances?.[feature];
  const plan = customer.subscriptions?.find((row) => row.planId === PLAN_ID());
  const refill = customer.billingControls?.autoTopups?.find((row) => row.featureId === feature);
  await ctx.runMutation(internal.billing.saveAccount, {
    workspaceId,
    balanceCents: Math.round(balance?.remaining ?? 0),
    planId: plan?.planId,
    planStatus: plan?.status,
    nextResetAt: balance?.nextResetAt ?? undefined,
    autoRefill: refill ? { enabled: refill.enabled, thresholdCents: refill.threshold, amountCents: refill.quantity } : undefined,
  });
}

export const push = internalAction({
  args: { ledgerId: v.id("billingLedger") },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.billing.ledgerRow, { ledgerId: args.ledgerId });
    if (!row || row.syncedAt) return;
    try {
      const autumn = client();
      const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: row.workspaceId });
      await autumn.customers.getOrCreate({ customerId: row.workspaceId, name: info.name, email: info.email ?? undefined });
      await autumn.track({
        customerId: row.workspaceId,
        featureId: CREDITS_FEATURE(),
        value: row.priceCents,
        overageBehavior: "overflow",
        async: false,
        properties: { source: row.source, ref: row.ref, ledgerId: row._id, costCents: row.costCents },
      });
      await ctx.runMutation(internal.billing.markSynced, { ledgerId: row._id });
      await refreshFrom(ctx, row.workspaceId);
    } catch (error) {
      await ctx.runMutation(internal.billing.markSynced, { ledgerId: row._id, error: error instanceof Error ? error.message : "Autumn did not accept the charge." });
    }
  },
});

export const retryUnsynced = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!billingOn()) return;
    const ids = await ctx.runQuery(internal.billing.unsynced, {});
    for (const ledgerId of ids) await ctx.runAction(internal.billingActions.push, { ledgerId });
  },
});

// ---------------------------------------------------------------------------------- owner actions

export const refresh = memberAction({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx): Promise<null> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, false);
    if (!billingOn()) return null;
    await refreshFrom(ctx, ctx.workspaceId);
    return null;
  },
});

/** Starts (or resumes) the $49 Growth plan. Returns Stripe's checkout page when payment is needed. */
export const subscribe = memberAction({
  args: { returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, true);
    const autumn = client();
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: ctx.workspaceId });
    await autumn.customers.getOrCreate({ customerId: ctx.workspaceId, name: info.name, email: info.email ?? undefined });
    const result = await autumn.billing.attach({
      customerId: ctx.workspaceId,
      planId: PLAN_ID(),
      successUrl: safeReturn(args.returnOrigin, "/app/billing?paid=plan"),
    });
    await refreshFrom(ctx, ctx.workspaceId);
    return { url: result.paymentUrl ?? null };
  },
});

/** Buys a $10, $25 or $50 credit pack. */
export const topUp = memberAction({
  args: { amountCents: v.number(), returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, true);
    if (!(TOPUP_PACKS_CENTS as readonly number[]).includes(args.amountCents)) throw new Error("Choose a $10, $25 or $50 pack.");
    const autumn = client();
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: ctx.workspaceId });
    await autumn.customers.getOrCreate({ customerId: ctx.workspaceId, name: info.name, email: info.email ?? undefined });
    const result = await autumn.billing.attach({
      customerId: ctx.workspaceId,
      planId: TOPUP_ID(),
      featureQuantities: [{ featureId: CREDITS_FEATURE(), quantity: args.amountCents }],
      successUrl: safeReturn(args.returnOrigin, "/app/billing?paid=topup"),
    });
    await refreshFrom(ctx, ctx.workspaceId);
    return { url: result.paymentUrl ?? null };
  },
});

/** Turns auto-refill on or off: $10 when the balance drops under $2, at most four times a month. */
export const setAutoRefill = memberAction({
  args: { enabled: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, true);
    const autumn = client();
    await autumn.customers.update({
      customerId: ctx.workspaceId,
      billingControls: {
        autoTopups: [
          {
            featureId: CREDITS_FEATURE(),
            enabled: args.enabled,
            threshold: AUTO_REFILL.thresholdCents,
            quantity: AUTO_REFILL.amountCents,
            purchaseLimit: { interval: "month", limit: AUTO_REFILL.maxPerMonth },
          },
        ],
      },
    });
    await refreshFrom(ctx, ctx.workspaceId);
    return null;
  },
});

/** Stripe's page for cards, invoices and cancelling. */
export const portal = memberAction({
  args: { returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, true);
    const autumn = client();
    const result = await autumn.billing.openCustomerPortal({ customerId: ctx.workspaceId, returnUrl: safeReturn(args.returnOrigin, "/app/billing") });
    return { url: result.url };
  },
});

/**
 * Setup check for the Owner or a developer: does this Autumn account have the credits feature and the
 * growth and topup plans the app expects? Reads a key by name (AUTUMN_SECRET_KEY unless told otherwise),
 * returns IDs only, never the key. Run from the Convex dashboard: billingActions:checkSetup.
 */
export const checkSetup = internalAction({
  args: { keyName: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const name = args.keyName ?? "AUTUMN_SECRET_KEY";
    if (!/^AUT[A-Z_]*$/.test(name)) throw new Error("Give the name of an Autumn key variable.");
    const secretKey = process.env[name];
    if (!secretKey) return { ok: false, problem: `${name} is not set on this deployment.` };
    const autumn = new Autumn({ secretKey });
    const features = (await autumn.features.list({})) as unknown as { list?: { id: string; type?: string; name?: string }[] } | { id: string }[];
    const plans = (await autumn.plans.list({})) as unknown as { list?: { id: string; name?: string }[] } | { id: string }[];
    const featureRows = Array.isArray(features) ? features : (features.list ?? []);
    const planRows = Array.isArray(plans) ? plans : (plans.list ?? []);
    const featureIds = featureRows.map((row) => row.id);
    const planIds = planRows.map((row) => row.id);
    return {
      ok: true,
      testMode: secretKey.startsWith("am_sk_test"),
      features: featureIds,
      plans: planIds,
      missing: [
        ...(featureIds.includes(CREDITS_FEATURE()) ? [] : [`feature ${CREDITS_FEATURE()}`]),
        ...(planIds.includes(PLAN_ID()) ? [] : [`plan ${PLAN_ID()}`]),
        ...(planIds.includes(TOPUP_ID()) ? [] : [`plan ${TOPUP_ID()}`]),
      ],
    };
  },
});

/**
 * Creates what the app expects in Autumn, skipping anything that already exists: the `credits` feature
 * (1 unit = 1¢), the `growth` plan ($49 a month with 4,000 credits that renew monthly) and the `topup`
 * add-on (prepaid credits at $1 per 100, bought once, never expire). Safe to run again.
 */
export const setupProducts = internalAction({
  args: {},
  handler: async () => {
    const autumn = client();
    const featureId = CREDITS_FEATURE();
    const features = (await autumn.features.list({})) as unknown as { list?: { id: string }[] } | { id: string }[];
    const plans = (await autumn.plans.list({})) as unknown as { list?: { id: string }[] } | { id: string }[];
    const haveFeatures = new Set((Array.isArray(features) ? features : (features.list ?? [])).map((row) => row.id));
    const havePlans = new Set((Array.isArray(plans) ? plans : (plans.list ?? [])).map((row) => row.id));
    const created: string[] = [];

    if (!haveFeatures.has(featureId)) {
      await autumn.features.create({
        featureId,
        name: "Credits",
        type: "metered",
        consumable: true,
        display: { singular: "credit", plural: "credits" },
      });
      created.push(`feature ${featureId}`);
    }
    if (!havePlans.has(PLAN_ID())) {
      await autumn.plans.create({
        planId: PLAN_ID(),
        name: PLAN.name,
        description: "Vistrial Growth: includes $40 of AI credits every month.",
        group: "main",
        price: { amount: PLAN.priceCents / 100, interval: "month" },
        items: [{ featureId, included: PLAN.includedCents, reset: { interval: "month" } }],
      });
      created.push(`plan ${PLAN_ID()}`);
    }
    if (!havePlans.has(TOPUP_ID())) {
      await autumn.plans.create({
        planId: TOPUP_ID(),
        name: "Credit top-up",
        description: "Extra AI credits. $1 per 100 credits; they never expire.",
        addOn: true,
        items: [{ featureId, price: { amount: 1, billingUnits: 100, interval: "one_off", billingMethod: "prepaid" } }],
      });
      created.push(`plan ${TOPUP_ID()}`);
    }
    return { created, alreadyThere: [...haveFeatures, ...havePlans] };
  },
});
