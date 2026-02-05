// @ts-nocheck
"use server";

import { stripe } from "./client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================
// STRIPE CONNECT - ONBOARD BUSINESS
// ============================================

export async function createStripeConnectAccount(businessId: string) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  // Verify ownership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: business } = await admin
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .single();

  if (!business) return { error: "Business not found" };

  // Check if already has Stripe account
  if (business.stripe_account_id) {
    // Create new account link for existing account
    const accountLink = await stripe.accountLinks.create({
      account: business.stripe_account_id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?refresh=true`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?success=true`,
      type: "account_onboarding",
    });
    return { url: accountLink.url };
  }

  // Create new Connect account
  const account = await stripe.accounts.create({
    type: "standard",
    email: business.email || undefined,
    business_profile: {
      name: business.name,
      url: business.website || undefined,
    },
    metadata: {
      business_id: businessId,
    },
  });

  // Save account ID
  await admin
    .from("businesses")
    .update({ stripe_account_id: account.id })
    .eq("id", businessId);

  // Create account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?refresh=true`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?success=true`,
    type: "account_onboarding",
  });

  return { url: accountLink.url };
}

export async function getStripeAccountStatus(businessId: string) {
  if (!stripe) {
    return { connected: false, details_submitted: false, charges_enabled: false };
  }

  const admin = createAdminClient();

  const { data: business } = await admin
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .single();

  if (!business?.stripe_account_id) {
    return { connected: false, details_submitted: false, charges_enabled: false };
  }

  const account = await stripe.accounts.retrieve(business.stripe_account_id);

  return {
    connected: true,
    details_submitted: account.details_submitted,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
  };
}

// ============================================
// PAYMENT INTENTS - DEPOSITS
// ============================================

export async function createDepositPaymentIntent(data: {
  businessId: string;
  amount: number; // in cents
  customerId?: string;
  metadata?: Record<string, string>;
}) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  // Get business Stripe account
  const { data: business } = await admin
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", data.businessId)
    .single();

  if (!business?.stripe_account_id) {
    return { error: "Business not connected to Stripe" };
  }

  // Calculate platform fee (2.9% + 30¢ already taken by Stripe, we take $0 extra for now)
  const applicationFee = 0;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: data.amount,
    currency: "usd",
    application_fee_amount: applicationFee,
    transfer_data: {
      destination: business.stripe_account_id,
    },
    metadata: {
      business_id: data.businessId,
      ...data.metadata,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

export async function confirmDepositPaid(paymentIntentId: string) {
  if (!stripe) {
    return false;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.status === "succeeded";
}

// ============================================
// SUBSCRIPTIONS - MEMBERSHIPS
// ============================================

export async function createOrGetStripeCustomer(data: {
  businessId: string;
  contactId: string;
  email: string;
  name: string;
  phone?: string;
}) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  // Check if contact already has Stripe customer
  const { data: contact } = await admin
    .from("contacts")
    .select("stripe_customer_id")
    .eq("id", data.contactId)
    .single();

  if (contact?.stripe_customer_id) {
    return { customerId: contact.stripe_customer_id };
  }

  // Get business Stripe account
  const { data: business } = await admin
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", data.businessId)
    .single();

  if (!business?.stripe_account_id) {
    return { error: "Business not connected to Stripe" };
  }

  // Create customer on connected account
  const customer = await stripe.customers.create(
    {
      email: data.email,
      name: data.name,
      phone: data.phone,
      metadata: {
        contact_id: data.contactId,
        business_id: data.businessId,
      },
    },
    {
      stripeAccount: business.stripe_account_id,
    }
  );

  // Save customer ID
  await admin
    .from("contacts")
    .update({ stripe_customer_id: customer.id })
    .eq("id", data.contactId);

  return { customerId: customer.id };
}

export async function createMembershipSubscription(data: {
  businessId: string;
  contactId: string;
  membershipId: string;
  pricePerService: number; // in dollars
  frequency: "weekly" | "biweekly" | "monthly";
  paymentMethodId: string;
}) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  // Get business and contact
  const { data: business } = await admin
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", data.businessId)
    .single();

  const { data: contact } = await admin
    .from("contacts")
    .select("stripe_customer_id, email, first_name, last_name")
    .eq("id", data.contactId)
    .single();

  if (!business?.stripe_account_id) {
    return { error: "Business not connected to Stripe" };
  }

  // Get or create customer
  let customerId = contact?.stripe_customer_id;
  if (!customerId) {
    const result = await createOrGetStripeCustomer({
      businessId: data.businessId,
      contactId: data.contactId,
      email: contact?.email || "",
      name: `${contact?.first_name} ${contact?.last_name}`,
    });
    if (result.error) return result;
    customerId = result.customerId;
  }

  // Attach payment method to customer
  await stripe.paymentMethods.attach(
    data.paymentMethodId,
    { customer: customerId! },
    { stripeAccount: business.stripe_account_id }
  );

  // Set as default payment method
  await stripe.customers.update(
    customerId!,
    { invoice_settings: { default_payment_method: data.paymentMethodId } },
    { stripeAccount: business.stripe_account_id }
  );

  // Create price for this subscription
  const intervalMap = {
    weekly: { interval: "week" as const, interval_count: 1 },
    biweekly: { interval: "week" as const, interval_count: 2 },
    monthly: { interval: "month" as const, interval_count: 1 },
  };

  const price = await stripe.prices.create(
    {
      unit_amount: Math.round(data.pricePerService * 100),
      currency: "usd",
      recurring: intervalMap[data.frequency],
      product_data: {
        name: `${data.frequency} Cleaning Service`,
        metadata: {
          membership_id: data.membershipId,
        },
      },
    },
    { stripeAccount: business.stripe_account_id }
  );

  // Create subscription
  const subscription = await stripe.subscriptions.create(
    {
      customer: customerId!,
      items: [{ price: price.id }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        membership_id: data.membershipId,
        business_id: data.businessId,
        contact_id: data.contactId,
      },
    },
    { stripeAccount: business.stripe_account_id }
  );

  // Update membership with subscription ID
  await admin
    .from("memberships")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_price_id: price.id,
    })
    .eq("id", data.membershipId);

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
  };
}

export async function pauseStripeSubscription(membershipId: string) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("stripe_subscription_id, business_id, businesses(stripe_account_id)")
    .eq("id", membershipId)
    .single();

  if (!membership?.stripe_subscription_id) {
    return { error: "No subscription found" };
  }

  const stripeAccountId = (membership.businesses as any)?.stripe_account_id;

  await stripe.subscriptions.update(
    membership.stripe_subscription_id,
    { pause_collection: { behavior: "void" } },
    { stripeAccount: stripeAccountId }
  );

  await admin
    .from("memberships")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", membershipId);

  return { success: true };
}

export async function resumeStripeSubscription(membershipId: string) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("stripe_subscription_id, business_id, businesses(stripe_account_id)")
    .eq("id", membershipId)
    .single();

  if (!membership?.stripe_subscription_id) {
    return { error: "No subscription found" };
  }

  const stripeAccountId = (membership.businesses as any)?.stripe_account_id;

  await stripe.subscriptions.update(
    membership.stripe_subscription_id,
    { pause_collection: "" as any }, // Unpause
    { stripeAccount: stripeAccountId }
  );

  await admin
    .from("memberships")
    .update({ status: "active", paused_at: null })
    .eq("id", membershipId);

  return { success: true };
}

export async function cancelStripeSubscription(membershipId: string, immediate = false) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("stripe_subscription_id, business_id, businesses(stripe_account_id)")
    .eq("id", membershipId)
    .single();

  if (!membership?.stripe_subscription_id) {
    return { error: "No subscription found" };
  }

  const stripeAccountId = (membership.businesses as any)?.stripe_account_id;

  if (immediate) {
    await stripe.subscriptions.cancel(
      membership.stripe_subscription_id,
      { stripeAccount: stripeAccountId }
    );
  } else {
    await stripe.subscriptions.update(
      membership.stripe_subscription_id,
      { cancel_at_period_end: true },
      { stripeAccount: stripeAccountId }
    );
  }

  await admin
    .from("memberships")
    .update({
      status: immediate ? "canceled" : "canceling",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", membershipId);

  return { success: true };
}

// ============================================
// UPDATE PAYMENT METHOD
// ============================================

export async function updatePaymentMethod(data: {
  membershipId: string;
  paymentMethodId: string;
}) {
  if (!stripe) {
    return { error: "Stripe not configured" };
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select(`
      stripe_subscription_id,
      contact_id,
      contacts(stripe_customer_id),
      business_id,
      businesses(stripe_account_id)
    `)
    .eq("id", data.membershipId)
    .single();

  if (!membership?.stripe_subscription_id) {
    return { error: "No subscription found" };
  }

  const stripeAccountId = (membership.businesses as any)?.stripe_account_id;
  const customerId = (membership.contacts as any)?.stripe_customer_id;

  // Attach new payment method
  await stripe.paymentMethods.attach(
    data.paymentMethodId,
    { customer: customerId },
    { stripeAccount: stripeAccountId }
  );

  // Set as default
  await stripe.customers.update(
    customerId,
    { invoice_settings: { default_payment_method: data.paymentMethodId } },
    { stripeAccount: stripeAccountId }
  );

  // Update subscription
  await stripe.subscriptions.update(
    membership.stripe_subscription_id,
    { default_payment_method: data.paymentMethodId },
    { stripeAccount: stripeAccountId }
  );

  return { success: true };
}
