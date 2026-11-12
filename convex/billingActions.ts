"use node";
/**
 * Everything that talks to Autumn. The account is the customer (under its first organization's id, as
 * before accounts existed), and every organization of the account spends its one balance. Owners buy and manage; charges are sent
 * from the ledger in the background and retried hourly.
 */
import { isOwner } from "./lib/roles";
import { Autumn } from "autumn-js";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { AUTO_REFILL, CREDITS_FEATURE, EXTRA_ORG, EXTRA_ORG_ID, PLAN, PLAN_ID, TOPUP_ID, TOPUP_PACKS_CENTS, autumnKey, autumnMode, billingOn, extraOrgsOpen, extraUnitsFrom } from "./lib/billing";
import { ADD_ORGANIZATION_CLOSED } from "./lib/organizations";
import { memberAction, viewerAction } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";

function client() {
  const secretKey = autumnKey();
  if (!secretKey) throw new Error(autumnMode() === "test" ? "Billing test mode needs AUTUMN_TEST_SECRET_KEY on this deployment." : "Billing is not set up on this deployment yet. Add AUTUMN_SECRET_KEY to its environment variables.");
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
  if (ownerOnly && !isOwner(role)) notAllowed();
}

type CustomerShape = {
  balances?: Record<string, { remaining?: number; nextResetAt?: number | null } | undefined>;
  subscriptions?: { planId?: string; status?: string; quantity?: number }[];
  billingControls?: { autoTopups?: { featureId: string; enabled: boolean; threshold: number; quantity: number }[] };
};

/**
 * Reads the account's customer from Autumn (creating it the first time) and mirrors balance, plan, refill
 * and how many extra organizations are paid for. `paidExtraAtLeast` is what Autumn has just accepted, for
 * the moment before its customer record shows it.
 */
async function refreshFrom(ctx: ActionCtx, workspaceId: Id<"workspaces">, paidExtraAtLeast = 0): Promise<{ created: Id<"workspaces"> | null }> {
  const autumn = client();
  const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId });
  const customer = (await autumn.customers.getOrCreate({ customerId: info.customerId, name: info.name, email: info.email ?? undefined })) as unknown as CustomerShape;
  const feature = CREDITS_FEATURE();
  const balance = customer.balances?.[feature];
  const plan = customer.subscriptions?.find((row) => row.planId === PLAN_ID());
  const refill = customer.billingControls?.autoTopups?.find((row) => row.featureId === feature);
  return ctx.runMutation(internal.billing.saveAccount, {
    workspaceId,
    extraOrganizations: Math.max(extraUnitsFrom(customer.subscriptions), paidExtraAtLeast),
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
      await autumn.customers.getOrCreate({ customerId: info.customerId, name: info.name, email: info.email ?? undefined });
      await autumn.track({
        customerId: info.customerId,
        featureId: CREDITS_FEATURE(),
        value: row.priceCents,
        overageBehavior: "overflow",
        async: false,
        // Which organization spent, so usage can be split per organization in Autumn too.
        properties: { source: row.source, ref: row.ref, ledgerId: row._id, costCents: row.costCents, workspaceId: row.workspaceId },
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

export const refresh = viewerAction({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx): Promise<null> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, false);
    if (!billingOn()) return null;
    // Returning from checkout lands here: an organization that was being paid for is created by this read.
    await refreshFrom(ctx, ctx.workspaceId);
    return null;
  },
});

/** Starts (or resumes) the Growth plan. Returns Stripe's checkout page when payment is needed. */
export const subscribe = memberAction({
  /** `returnPath` is where Stripe sends the person back to; only app pages are allowed. */
  args: { returnOrigin: v.optional(v.string()), returnPath: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, true);
    const autumn = client();
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: ctx.workspaceId });
    await autumn.customers.getOrCreate({ customerId: info.customerId, name: info.name, email: info.email ?? undefined });
    const result = await autumn.billing.attach({
      customerId: info.customerId,
      planId: PLAN_ID(),
      successUrl: safeReturn(args.returnOrigin, args.returnPath ?? "/app/billing?paid=plan"),
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
    if (!(TOPUP_PACKS_CENTS as readonly number[]).includes(args.amountCents)) throw userError("Choose a $10, $25 or $50 pack.");
    const autumn = client();
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: ctx.workspaceId });
    await autumn.customers.getOrCreate({ customerId: info.customerId, name: info.name, email: info.email ?? undefined });
    const result = await autumn.billing.attach({
      customerId: info.customerId,
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
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: ctx.workspaceId });
    await autumn.customers.update({
      customerId: info.customerId,
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

/**
 * Adds an organization to the account: $99 a month and $50 more credits in the shared balance. Owners of
 * the account only, and only with the price they were shown (`confirmedCents`), so it cannot happen by
 * accident or at a price that changed. The organization is created once Autumn has the payment; when a
 * payment page is needed its address is returned and the organization appears on the way back.
 */
export const addOrganization = memberAction({
  args: { name: v.string(), confirmedCents: v.number(), returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string | null; workspaceId: Id<"workspaces"> | null }> => {
    const context = await ctx.runQuery(internal.billing.purchaseContext, { workspaceId: ctx.workspaceId, userId: ctx.userId });
    if (!context) throw userError("This organization is still being set up. Try again in a few minutes.");
    if (!context.isOwner) throw userError("Only an Owner of the account can add an organization.", "not_allowed");
    if (args.confirmedCents !== EXTRA_ORG.priceCents) throw userError("The price changed. Check the new one and confirm again.");
    if (!billingOn()) {
      // Local and test deployments charge nothing.
      await ctx.runMutation(internal.billing.holdOrganization, { accountId: context.accountId, userId: ctx.userId, name: args.name });
      const workspaceId: Id<"workspaces"> | null = await ctx.runMutation(internal.billing.createHeldOrganization, { accountId: context.accountId });
      return { url: null, workspaceId };
    }
    if (!extraOrgsOpen()) throw userError(ADD_ORGANIZATION_CLOSED, "not_allowed");
    if (!context.planActive) throw userError("Start the Growth plan first. Another organization is added on top of it.");
    await ctx.runMutation(internal.billing.holdOrganization, { accountId: context.accountId, userId: ctx.userId, name: args.name });
    // Paid organizations after this one: never fewer than exist, so a retry cannot buy two.
    const units = Math.max(context.organizations - 1, 0) + 1;
    const quantity = units * EXTRA_ORG.includedCents;
    let paymentUrl: string | null = null;
    try {
      const autumn = client();
      const featureQuantities = [{ featureId: CREDITS_FEATURE(), quantity }];
      const result = (
        context.paidExtra > 0
          ? await autumn.billing.update({ customerId: context.customerId, planId: EXTRA_ORG_ID(), featureQuantities })
          : await autumn.billing.attach({ customerId: context.customerId, planId: EXTRA_ORG_ID(), featureQuantities, successUrl: safeReturn(args.returnOrigin, "/app/billing?paid=organization") })
      ) as unknown as { paymentUrl?: string | null };
      paymentUrl = result.paymentUrl ?? null;
    } catch {
      await ctx.runMutation(internal.billing.releaseOrganization, { accountId: context.accountId });
      // The provider's own words are not shown: they can name internals.
      throw userError("The payment for the organization did not go through, so it was not added. Check your card in Billing and try again.");
    }
    if (paymentUrl) return { url: paymentUrl, workspaceId: null };
    const { created } = await refreshFrom(ctx, ctx.workspaceId, units);
    return { url: null, workspaceId: created };
  },
});

/** Stripe's page for cards, invoices and cancelling. */
export const portal = memberAction({
  args: { returnOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ url: string }> => {
    await requireRole(ctx, ctx.workspaceId, ctx.userId, true);
    const autumn = client();
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: ctx.workspaceId });
    const result = await autumn.billing.openCustomerPortal({ customerId: info.customerId, returnUrl: safeReturn(args.returnOrigin, "/app/billing") });
    return { url: result.url };
  },
});

/**
 * Setup check for the Owner or a developer: does this Autumn account have the credits feature and the
 * growth and topup plans the app expects? Uses this deployment's key for its mode unless given a key name,
 * returns IDs only, never the key. Run from the Convex dashboard: billingActions:checkSetup.
 */
export const checkSetup = internalAction({
  args: { keyName: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    if (args.keyName && !/^AUT[A-Z_]*$/.test(args.keyName)) throw userError("Give the name of an Autumn key variable.");
    const name = args.keyName ?? (autumnMode() === "test" ? "AUTUMN_TEST_SECRET_KEY" : "AUTUMN_SECRET_KEY");
    const secretKey = args.keyName ? process.env[args.keyName] : autumnKey();
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
      /** The add-on for each organization after the first. Reported apart: billing works without it, adding an organization does not. */
      extraOrganizations: { plan: EXTRA_ORG_ID(), exists: planIds.includes(EXTRA_ORG_ID()), switchedOn: extraOrgsOpen() },
    };
  },
});

/**
 * Creates what the app expects in Autumn, skipping anything that already exists: the `credits` feature
 * (1 unit = 1¢), the `growth` plan (the price and monthly credits in PLAN), the `topup`
 * add-on (prepaid credits at $1 per 100, bought once, never expire) and, in test mode only, the
 * `extra_org` add-on for each organization after the first. Safe to run again.
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
    const growth = {
      name: PLAN.name,
      description: `Vistrial Growth: includes $${PLAN.includedCents / 100} of AI credits every month.`,
      price: { amount: PLAN.priceCents / 100, interval: "month" as const },
      items: [{ featureId, included: PLAN.includedCents, reset: { interval: "month" as const } }],
    };
    if (!havePlans.has(PLAN_ID())) {
      await autumn.plans.create({ planId: PLAN_ID(), group: "main", ...growth });
      created.push(`plan ${PLAN_ID()}`);
    } else {
      // The plan exists: bring its price and monthly credits in line with PLAN, so a price change in code
      // reaches checkout. Existing subscribers keep what Autumn's versioning gives them.
      await autumn.plans.update({ planId: PLAN_ID(), ...growth });
      created.push(`plan ${PLAN_ID()} updated to $${PLAN.priceCents / 100}/month`);
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
    // Each organization after the first: $99 a month for 5,000 credits ($50), bought as a monthly quantity of
    // the same credits feature so they land in the one shared balance. Created in test mode only: a live
    // product and price are made by the owner, by hand, following the runbook.
    if (!havePlans.has(EXTRA_ORG_ID())) {
      if (autumnMode() === "test") {
        await autumn.plans.create({
          planId: EXTRA_ORG_ID(),
          name: "Additional organization",
          description: `Another organization on the account: $${EXTRA_ORG.priceCents / 100} a month, with $${EXTRA_ORG.includedCents / 100} more credits in the shared balance.`,
          addOn: true,
          items: [{ featureId, price: { amount: EXTRA_ORG.priceCents / 100, billingUnits: EXTRA_ORG.includedCents, interval: "month", billingMethod: "prepaid" }, reset: { interval: "month" as const } }],
        });
        created.push(`plan ${EXTRA_ORG_ID()}`);
      } else {
        created.push(`plan ${EXTRA_ORG_ID()}: not created (live mode)`);
      }
    }
    return { created, alreadyThere: [...haveFeatures, ...havePlans] };
  },
});

/** The most Vistrial grants in one call: $1,000 of credits. */
export const MAX_GRANT_CENTS = 100_000;

/**
 * Vistrial grants a workspace free credits: a one-time balance in Autumn that never resets, mirrored to the
 * app, audited, and it lifts the onboarding paywall. Internal only: run it from the Convex dashboard or
 * `npx convex run billingActions:grantCredits '{"workspaceId":"…","amountCents":10000,"reason":"…","grantedBy":"…"}'`.
 */
export const grantCredits = internalAction({
  args: { workspaceId: v.id("workspaces"), amountCents: v.number(), reason: v.string(), grantedBy: v.string() },
  handler: async (ctx, args): Promise<{ balanceCents: number | null }> => {
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0 || args.amountCents > MAX_GRANT_CENTS) {
      throw new Error(`Grant between 1 and ${MAX_GRANT_CENTS} cents.`);
    }
    if (args.reason.trim().length < 4) throw new Error("Give a reason for the grant.");
    const info = await ctx.runQuery(internal.billing.customerInfo, { workspaceId: args.workspaceId });
    const autumn = client();
    await autumn.customers.getOrCreate({ customerId: info.customerId, name: info.name, email: info.email ?? undefined });
    await autumn.balances.create({ customerId: info.customerId, featureId: CREDITS_FEATURE(), includedGrant: args.amountCents });
    await refreshFrom(ctx, args.workspaceId);
    await ctx.runMutation(internal.billing.recordGrant, args);
    const account = await ctx.runQuery(internal.billing.accountOf, { workspaceId: args.workspaceId });
    return { balanceCents: account?.balanceCents ?? null };
  },
});

