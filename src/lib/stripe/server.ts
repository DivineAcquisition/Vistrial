/**
 * Stripe Server Utilities
 * 
 * Server-side Stripe operations:
 * - Create checkout sessions
 * - Create customer portal sessions
 * - Process webhook events
 * - Manage subscriptions
 * - Handle payment intents
 */

import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2024-04-10",
    })
  : null;

/**
 * Create a checkout session for subscription or one-time payment
 */
export async function createCheckoutSession({
  customerId,
  priceId,
  mode = "subscription",
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId: string;
  priceId: string;
  mode?: "subscription" | "payment";
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  if (!stripe) throw new Error("Stripe is not configured");

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

/**
 * Create a customer portal session
 */
export async function createPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  if (!stripe) throw new Error("Stripe is not configured");

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Get or create a Stripe customer
 */
export async function getOrCreateCustomer({
  email,
  name,
  metadata,
}: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}) {
  if (!stripe) throw new Error("Stripe is not configured");

  // Check for existing customer
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existing.data.length > 0) {
    return existing.data[0];
  }

  // Create new customer
  return stripe.customers.create({
    email,
    name,
    metadata,
  });
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  if (!stripe) throw new Error("Stripe is not configured");

  return stripe.subscriptions.cancel(subscriptionId);
}

/**
 * Update subscription to a new price
 */
export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
) {
  if (!stripe) throw new Error("Stripe is not configured");

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  return stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newPriceId,
    }],
  });
}

/**
 * Create a payment intent for one-time charge
 */
export async function createPaymentIntent({
  amount,
  currency = "usd",
  customerId,
  paymentMethodId,
  metadata,
}: {
  amount: number;
  currency?: string;
  customerId: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}) {
  if (!stripe) throw new Error("Stripe is not configured");

  return stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    confirm: !!paymentMethodId,
    metadata,
  });
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!stripe) throw new Error("Stripe is not configured");
  
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
