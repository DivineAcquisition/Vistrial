import { NextRequest, NextResponse } from 'next/server'
import {
  createRefund,
  createValidatedRefund,
  getRefundDetails,
  listRefundsForPayment,
  getPaymentRefundStatus,
  validateRefund,
} from '@/lib/stripe/refunds'
import type { RefundReason } from '@/data/payment-schema'

// ============================================
// POST - Create refund
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      paymentIntentId,
      stripeAccountId,
      amount, // optional - undefined means full refund
      reason,
      notes,
      validate = true, // whether to validate before creating
    } = body

    // Validate required fields
    if (!paymentIntentId || !stripeAccountId) {
      return NextResponse.json(
        { error: 'paymentIntentId and stripeAccountId are required' },
        { status: 400 }
      )
    }

    // Note: In production, you would also:
    // 1. Authenticate the user
    // 2. Verify they have permission to refund this payment
    // 3. Get the user ID for refundedBy tracking

    let result

    if (validate) {
      result = await createValidatedRefund({
        paymentIntentId,
        stripeAccountId,
        amount,
        reason: reason as RefundReason,
        notes,
      })
    } else {
      result = await createRefund({
        paymentIntentId,
        stripeAccountId,
        amount,
        reason: reason as RefundReason,
        metadata: notes ? { notes } : undefined,
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Refund creation error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create refund'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================
// GET - Get refund details or list refunds
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const refundId = searchParams.get('refundId')
    const paymentIntentId = searchParams.get('paymentIntentId')
    const stripeAccountId = searchParams.get('stripeAccountId')
    const action = searchParams.get('action')

    if (!stripeAccountId) {
      return NextResponse.json(
        { error: 'stripeAccountId is required' },
        { status: 400 }
      )
    }

    // Get single refund details
    if (refundId) {
      const details = await getRefundDetails(refundId, stripeAccountId)
      return NextResponse.json(details)
    }

    // List refunds or get status for a payment
    if (paymentIntentId) {
      if (action === 'status') {
        const status = await getPaymentRefundStatus(paymentIntentId, stripeAccountId)
        return NextResponse.json(status)
      }

      if (action === 'validate') {
        const amount = searchParams.get('amount')
        const validation = await validateRefund(
          paymentIntentId,
          stripeAccountId,
          amount ? parseFloat(amount) : undefined
        )
        return NextResponse.json(validation)
      }

      const refunds = await listRefundsForPayment(paymentIntentId, stripeAccountId)
      return NextResponse.json({ refunds })
    }

    return NextResponse.json(
      { error: 'refundId or paymentIntentId is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Get refund error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get refund'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
