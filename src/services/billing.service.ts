// @ts-nocheck
/**
 * Billing Service
 * 
 * Business logic for billing operations:
 * - Subscription management
 * - Payment processing
 * - Invoice handling
 * - Auto-refill processing
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, createCheckoutSession, createPortalSession, getOrCreateCustomer } from "@/lib/stripe/server";
import { PLANS, CREDIT_COSTS } from "@/constants/plans";
import { creditsService } from "./credits.service";

interface Business {
  id: string;
  owner_id: string;
  stripe_customer_id?: string;
  subscription_id?: string;
  subscription_status?: string;
  subscription_plan?: string;
  auto_refill_enabled?: boolean;
  auto_refill_threshold?: number;
  auto_refill_amount?: number;
}

class BillingService {
  /**
   * Get or create Stripe customer for a business
   */
  async getOrCreateStripeCustomer(businessId: string): Promise<string> {
    const supabase = createAdminClient();

    const { data: business } = await supabase
      .from("businesses")
      .select("*, owner:users(email, full_name)")
      .eq("id", businessId)
      .single();

    if (!business) {
      throw new Error("Business not found");
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
      .from("businesses")
      .update({ stripe_customer_id: customer.id })
      .eq("id", businessId);

    return customer.id;
  }

  /**
   * Create checkout session for subscription
   */
  async createSubscriptionCheckout(
    businessId: string,
    planId: string,
    interval: "monthly" | "annual"
  ): Promise<string> {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) {
      throw new Error("Invalid plan");
    }

    const priceId = interval === "monthly" 
      ? plan.stripePriceIdMonthly 
      : plan.stripePriceIdAnnual;

    if (!priceId) {
      throw new Error("Plan not configured in Stripe");
    }

    const customerId = await this.getOrCreateStripeCustomer(businessId);

    const session = await createCheckoutSession({
      customerId,
      priceId,
      mode: "subscription",
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
      .from("businesses")
      .select("stripe_customer_id")
      .eq("id", businessId)
      .single();

    if (!business?.stripe_customer_id) {
      throw new Error("No billing account found");
    }

    const session = await createPortalSession({
      customerId: business.stripe_customer_id,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return session.url;
  }

  /**
   * Process subscription webhook event
   */
  async handleSubscriptionUpdate(
    subscriptionId: string,
    status: string,
    planPriceId: string
  ): Promise<void> {
    const supabase = createAdminClient();

    // Find plan by price ID
    const plan = PLANS.find(
      (p) => p.stripePriceIdMonthly === planPriceId || p.stripePriceIdAnnual === planPriceId
    );

    // Update business subscription status
    await supabase
      .from("businesses")
      .update({
        subscription_id: subscriptionId,
        subscription_status: status,
        subscription_plan: plan?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscriptionId);

    // If subscription became active, add monthly credits
    if (status === "active" && plan) {
      // Get business by subscription
      const { data: business } = await supabase
        .from("businesses")
        .select("id")
        .eq("subscription_id", subscriptionId)
        .single();

      if (business) {
        await creditsService.addCredits(business.id, plan.limits.smsCredits, {
          type: "subscription",
          subscriptionId,
          planId: plan.id,
        });
      }
    }
  }

  /**
   * Process auto-refill for a business
   */
  async processAutoRefill(business: Business): Promise<boolean> {
    if (!business.auto_refill_enabled || !business.stripe_customer_id) {
      return false;
    }

    const amount = business.auto_refill_amount || 500;
    
    // Get credit package price
    const pricePerCredit = 0.05; // $0.05 per credit
    const totalPrice = Math.round(amount * pricePerCredit * 100); // in cents

    try {
      // Get default payment method
      if (!stripe) throw new Error("Stripe not configured");

      const paymentMethods = await stripe.paymentMethods.list({
        customer: business.stripe_customer_id,
        type: "card",
        limit: 1,
      });

      if (paymentMethods.data.length === 0) {
        console.log(`No payment method for business ${business.id}`);
        return false;
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: "usd",
        customer: business.stripe_customer_id,
        payment_method: paymentMethods.data[0].id,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
        metadata: {
          business_id: business.id,
          type: "auto_refill",
          credits: String(amount),
        },
      });

      if (paymentIntent.status === "succeeded") {
        // Add credits
        await creditsService.addCredits(business.id, amount, {
          type: "auto_refill",
          paymentIntentId: paymentIntent.id,
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error(`Auto-refill failed for business ${business.id}:`, error);
      return false;
    }
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
      .from("businesses")
      .update({
        auto_refill_enabled: settings.enabled,
        auto_refill_threshold: settings.threshold,
        auto_refill_amount: settings.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);
  }
}

export const billingService = new BillingService();
