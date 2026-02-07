// ============================================
// Recurring membership subscriptions
// ============================================

import { stripe } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateSubscriptionParams {
  businessId: string;
  customerId: string;
  membershipId: string;
  priceAmount: number; // in cents
  interval: "week" | "month";
  intervalCount: number; // 1 for weekly, 2 for biweekly, 1 for monthly
}

export async function createMembershipSubscription({
  businessId,
  customerId,
  membershipId,
  priceAmount,
  interval,
  intervalCount,
}: CreateSubscriptionParams) {
  const supabase = createAdminClient();

  // Get business Stripe account
  const { data: business } = await supabase
    .from("businesses")
    .select("stripe_account_id, name")
    .eq("id", businessId)
    .single();

  if (!business?.stripe_account_id) {
    throw new Error("Business has not connected Stripe");
  }

  // Create a price for this subscription
  const price = await stripe.prices.create(
    {
      unit_amount: priceAmount,
      currency: "usd",
      recurring: {
        interval,
        interval_count: intervalCount,
      },
      product_data: {
        name: `Recurring Cleaning - ${business.name}`,
        metadata: {
          business_id: businessId,
          membership_id: membershipId,
        },
      },
    },
    {
      stripeAccount: business.stripe_account_id,
    }
  );

  // Calculate platform fee (2.5%)
  const platformFeePercent = 2.5;

  // Create subscription
  const subscription = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: price.id }],
      metadata: {
        business_id: businessId,
        membership_id: membershipId,
      },
      application_fee_percent: platformFeePercent,
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    },
    {
      stripeAccount: business.stripe_account_id,
    }
  );

  // Update membership with Stripe subscription ID
  await supabase
    .from("memberships")
    .update({ stripe_subscription_id: subscription.id })
    .eq("id", membershipId);

  return subscription;
}

// Pause subscription
export async function pauseSubscription(
  subscriptionId: string,
  stripeAccountId: string
) {
  const subscription = await stripe.subscriptions.update(
    subscriptionId,
    {
      pause_collection: {
        behavior: "void",
      },
    },
    {
      stripeAccount: stripeAccountId,
    }
  );

  return subscription;
}

// Resume subscription
export async function resumeSubscription(
  subscriptionId: string,
  stripeAccountId: string
) {
  const subscription = await stripe.subscriptions.update(
    subscriptionId,
    {
      pause_collection: "",
    },
    {
      stripeAccount: stripeAccountId,
    }
  );

  return subscription;
}

// Cancel subscription
export async function cancelSubscription(
  subscriptionId: string,
  stripeAccountId: string,
  cancelAtPeriodEnd: boolean = true
) {
  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      { stripeAccount: stripeAccountId }
    );
  }

  return stripe.subscriptions.cancel(subscriptionId, {
    stripeAccount: stripeAccountId,
  });
}

// Update subscription price
export async function updateSubscriptionPrice(
  subscriptionId: string,
  stripeAccountId: string,
  newPriceAmount: number
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    stripeAccount: stripeAccountId,
  });

  // Create new price
  const newPrice = await stripe.prices.create(
    {
      unit_amount: newPriceAmount,
      currency: "usd",
      recurring: {
        interval: subscription.items.data[0].price.recurring!.interval,
        interval_count:
          subscription.items.data[0].price.recurring!.interval_count,
      },
      product: subscription.items.data[0].price.product as string,
    },
    {
      stripeAccount: stripeAccountId,
    }
  );

  // Update subscription with new price
  return stripe.subscriptions.update(
    subscriptionId,
    {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPrice.id,
        },
      ],
    },
    {
      stripeAccount: stripeAccountId,
    }
  );
}
