import { stripe, PLATFORM_FEE_PERCENT, dollarsToCents } from './client'
import { attachPaymentMethod, setDefaultPaymentMethod } from './payments'
import { FREQUENCY_TO_STRIPE_INTERVAL } from '@/data/payment-schema'
import type { SubscriptionResult, MembershipStatus } from '@/data/payment-schema'

// ============================================
// CREATE MEMBERSHIP SUBSCRIPTION
// Creates a recurring subscription for a membership
// ============================================

export interface CreateSubscriptionParams {
  membershipId: string
  customerId: string
  paymentMethodId: string
  stripeAccountId: string
  pricePerService: number
  frequency: string
  serviceName: string
  businessId: string
  contactId: string
}

export async function createMembershipSubscription(
  params: CreateSubscriptionParams
): Promise<SubscriptionResult> {
  const {
    membershipId,
    customerId,
    paymentMethodId,
    stripeAccountId,
    pricePerService,
    frequency,
    serviceName,
    businessId,
    contactId,
  } = params

  try {
    // Attach payment method to customer
    await attachPaymentMethod(paymentMethodId, customerId, stripeAccountId)

    // Set as default payment method
    await setDefaultPaymentMethod(customerId, paymentMethodId, stripeAccountId)

    // Get interval from frequency
    const intervalConfig = FREQUENCY_TO_STRIPE_INTERVAL[frequency] || FREQUENCY_TO_STRIPE_INTERVAL.biweekly
    const { interval, intervalCount } = intervalConfig

    // Create product
    const product = await stripe.products.create(
      {
        name: `${serviceName} - ${frequency}`,
        metadata: {
          membership_id: membershipId,
          business_id: businessId,
          platform: 'vistrial',
        },
      },
      { stripeAccount: stripeAccountId }
    )

    // Create price
    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: dollarsToCents(pricePerService),
        currency: 'usd',
        recurring: {
          interval,
          interval_count: intervalCount,
        },
        metadata: {
          membership_id: membershipId,
        },
      },
      { stripeAccount: stripeAccountId }
    )

    // Create subscription
    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: price.id }],
        application_fee_percent: PLATFORM_FEE_PERCENT,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        metadata: {
          membership_id: membershipId,
          business_id: businessId,
          contact_id: contactId,
          platform: 'vistrial',
        },
        expand: ['latest_invoice.payment_intent'],
      },
      { stripeAccount: stripeAccountId }
    )

    // Get client secret for initial payment
    // The invoice has payment_intent when expanded
    const invoice = subscription.latest_invoice as unknown as { 
      payment_intent?: { client_secret?: string } | string 
    }
    const paymentIntent = invoice?.payment_intent
    const clientSecret = typeof paymentIntent === 'object' ? paymentIntent?.client_secret : undefined

    return {
      success: true,
      subscriptionId: subscription.id,
      clientSecret: clientSecret || undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create subscription'
    return { success: false, error: message }
  }
}

// ============================================
// PAUSE SUBSCRIPTION
// Temporarily pauses billing for a subscription
// ============================================

export async function pauseSubscription(
  subscriptionId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.subscriptions.update(
      subscriptionId,
      {
        pause_collection: {
          behavior: 'void',
        },
      },
      { stripeAccount: stripeAccountId }
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause subscription'
    return { success: false, error: message }
  }
}

// ============================================
// RESUME SUBSCRIPTION
// Resumes a paused subscription
// ============================================

export async function resumeSubscription(
  subscriptionId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.subscriptions.update(
      subscriptionId,
      {
        pause_collection: '',
      },
      { stripeAccount: stripeAccountId }
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume subscription'
    return { success: false, error: message }
  }
}

// ============================================
// CANCEL SUBSCRIPTION
// Cancels a subscription immediately or at period end
// ============================================

export async function cancelSubscription(
  subscriptionId: string,
  stripeAccountId: string,
  cancelImmediately: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    if (cancelImmediately) {
      await stripe.subscriptions.cancel(subscriptionId, {
        stripeAccount: stripeAccountId,
      })
    } else {
      await stripe.subscriptions.update(
        subscriptionId,
        { cancel_at_period_end: true },
        { stripeAccount: stripeAccountId }
      )
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription'
    return { success: false, error: message }
  }
}

// ============================================
// REACTIVATE SUBSCRIPTION
// Reactivates a subscription that was set to cancel at period end
// ============================================

export async function reactivateSubscription(
  subscriptionId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false },
      { stripeAccount: stripeAccountId }
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reactivate subscription'
    return { success: false, error: message }
  }
}

// ============================================
// UPDATE SUBSCRIPTION PRICE
// Updates the price of an existing subscription
// ============================================

export interface UpdateSubscriptionPriceParams {
  subscriptionId: string
  productId: string
  newPrice: number
  frequency: string
  stripeAccountId: string
}

export async function updateSubscriptionPrice(
  params: UpdateSubscriptionPriceParams
): Promise<{ success: boolean; newPriceId?: string; error?: string }> {
  const { subscriptionId, productId, newPrice, frequency, stripeAccountId } = params

  try {
    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      {},
      { stripeAccount: stripeAccountId }
    )

    // Get interval from frequency
    const intervalConfig = FREQUENCY_TO_STRIPE_INTERVAL[frequency] || FREQUENCY_TO_STRIPE_INTERVAL.biweekly
    const { interval, intervalCount } = intervalConfig

    // Create new price
    const newPriceObj = await stripe.prices.create(
      {
        product: productId,
        unit_amount: dollarsToCents(newPrice),
        currency: 'usd',
        recurring: {
          interval,
          interval_count: intervalCount,
        },
      },
      { stripeAccount: stripeAccountId }
    )

    // Update subscription with new price
    await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceObj.id,
          },
        ],
        proration_behavior: 'none', // Don't prorate, apply from next period
      },
      { stripeAccount: stripeAccountId }
    )

    return { success: true, newPriceId: newPriceObj.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update subscription price'
    return { success: false, error: message }
  }
}

// ============================================
// UPDATE SUBSCRIPTION PAYMENT METHOD
// Changes the default payment method for a subscription
// ============================================

export async function updateSubscriptionPaymentMethod(
  subscriptionId: string,
  customerId: string,
  paymentMethodId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Attach new payment method
    await attachPaymentMethod(paymentMethodId, customerId, stripeAccountId)

    // Set as default
    await setDefaultPaymentMethod(customerId, paymentMethodId, stripeAccountId)

    // Update subscription
    await stripe.subscriptions.update(
      subscriptionId,
      { default_payment_method: paymentMethodId },
      { stripeAccount: stripeAccountId }
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update payment method'
    return { success: false, error: message }
  }
}

// ============================================
// GET SUBSCRIPTION DETAILS
// Retrieves details of a subscription
// ============================================

export async function getSubscriptionDetails(
  subscriptionId: string,
  stripeAccountId: string
): Promise<{
  id: string
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  canceledAt: Date | null
  endedAt: Date | null
  trialEnd: Date | null
  priceId: string
  productId: string
  amount: number
  interval: string
  intervalCount: number
  defaultPaymentMethod: string | null
}> {
  const subscription = await stripe.subscriptions.retrieve(
    subscriptionId,
    { expand: ['default_payment_method'] },
    { stripeAccount: stripeAccountId }
  )

  const item = subscription.items.data[0]
  
  // Cast subscription to access timestamp properties
  const sub = subscription as unknown as {
    current_period_start: number
    current_period_end: number
    canceled_at: number | null
    ended_at: number | null
    trial_end: number | null
  }

  return {
    id: subscription.id,
    status: subscription.status,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    endedAt: sub.ended_at ? new Date(sub.ended_at * 1000) : null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    priceId: item.price.id,
    productId: item.price.product as string,
    amount: (item.price.unit_amount || 0) / 100,
    interval: item.price.recurring?.interval || 'month',
    intervalCount: item.price.recurring?.interval_count || 1,
    defaultPaymentMethod: subscription.default_payment_method as string | null,
  }
}

// ============================================
// LIST SUBSCRIPTION INVOICES
// Lists all invoices for a subscription
// ============================================

export async function listSubscriptionInvoices(
  subscriptionId: string,
  stripeAccountId: string,
  limit: number = 10
): Promise<
  {
    id: string
    amount: number
    status: string | null
    paid: boolean
    paidAt: Date | null
    hostedInvoiceUrl: string | null
    invoicePdf: string | null
    periodStart: Date
    periodEnd: Date
  }[]
> {
  const invoices = await stripe.invoices.list(
    {
      subscription: subscriptionId,
      limit,
    },
    { stripeAccount: stripeAccountId }
  )

  return invoices.data.map((invoice) => {
    // Cast to access properties with different types
    const inv = invoice as unknown as {
      paid?: boolean
      status_transitions?: { paid_at?: number }
      period_start: number
      period_end: number
    }
    
    return {
      id: invoice.id,
      amount: (invoice.amount_paid || 0) / 100,
      status: invoice.status ?? null,
      paid: inv.paid ?? false,
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      periodStart: new Date(inv.period_start * 1000),
      periodEnd: new Date(inv.period_end * 1000),
    }
  })
}

// ============================================
// MAP STRIPE STATUS TO MEMBERSHIP STATUS
// Converts Stripe subscription status to our internal status
// ============================================

export function mapStripeStatusToMembershipStatus(
  stripeStatus: string,
  pauseCollection: boolean,
  cancelAtPeriodEnd: boolean
): MembershipStatus {
  if (pauseCollection) return 'paused'
  if (cancelAtPeriodEnd) return 'canceling'

  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'incomplete':
    case 'incomplete_expired':
      return 'pending'
    default:
      return 'pending'
  }
}

// ============================================
// RETRY SUBSCRIPTION PAYMENT
// Retries a failed subscription payment
// ============================================

export async function retrySubscriptionPayment(
  subscriptionId: string,
  stripeAccountId: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    // Get the latest invoice
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ['latest_invoice'] },
      { stripeAccount: stripeAccountId }
    )

    // Cast to access invoice with correct typing
    const invoice = subscription.latest_invoice as unknown as { id: string; status?: string } | null

    if (!invoice || invoice.status === 'paid') {
      return { success: false, error: 'No unpaid invoice found' }
    }

    // Attempt to pay the invoice
    const paidInvoice = await stripe.invoices.pay(
      invoice.id,
      {},
      { stripeAccount: stripeAccountId }
    )

    // Cast to access paid property
    const paid = (paidInvoice as unknown as { paid?: boolean }).paid ?? false

    return {
      success: paid,
      invoiceId: paidInvoice.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retry payment'
    return { success: false, error: message }
  }
}

// ============================================
// PREVIEW SUBSCRIPTION UPDATE
// Previews what the next invoice will look like after a subscription update
// ============================================

export async function previewSubscriptionUpdate(
  subscriptionId: string,
  newPriceId: string,
  stripeAccountId: string
): Promise<{
  subtotal: number
  total: number
  amountDue: number
  prorationAmount: number
}> {
  const subscription = await stripe.subscriptions.retrieve(
    subscriptionId,
    {},
    { stripeAccount: stripeAccountId }
  )

  const preview = await stripe.invoices.createPreview(
    {
      customer: subscription.customer as string,
      subscription: subscriptionId,
      subscription_details: {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
      },
    },
    { stripeAccount: stripeAccountId }
  )

  // Cast line items to access proration property
  const lines = preview.lines.data as unknown as Array<{ proration?: boolean; amount: number }>
  const prorationLines = lines.filter((line) => line.proration)
  const prorationAmount = prorationLines.reduce((sum, line) => sum + line.amount, 0)

  return {
    subtotal: (preview.subtotal || 0) / 100,
    total: (preview.total || 0) / 100,
    amountDue: (preview.amount_due || 0) / 100,
    prorationAmount: prorationAmount / 100,
  }
}
