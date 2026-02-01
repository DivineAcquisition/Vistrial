import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import type { StripeWebhookEventType } from '@/data/payment-schema'

// ============================================
// STRIPE WEBHOOK HANDLER
// Handles all incoming Stripe webhook events
// ============================================

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    await handleWebhookEvent(event)
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

// ============================================
// WEBHOOK EVENT ROUTER
// Routes events to appropriate handlers
// ============================================

async function handleWebhookEvent(event: Stripe.Event) {
  const eventType = event.type as StripeWebhookEventType

  switch (eventType) {
    // ==========================================
    // PAYMENT INTENT EVENTS
    // ==========================================
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
      break

    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
      break

    // ==========================================
    // SUBSCRIPTION EVENTS
    // ==========================================
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break

    // ==========================================
    // INVOICE EVENTS
    // ==========================================
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice)
      break

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      break

    // ==========================================
    // CONNECT ACCOUNT EVENTS
    // ==========================================
    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account, event.account)
      break

    // ==========================================
    // PAYOUT EVENTS
    // ==========================================
    case 'payout.created':
    case 'payout.paid':
    case 'payout.failed':
      await handlePayoutEvent(event.data.object as Stripe.Payout, eventType, event.account)
      break

    // ==========================================
    // REFUND EVENTS
    // ==========================================
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge)
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
}

// ============================================
// PAYMENT INTENT HANDLERS
// ============================================

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata

  console.log('Payment succeeded:', {
    id: paymentIntent.id,
    amount: paymentIntent.amount / 100,
    businessId: metadata.business_id,
    contactId: metadata.contact_id,
    bookingId: metadata.booking_id,
    paymentType: metadata.payment_type,
  })

  // In production, you would:
  // 1. Update the payment record in the database
  // 2. Update the booking status if applicable
  // 3. Send confirmation email/SMS
  // 4. Log customer activity

  // Example database update:
  // await supabase
  //   .from('payments')
  //   .update({
  //     status: 'succeeded',
  //     succeeded_at: new Date().toISOString(),
  //     stripe_charge_id: paymentIntent.latest_charge,
  //     net_amount: (paymentIntent.amount - (paymentIntent.application_fee_amount || 0)) / 100,
  //   })
  //   .eq('stripe_payment_intent_id', paymentIntent.id)
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const error = paymentIntent.last_payment_error
  const failureMessage = error?.message || 'Payment failed'

  console.log('Payment failed:', {
    id: paymentIntent.id,
    reason: failureMessage,
    code: error?.code,
  })

  // In production, you would:
  // 1. Update the payment record
  // 2. Update booking payment status
  // 3. Notify customer of failure
}

// ============================================
// SUBSCRIPTION HANDLERS
// ============================================

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const membershipId = subscription.metadata.membership_id
  const sub = subscription as unknown as { 
    current_period_end: number
    current_period_start: number 
  }

  console.log('Subscription created:', {
    id: subscription.id,
    membershipId,
    status: subscription.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
  })

  // In production, update membership with subscription details
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const membershipId = subscription.metadata.membership_id

  // Determine status
  let status = 'active'
  if (subscription.status === 'past_due') status = 'past_due'
  if (subscription.status === 'canceled') status = 'canceled'
  if (subscription.status === 'unpaid') status = 'past_due'
  if (subscription.pause_collection) status = 'paused'
  if (subscription.cancel_at_period_end) status = 'canceling'

  console.log('Subscription updated:', {
    id: subscription.id,
    membershipId,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  })

  // In production, update membership status
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const membershipId = subscription.metadata.membership_id

  console.log('Subscription deleted:', {
    id: subscription.id,
    membershipId,
  })

  // In production, update membership as canceled
}

// ============================================
// INVOICE HANDLERS
// ============================================

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Cast invoice to access properties that may not be in the type definition
  const inv = invoice as unknown as {
    subscription: string | null
    billing_reason: string | null
    amount_paid: number
  }
  
  const subscriptionId = inv.subscription

  // Only handle subscription renewal invoices
  if (!subscriptionId || inv.billing_reason !== 'subscription_cycle') {
    return
  }

  console.log('Subscription invoice paid:', {
    invoiceId: invoice.id,
    subscriptionId,
    amount: (inv.amount_paid || 0) / 100,
  })

  // In production, you would:
  // 1. Create a payment record
  // 2. Create the next scheduled booking
  // 3. Update membership next_service_date
  // 4. Send confirmation
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Cast invoice to access properties that may not be in the type definition
  const inv = invoice as unknown as {
    subscription: string | null
    attempt_count: number
  }
  
  const subscriptionId = inv.subscription

  if (!subscriptionId) return

  console.log('Subscription payment failed:', {
    invoiceId: invoice.id,
    subscriptionId,
    attemptCount: inv.attempt_count,
  })

  // In production, you would:
  // 1. Update membership status to past_due
  // 2. Send payment failed notification
  // 3. Possibly trigger dunning process
}

// ============================================
// CONNECT ACCOUNT HANDLERS
// ============================================

async function handleAccountUpdated(account: Stripe.Account, accountId?: string | null) {
  const stripeAccountId = accountId || account.id

  // Determine account status
  let status = 'pending'
  if (account.charges_enabled && account.payouts_enabled) {
    status = 'active'
  } else if (account.requirements?.disabled_reason) {
    status = 'restricted'
  }

  console.log('Connect account updated:', {
    id: stripeAccountId,
    status,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    disabledReason: account.requirements?.disabled_reason,
  })

  // In production, update business Stripe fields
}

// ============================================
// PAYOUT HANDLERS
// ============================================

async function handlePayoutEvent(
  payout: Stripe.Payout,
  eventType: string,
  accountId?: string | null
) {
  console.log('Payout event:', {
    type: eventType,
    payoutId: payout.id,
    amount: payout.amount / 100,
    status: payout.status,
    arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
    accountId,
  })

  // In production, upsert payout record
}

// ============================================
// REFUND HANDLERS
// ============================================

async function handleChargeRefunded(charge: Stripe.Charge) {
  console.log('Charge refunded:', {
    chargeId: charge.id,
    refunded: charge.refunded,
    amountRefunded: charge.amount_refunded / 100,
    refunds: charge.refunds?.data.map((r) => ({
      id: r.id,
      amount: r.amount / 100,
      status: r.status,
    })),
  })

  // In production, update refund records status
}

// ============================================
// HELPER: Calculate next service date
// Used in production when creating bookings from subscription renewals
// Exported to a shared utility in production implementation
// ============================================

/*
function calculateNextServiceDate(
  frequency: string,
  preferredDayOfWeek?: number | null
): string {
  const today = new Date()
  let daysToAdd = 14 // Default biweekly

  if (frequency === 'weekly') daysToAdd = 7
  if (frequency === 'monthly') daysToAdd = 30

  const nextDate = new Date(today)
  nextDate.setDate(today.getDate() + daysToAdd)

  // Adjust to preferred day if set
  if (preferredDayOfWeek !== undefined && preferredDayOfWeek !== null) {
    const currentDay = nextDate.getDay()
    const daysUntilPreferred = (preferredDayOfWeek - currentDay + 7) % 7
    nextDate.setDate(nextDate.getDate() + daysUntilPreferred)
  }

  return nextDate.toISOString().split('T')[0]
}
*/
