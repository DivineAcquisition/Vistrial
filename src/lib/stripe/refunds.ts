import { stripe, dollarsToCents, centsToDollars } from './client'
import type { RefundReason, RefundResult, RefundStatus } from '@/data/payment-schema'

// ============================================
// CREATE REFUND
// Creates a refund for a payment
// ============================================

export interface CreateRefundParams {
  paymentIntentId: string
  stripeAccountId: string
  amount?: number // in dollars, undefined = full refund
  reason?: RefundReason
  metadata?: Record<string, string>
}

export async function createRefund(params: CreateRefundParams): Promise<RefundResult> {
  const { paymentIntentId, stripeAccountId, amount, reason, metadata } = params

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: amount !== undefined ? dollarsToCents(amount) : undefined,
        reason: reason as import('stripe').Stripe.RefundCreateParams.Reason | undefined,
        metadata: {
          platform: 'vistrial',
          ...metadata,
        },
      },
      { stripeAccount: stripeAccountId }
    )

    return {
      success: true,
      refundId: refund.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create refund'
    return { success: false, error: message }
  }
}

// ============================================
// CREATE PARTIAL REFUND
// Creates a partial refund for a specific amount
// ============================================

export async function createPartialRefund(
  paymentIntentId: string,
  stripeAccountId: string,
  amount: number,
  reason?: RefundReason,
  notes?: string
): Promise<RefundResult> {
  return createRefund({
    paymentIntentId,
    stripeAccountId,
    amount,
    reason,
    metadata: notes ? { notes } : undefined,
  })
}

// ============================================
// GET REFUND DETAILS
// Retrieves details of a refund
// ============================================

export async function getRefundDetails(
  refundId: string,
  stripeAccountId: string
): Promise<{
  id: string
  amount: number
  status: RefundStatus
  reason: RefundReason | null
  paymentIntentId: string
  chargeId: string
  created: Date
  receiptNumber: string | null
  failureReason: string | null
}> {
  const refund = await stripe.refunds.retrieve(refundId, {
    stripeAccount: stripeAccountId,
  })

  return {
    id: refund.id,
    amount: centsToDollars(refund.amount),
    status: refund.status as RefundStatus,
    reason: (refund.reason as RefundReason) || null,
    paymentIntentId: refund.payment_intent as string,
    chargeId: refund.charge as string,
    created: new Date(refund.created * 1000),
    receiptNumber: refund.receipt_number ?? null,
    failureReason: refund.failure_reason ?? null,
  }
}

// ============================================
// LIST REFUNDS FOR PAYMENT
// Lists all refunds for a payment intent
// ============================================

export async function listRefundsForPayment(
  paymentIntentId: string,
  stripeAccountId: string
): Promise<
  {
    id: string
    amount: number
    status: RefundStatus
    reason: RefundReason | null
    created: Date
  }[]
> {
  const refunds = await stripe.refunds.list(
    {
      payment_intent: paymentIntentId,
    },
    { stripeAccount: stripeAccountId }
  )

  return refunds.data.map((refund) => ({
    id: refund.id,
    amount: centsToDollars(refund.amount),
    status: refund.status as RefundStatus,
    reason: (refund.reason as RefundReason) || null,
    created: new Date(refund.created * 1000),
  }))
}

// ============================================
// CANCEL REFUND
// Cancels a pending refund (only works for some payment methods)
// ============================================

export async function cancelRefund(
  refundId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.refunds.cancel(refundId, {
      stripeAccount: stripeAccountId,
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel refund'
    return { success: false, error: message }
  }
}

// ============================================
// GET PAYMENT REFUND STATUS
// Gets the total refunded amount for a payment
// ============================================

export async function getPaymentRefundStatus(
  paymentIntentId: string,
  stripeAccountId: string
): Promise<{
  totalAmount: number
  refundedAmount: number
  remainingAmount: number
  isFullyRefunded: boolean
  refundCount: number
}> {
  // Get payment intent with expanded charges
  const paymentIntent = await stripe.paymentIntents.retrieve(
    paymentIntentId,
    { expand: ['latest_charge'] },
    { stripeAccount: stripeAccountId }
  )

  const charge = paymentIntent.latest_charge as import('stripe').Stripe.Charge | null

  if (!charge) {
    return {
      totalAmount: centsToDollars(paymentIntent.amount),
      refundedAmount: 0,
      remainingAmount: centsToDollars(paymentIntent.amount),
      isFullyRefunded: false,
      refundCount: 0,
    }
  }

  const refundedAmount = charge.amount_refunded || 0
  const totalAmount = charge.amount

  // Get refund count
  const refunds = await stripe.refunds.list(
    { payment_intent: paymentIntentId },
    { stripeAccount: stripeAccountId }
  )

  return {
    totalAmount: centsToDollars(totalAmount),
    refundedAmount: centsToDollars(refundedAmount),
    remainingAmount: centsToDollars(totalAmount - refundedAmount),
    isFullyRefunded: charge.refunded || false,
    refundCount: refunds.data.length,
  }
}

// ============================================
// REFUND VALIDATION
// Validates if a refund can be processed
// ============================================

export interface RefundValidation {
  canRefund: boolean
  maxRefundAmount: number
  reason?: string
}

export async function validateRefund(
  paymentIntentId: string,
  stripeAccountId: string,
  requestedAmount?: number
): Promise<RefundValidation> {
  const status = await getPaymentRefundStatus(paymentIntentId, stripeAccountId)

  // Already fully refunded
  if (status.isFullyRefunded) {
    return {
      canRefund: false,
      maxRefundAmount: 0,
      reason: 'This payment has already been fully refunded',
    }
  }

  // No remaining amount
  if (status.remainingAmount <= 0) {
    return {
      canRefund: false,
      maxRefundAmount: 0,
      reason: 'No remaining amount to refund',
    }
  }

  // Requested amount exceeds remaining
  if (requestedAmount !== undefined && requestedAmount > status.remainingAmount) {
    return {
      canRefund: false,
      maxRefundAmount: status.remainingAmount,
      reason: `Requested amount exceeds the remaining refundable amount of $${status.remainingAmount.toFixed(2)}`,
    }
  }

  return {
    canRefund: true,
    maxRefundAmount: status.remainingAmount,
  }
}

// ============================================
// CREATE REFUND WITH VALIDATION
// Validates and creates a refund in one operation
// ============================================

export async function createValidatedRefund(params: {
  paymentIntentId: string
  stripeAccountId: string
  amount?: number
  reason?: RefundReason
  notes?: string
}): Promise<RefundResult & { validation?: RefundValidation }> {
  const { paymentIntentId, stripeAccountId, amount, reason, notes } = params

  // Validate first
  const validation = await validateRefund(paymentIntentId, stripeAccountId, amount)

  if (!validation.canRefund) {
    return {
      success: false,
      error: validation.reason || 'Refund validation failed',
      validation,
    }
  }

  // Create refund
  const result = await createRefund({
    paymentIntentId,
    stripeAccountId,
    amount,
    reason,
    metadata: notes ? { notes } : undefined,
  })

  return {
    ...result,
    validation,
  }
}

// ============================================
// REFUND REASON LABELS
// Human-readable labels for refund reasons
// ============================================

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  duplicate: 'Duplicate charge',
  fraudulent: 'Fraudulent charge',
  requested_by_customer: 'Customer request',
  other: 'Other reason',
}

export function getRefundReasonLabel(reason: RefundReason | null): string {
  if (!reason) return 'Not specified'
  return REFUND_REASON_LABELS[reason] || reason
}

// ============================================
// REFUND STATUS LABELS
// Human-readable labels for refund statuses
// ============================================

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: 'Pending',
  succeeded: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
}

export function getRefundStatusLabel(status: RefundStatus): string {
  return REFUND_STATUS_LABELS[status] || status
}
