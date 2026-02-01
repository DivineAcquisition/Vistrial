import { NextRequest, NextResponse } from 'next/server'
import {
  createPaymentIntent,
  createBookingDeposit,
  createFullPayment,
  collectBookingBalance,
  getOrCreateStripeCustomer,
} from '@/lib/stripe/payments'
import type { PaymentSettings } from '@/data/payment-schema'

// ============================================
// POST - Create payment intent
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      type,
      // For all types
      businessId,
      businessName,
      stripeAccountId,
      contactId,
      // Contact info for customer creation
      contactEmail,
      contactFirstName,
      contactLastName,
      contactPhone,
      // For deposit/full_payment/balance
      bookingId,
      bookingTotal,
      scheduledDate,
      paymentSettings,
      balanceDue,
      // For custom payments
      amount,
      description,
      quoteId,
    } = body

    // Validate required fields
    if (!stripeAccountId) {
      return NextResponse.json(
        { error: 'Business not connected to Stripe' },
        { status: 400 }
      )
    }

    // Get or create customer
    let customerId: string | undefined
    if (contactId) {
      customerId = await getOrCreateStripeCustomer(
        {
          id: contactId,
          email: contactEmail,
          firstName: contactFirstName,
          lastName: contactLastName,
          phone: contactPhone,
        },
        stripeAccountId
      )
    }

    let result

    switch (type) {
      case 'deposit':
        if (!bookingId || !bookingTotal || !scheduledDate || !paymentSettings) {
          return NextResponse.json(
            { error: 'Missing required fields for deposit' },
            { status: 400 }
          )
        }
        result = await createBookingDeposit({
          bookingId,
          bookingTotal,
          scheduledDate,
          contactId,
          businessId,
          businessName,
          stripeAccountId,
          paymentSettings: paymentSettings as PaymentSettings,
          customerId,
        })
        break

      case 'full_payment':
        if (!bookingId || !bookingTotal || !scheduledDate) {
          return NextResponse.json(
            { error: 'Missing required fields for full payment' },
            { status: 400 }
          )
        }
        result = await createFullPayment({
          bookingId,
          bookingTotal,
          scheduledDate,
          contactId,
          businessId,
          businessName,
          stripeAccountId,
          customerId,
        })
        break

      case 'balance':
        if (!bookingId || !balanceDue || !scheduledDate) {
          return NextResponse.json(
            { error: 'Missing required fields for balance payment' },
            { status: 400 }
          )
        }
        result = await collectBookingBalance({
          bookingId,
          balanceDue,
          scheduledDate,
          contactId,
          businessId,
          businessName,
          stripeAccountId,
          customerId,
        })
        break

      case 'custom':
        if (!amount) {
          return NextResponse.json(
            { error: 'Amount is required for custom payment' },
            { status: 400 }
          )
        }
        result = await createPaymentIntent(
          {
            businessId,
            contactId,
            amount,
            bookingId,
            quoteId,
            paymentType: 'full_payment',
            description,
          },
          stripeAccountId,
          businessName,
          customerId
        )
        break

      default:
        return NextResponse.json(
          { error: 'Invalid payment type' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Payment intent error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create payment intent'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
