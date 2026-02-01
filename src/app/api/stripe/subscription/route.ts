import { NextRequest, NextResponse } from 'next/server'
import {
  createMembershipSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  reactivateSubscription,
  updateSubscriptionPrice,
  updateSubscriptionPaymentMethod,
  getSubscriptionDetails,
} from '@/lib/stripe/subscriptions'
import { getOrCreateStripeCustomer } from '@/lib/stripe/payments'

// ============================================
// POST - Create subscription
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      membershipId,
      paymentMethodId,
      stripeAccountId,
      pricePerService,
      frequency,
      serviceName,
      businessId,
      contactId,
      // Contact info for customer creation
      contactEmail,
      contactFirstName,
      contactLastName,
      contactPhone,
    } = body

    // Validate required fields
    if (!membershipId || !paymentMethodId || !stripeAccountId || !pricePerService) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get or create customer
    const customerId = await getOrCreateStripeCustomer(
      {
        id: contactId,
        email: contactEmail,
        firstName: contactFirstName,
        lastName: contactLastName,
        phone: contactPhone,
      },
      stripeAccountId
    )

    const result = await createMembershipSubscription({
      membershipId,
      customerId,
      paymentMethodId,
      stripeAccountId,
      pricePerService,
      frequency: frequency || 'biweekly',
      serviceName: serviceName || 'Cleaning Service',
      businessId,
      contactId,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Subscription creation error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create subscription'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================
// GET - Get subscription details
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subscriptionId = searchParams.get('subscriptionId')
    const stripeAccountId = searchParams.get('stripeAccountId')

    if (!subscriptionId || !stripeAccountId) {
      return NextResponse.json(
        { error: 'subscriptionId and stripeAccountId are required' },
        { status: 400 }
      )
    }

    const details = await getSubscriptionDetails(subscriptionId, stripeAccountId)

    return NextResponse.json(details)
  } catch (error) {
    console.error('Get subscription error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get subscription'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================
// PATCH - Update subscription (pause, resume, cancel, etc.)
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      action,
      subscriptionId,
      stripeAccountId,
      // For cancel
      immediately,
      // For update_price
      productId,
      price,
      frequency,
      // For update_payment_method
      customerId,
      paymentMethodId,
    } = body

    if (!subscriptionId || !stripeAccountId) {
      return NextResponse.json(
        { error: 'subscriptionId and stripeAccountId are required' },
        { status: 400 }
      )
    }

    let result

    switch (action) {
      case 'pause':
        result = await pauseSubscription(subscriptionId, stripeAccountId)
        break

      case 'resume':
        result = await resumeSubscription(subscriptionId, stripeAccountId)
        break

      case 'cancel':
        result = await cancelSubscription(subscriptionId, stripeAccountId, immediately === true)
        break

      case 'reactivate':
        result = await reactivateSubscription(subscriptionId, stripeAccountId)
        break

      case 'update_price':
        if (!productId || !price || !frequency) {
          return NextResponse.json(
            { error: 'productId, price, and frequency are required for price update' },
            { status: 400 }
          )
        }
        result = await updateSubscriptionPrice({
          subscriptionId,
          productId,
          newPrice: price,
          frequency,
          stripeAccountId,
        })
        break

      case 'update_payment_method':
        if (!customerId || !paymentMethodId) {
          return NextResponse.json(
            { error: 'customerId and paymentMethodId are required for payment method update' },
            { status: 400 }
          )
        }
        result = await updateSubscriptionPaymentMethod(
          subscriptionId,
          customerId,
          paymentMethodId,
          stripeAccountId
        )
        break

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Subscription update error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update subscription'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
