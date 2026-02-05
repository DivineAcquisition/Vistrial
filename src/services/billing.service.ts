// @ts-nocheck
// ============================================
// BILLING SERVICE
// High-level billing operations
// ============================================

import {
  createStripeCustomer,
  createSubscriptionCheckout,
  createPortalSession,
  chargeCustomerForCredits,
  getPlanConfig,
  getPlanByPriceId,
  getOrCreateCustomer,
  createCheckoutSession as createStripeCheckoutSession,
  PLANS,
} from '@/lib/stripe';
import {
  getSupabaseAdminClient,
  addCreditsAdmin,
  createTransaction,
  getCreditBalance,
} from '@/lib/supabase';
import { creditsService } from './credits.service';
import type { Organization, PlanTier } from '@/types/database';

// Legacy import for backward compatibility
const createAdminClient = getSupabaseAdminClient;

/**
 * Initialize billing for a new organization
 * Creates Stripe customer and links to organization
 */
export async function initializeBilling(params: {
  organizationId: string;
  organizationName: string;
  email: string;
}): Promise<string> {
  // Create Stripe customer
  const customer = await createStripeCustomer({
    email: params.email,
    name: params.organizationName,
    metadata: {
      organization_id: params.organizationId,
    },
  });

  // Update organization with Stripe customer ID
  const admin = getSupabaseAdminClient();
  await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', params.organizationId);

  return customer.id;
}

/**
 * Create checkout session for subscription
 */
export async function createCheckoutSession(params: {
  organization: Organization;
  planTier: PlanTier;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  const plan = getPlanConfig(params.planTier);

  if (!params.organization.stripe_customer_id) {
    throw new Error('Organization does not have a Stripe customer');
  }

  const session = await createSubscriptionCheckout({
    customerId: params.organization.stripe_customer_id,
    priceId: plan.priceId,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    metadata: {
      organization_id: params.organization.id,
      plan_tier: params.planTier,
    },
  });

  return {
    sessionId: session.id,
    url: session.url!,
  };
}

/**
 * Create billing portal session
 */
export async function createBillingPortalSession(params: {
  organization: Organization;
  returnUrl: string;
}): Promise<string> {
  if (!params.organization.stripe_customer_id) {
    throw new Error('Organization does not have a Stripe customer');
  }

  const session = await createPortalSession({
    customerId: params.organization.stripe_customer_id,
    returnUrl: params.returnUrl,
  });

  return session.url;
}

/**
 * Handle successful subscription (called from webhook)
 */
export async function handleSubscriptionCreated(params: {
  organizationId: string;
  subscriptionId: string;
  priceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  const plan = getPlanByPriceId(params.priceId);

  if (!plan) {
    console.error('Unknown price ID:', params.priceId);
    return;
  }

  await admin
    .from('organizations')
    .update({
      stripe_subscription_id: params.subscriptionId,
      plan_tier: plan.tier,
      subscription_status: params.status as any,
      contact_limit: plan.contactLimit,
      current_period_start: params.currentPeriodStart.toISOString(),
      current_period_end: params.currentPeriodEnd.toISOString(),
    })
    .eq('id', params.organizationId);

  // Give initial credits on first subscription
  const credits = await getCreditBalance(params.organizationId);
  if (credits && credits.total_purchased_cents === 0) {
    // Give $10 welcome credits
    await addCreditsAdmin(params.organizationId, 1000, false);
  }
}

/**
 * Handle subscription update (plan change, renewal)
 */
export async function handleSubscriptionUpdated(params: {
  organizationId: string;
  subscriptionId: string;
  priceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  const plan = getPlanByPriceId(params.priceId);

  const updates: Record<string, any> = {
    subscription_status: params.status,
    current_period_start: params.currentPeriodStart.toISOString(),
    current_period_end: params.currentPeriodEnd.toISOString(),
  };

  if (plan) {
    updates.plan_tier = plan.tier;
    updates.contact_limit = plan.contactLimit;
  }

  await admin
    .from('organizations')
    .update(updates)
    .eq('id', params.organizationId);
}

/**
 * Handle subscription cancellation
 */
export async function handleSubscriptionCanceled(params: {
  organizationId: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient();

  await admin
    .from('organizations')
    .update({
      subscription_status: 'canceled',
    })
    .eq('id', params.organizationId);

  // Optionally: Pause all active workflows
  await admin
    .from('workflows')
    .update({ status: 'paused', paused_at: new Date().toISOString() })
    .eq('organization_id', params.organizationId)
    .eq('status', 'active');
}

/**
 * Process credit refill for an organization
 */
export async function processCreditsRefill(params: {
  organizationId: string;
  amountCents: number;
  stripeCustomerId: string;
  isAutoRefill?: boolean;
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  try {
    // Charge the customer
    const paymentIntent = await chargeCustomerForCredits({
      customerId: params.stripeCustomerId,
      amountCents: params.amountCents,
      organizationId: params.organizationId,
    });

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        newBalance: 0,
        error: `Payment failed with status: ${paymentIntent.status}`,
      };
    }

    // Add credits to organization
    const newBalance = await addCreditsAdmin(params.organizationId, params.amountCents, true);

    // Record transaction
    await createTransaction({
      organization_id: params.organizationId,
      type: params.isAutoRefill ? 'credit_refill' : 'credit_purchase',
      amount_cents: params.amountCents,
      status: 'completed',
      stripe_payment_intent_id: paymentIntent.id,
      description: params.isAutoRefill
        ? `Auto-refill: $${(params.amountCents / 100).toFixed(2)}`
        : `Credit purchase: $${(params.amountCents / 100).toFixed(2)}`,
      metadata: {
        auto_refill: params.isAutoRefill || false,
      },
    });

    return {
      success: true,
      newBalance,
    };
  } catch (error) {
    console.error('Credit refill failed:', error);

    // Record failed transaction
    await createTransaction({
      organization_id: params.organizationId,
      type: params.isAutoRefill ? 'credit_refill' : 'credit_purchase',
      amount_cents: params.amountCents,
      status: 'failed',
      description: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        auto_refill: params.isAutoRefill || false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return {
      success: false,
      newBalance: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check and process auto-refills for all qualifying organizations
 */
export async function processAutoRefills(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const admin = getSupabaseAdminClient();

  // Get organizations needing refill
  const { data: needsRefill } = await admin
    .from('credit_balances')
    .select(`
      *,
      organizations (
        id,
        name,
        stripe_customer_id,
        subscription_status
      )
    `)
    .eq('auto_refill_enabled', true);

  const toProcess = (needsRefill || []).filter(
    (cb) =>
      cb.balance_cents <= cb.refill_threshold_cents &&
      cb.organizations &&
      (cb.organizations as any).stripe_customer_id &&
      (cb.organizations as any).subscription_status === 'active'
  );

  let successful = 0;
  let failed = 0;

  for (const balance of toProcess) {
    const org = balance.organizations as any;

    const result = await processCreditsRefill({
      organizationId: org.id,
      amountCents: balance.refill_amount_cents,
      stripeCustomerId: org.stripe_customer_id,
      isAutoRefill: true,
    });

    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    processed: toProcess.length,
    successful,
    failed,
  };
}

// ============================================
// LEGACY CLASS-BASED SERVICE (for backward compatibility)
// ============================================

class BillingService {
  /**
   * Get or create Stripe customer for a business
   */
  async getOrCreateStripeCustomer(businessId: string): Promise<string> {
    const supabase = createAdminClient();

    const { data: business } = await supabase
      .from('businesses')
      .select('*, owner:users(email, full_name)')
      .eq('id', businessId)
      .single();

    if (!business) {
      throw new Error('Business not found');
    }

    if (business.stripe_customer_id) {
      return business.stripe_customer_id;
    }

    // Create new Stripe customer
    const customer = await getOrCreateCustomer({
      email: business.email || business.owner?.email,
      name: business.name,
      metadata: {
        business_id: businessId,
        owner_id: business.owner_id,
      },
    });

    // Save customer ID
    await supabase
      .from('businesses')
      .update({ stripe_customer_id: customer.id })
      .eq('id', businessId);

    return customer.id;
  }

  /**
   * Create checkout session for subscription
   */
  async createSubscriptionCheckout(
    businessId: string,
    planId: string,
    interval: 'monthly' | 'annual'
  ): Promise<string> {
    const plansArray = Object.values(PLANS);
    const plan = plansArray.find((p) => p.tier === planId);
    if (!plan) {
      throw new Error('Invalid plan');
    }

    const priceId =
      interval === 'monthly' ? plan.stripePriceIdMonthly : plan.stripePriceIdAnnual;

    if (!priceId) {
      throw new Error('Plan not configured in Stripe');
    }

    const customerId = await this.getOrCreateStripeCustomer(businessId);

    const session = await createStripeCheckoutSession({
      customerId,
      priceId,
      mode: 'subscription',
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
      metadata: {
        business_id: businessId,
        plan_id: planId,
      },
    });

    return session.url!;
  }

  /**
   * Create customer portal session
   */
  async createPortal(businessId: string): Promise<string> {
    const supabase = createAdminClient();

    const { data: business } = await supabase
      .from('businesses')
      .select('stripe_customer_id')
      .eq('id', businessId)
      .single();

    if (!business?.stripe_customer_id) {
      throw new Error('No billing account found');
    }

    const session = await createPortalSession({
      customerId: business.stripe_customer_id,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return session.url;
  }

  /**
   * Update auto-refill settings
   */
  async updateAutoRefillSettings(
    businessId: string,
    settings: {
      enabled: boolean;
      threshold?: number;
      amount?: number;
    }
  ): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from('businesses')
      .update({
        auto_refill_enabled: settings.enabled,
        auto_refill_threshold: settings.threshold,
        auto_refill_amount: settings.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', businessId);
  }
}

export const billingService = new BillingService();
