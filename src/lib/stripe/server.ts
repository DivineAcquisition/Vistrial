// ============================================
// STRIPE SERVER CLIENT
// Used for server-side Stripe API operations
// ============================================

import Stripe from 'stripe';

// Singleton pattern for Stripe client
let stripeClient: Stripe | null = null;

export function getStripeServerClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-04-10',
    typescript: true,
  });

  return stripeClient;
}

// Legacy export for backward compatibility
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  : null;

// ============================================
// CUSTOMER MANAGEMENT
// ============================================

/**
 * Create a new Stripe customer
 */
export async function createStripeCustomer(params: {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const stripe = getStripeServerClient();

  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      ...params.metadata,
      source: 'vistrial',
    },
  });

  return customer;
}

/**
 * Get a Stripe customer by ID
 */
export async function getStripeCustomer(customerId: string): Promise<Stripe.Customer | null> {
  const stripe = getStripeServerClient();

  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      return null;
    }
    
    return customer as Stripe.Customer;
  } catch (error) {
    console.error('Error retrieving Stripe customer:', error);
    return null;
  }
}

/**
 * Update a Stripe customer
 */
export async function updateStripeCustomer(
  customerId: string,
  params: Stripe.CustomerUpdateParams
): Promise<Stripe.Customer> {
  const stripe = getStripeServerClient();
  return stripe.customers.update(customerId, params);
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
  const stripeInstance = getStripeServerClient();

  // Check for existing customer
  const existing = await stripeInstance.customers.list({
    email,
    limit: 1,
  });

  if (existing.data.length > 0) {
    return existing.data[0];
  }

  // Create new customer
  return stripeInstance.customers.create({
    email,
    name,
    metadata,
  });
}

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

/**
 * Create a checkout session for subscription
 */
export async function createSubscriptionCheckout(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  trialPeriodDays?: number;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeServerClient();

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
    subscription_data: params.trialPeriodDays
      ? {
          trial_period_days: params.trialPeriodDays,
          metadata: params.metadata,
        }
      : {
          metadata: params.metadata,
        },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  });

  return session;
}

/**
 * Create a checkout session (legacy compatible)
 */
export async function createCheckoutSession({
  customerId,
  priceId,
  mode = 'subscription',
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId: string;
  priceId: string;
  mode?: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  const stripeInstance = getStripeServerClient();

  return stripeInstance.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

/**
 * Get a subscription by ID
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  const stripe = getStripeServerClient();

  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    return null;
  }
}

/**
 * Update a subscription (e.g., change plan)
 */
export async function updateSubscription(
  subscriptionId: string,
  params: Stripe.SubscriptionUpdateParams
): Promise<Stripe.Subscription> {
  const stripe = getStripeServerClient();
  return stripe.subscriptions.update(subscriptionId, params);
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  const stripe = getStripeServerClient();

  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  return stripe.subscriptions.cancel(subscriptionId);
}

// ============================================
// CUSTOMER PORTAL
// ============================================

/**
 * Create a billing portal session
 */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripeServerClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  return session;
}

// ============================================
// CREDIT PURCHASES (ONE-TIME CHARGES)
// ============================================

/**
 * Create a payment intent for credit refill
 */
export async function createCreditRefillPaymentIntent(params: {
  customerId: string;
  amountCents: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeServerClient();

  // Minimum charge is $0.50 (50 cents) for Stripe
  if (params.amountCents < 50) {
    throw new Error('Minimum charge amount is $0.50');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: 'usd',
    customer: params.customerId,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    metadata: {
      type: 'credit_refill',
      ...params.metadata,
    },
    description: `Vistrial credit refill - $${(params.amountCents / 100).toFixed(2)}`,
  });

  return paymentIntent;
}

/**
 * Create a payment intent (legacy compatible)
 */
export async function createPaymentIntent({
  amount,
  currency = 'usd',
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
  const stripeInstance = getStripeServerClient();

  return stripeInstance.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    confirm: !!paymentMethodId,
    metadata,
  });
}

/**
 * Charge a customer's default payment method for credit refill
 * Used for automatic refills
 */
export async function chargeCustomerForCredits(params: {
  customerId: string;
  amountCents: number;
  organizationId: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeServerClient();

  // Get customer's default payment method
  const customer = await stripe.customers.retrieve(params.customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });

  if (customer.deleted) {
    throw new Error('Customer has been deleted');
  }

  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;

  if (!defaultPaymentMethod) {
    throw new Error('No default payment method found');
  }

  const paymentMethodId =
    typeof defaultPaymentMethod === 'string'
      ? defaultPaymentMethod
      : defaultPaymentMethod.id;

  // Create and confirm payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: 'usd',
    customer: params.customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      type: 'credit_refill',
      organization_id: params.organizationId,
      auto_refill: 'true',
    },
    description: `Vistrial auto-refill - $${(params.amountCents / 100).toFixed(2)}`,
  });

  return paymentIntent;
}

// ============================================
// WEBHOOK VERIFICATION
// ============================================

/**
 * Verify and construct webhook event
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripeServerClient();

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Verify Stripe webhook signature (legacy compatible)
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return constructWebhookEvent(payload, signature);
}

// ============================================
// INVOICE MANAGEMENT
// ============================================

/**
 * Get upcoming invoice for a subscription
 */
export async function getUpcomingInvoice(customerId: string): Promise<Stripe.UpcomingInvoice | null> {
  const stripe = getStripeServerClient();

  try {
    return await stripe.invoices.retrieveUpcoming({
      customer: customerId,
    });
  } catch (error) {
    // No upcoming invoice (e.g., no active subscription)
    return null;
  }
}

/**
 * List recent invoices for a customer
 */
export async function listInvoices(
  customerId: string,
  limit: number = 10
): Promise<Stripe.Invoice[]> {
  const stripe = getStripeServerClient();

  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data;
}

// ============================================
// PAYMENT METHOD MANAGEMENT
// ============================================

/**
 * List payment methods for a customer
 */
export async function listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
  const stripe = getStripeServerClient();

  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  return paymentMethods.data;
}

/**
 * Set default payment method for a customer
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<Stripe.Customer> {
  const stripe = getStripeServerClient();

  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}
