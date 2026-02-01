import Stripe from 'stripe'
import { PLATFORM_FEE_CONFIG } from '@/data/payment-schema'

// ============================================
// STRIPE SERVER CLIENT
// ============================================

// Create a lazy-loaded Stripe instance to avoid build-time errors
let stripeInstance: Stripe | null = null

function getStripeInstance(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set - Stripe functionality will not work')
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    })
  }
  return stripeInstance
}

// Export a proxy that lazily initializes Stripe
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    const instance = getStripeInstance()
    const value = instance[prop as keyof Stripe]
    if (typeof value === 'function') {
      return value.bind(instance)
    }
    return value
  },
})

// ============================================
// PLATFORM FEE CALCULATION
// ============================================

export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_CONFIG.percentFee
export const PLATFORM_FEE_FIXED = PLATFORM_FEE_CONFIG.fixedFee

/**
 * Calculate the platform fee for a payment amount
 * Platform fee: 2.9% + 30¢
 * @param amountInCents - The payment amount in cents
 * @returns The platform fee in cents
 */
export function calculatePlatformFee(amountInCents: number): number {
  return Math.round(amountInCents * (PLATFORM_FEE_PERCENT / 100) + PLATFORM_FEE_FIXED)
}

/**
 * Convert dollars to cents
 * @param dollars - Amount in dollars
 * @returns Amount in cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/**
 * Convert cents to dollars
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100
}

// ============================================
// STRIPE METADATA HELPERS
// ============================================

export function createPaymentMetadata(data: {
  businessId: string
  contactId?: string
  bookingId?: string
  quoteId?: string
  membershipId?: string
  paymentType: string
  [key: string]: string | undefined
}): Record<string, string> {
  const metadata: Record<string, string> = {
    platform: 'vistrial',
    business_id: data.businessId,
    payment_type: data.paymentType,
  }

  if (data.contactId) metadata.contact_id = data.contactId
  if (data.bookingId) metadata.booking_id = data.bookingId
  if (data.quoteId) metadata.quote_id = data.quoteId
  if (data.membershipId) metadata.membership_id = data.membershipId

  // Add any additional metadata
  Object.entries(data).forEach(([key, value]) => {
    if (
      value &&
      !['businessId', 'contactId', 'bookingId', 'quoteId', 'membershipId', 'paymentType'].includes(key)
    ) {
      metadata[key] = value
    }
  })

  return metadata
}

// ============================================
// ERROR HANDLING
// ============================================

export interface StripeError {
  type: string
  code?: string
  message: string
  decline_code?: string
}

export function parseStripeError(error: unknown): StripeError {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      type: error.type,
      code: error.code,
      message: error.message,
      decline_code: (error as Stripe.errors.StripeCardError).decline_code,
    }
  }

  if (error instanceof Error) {
    return {
      type: 'unknown_error',
      message: error.message,
    }
  }

  return {
    type: 'unknown_error',
    message: 'An unknown error occurred',
  }
}

export function getReadableErrorMessage(error: StripeError): string {
  // Card decline messages
  if (error.decline_code) {
    const declineMessages: Record<string, string> = {
      insufficient_funds: 'Your card has insufficient funds.',
      lost_card: 'Your card has been reported lost.',
      stolen_card: 'Your card has been reported stolen.',
      expired_card: 'Your card has expired.',
      incorrect_cvc: 'Your card security code is incorrect.',
      processing_error: 'There was a processing error. Please try again.',
      incorrect_number: 'Your card number is incorrect.',
      card_declined: 'Your card was declined.',
      generic_decline: 'Your card was declined.',
    }

    return declineMessages[error.decline_code] || 'Your card was declined.'
  }

  // Error code messages
  if (error.code) {
    const codeMessages: Record<string, string> = {
      card_declined: 'Your card was declined.',
      expired_card: 'Your card has expired.',
      incorrect_cvc: 'Your card security code is incorrect.',
      incorrect_number: 'Your card number is incorrect.',
      invalid_expiry_month: 'Your card expiration month is invalid.',
      invalid_expiry_year: 'Your card expiration year is invalid.',
      postal_code_invalid: 'Your postal code is invalid.',
      rate_limit: 'Too many requests. Please try again in a moment.',
      payment_intent_authentication_failure: 'Authentication failed. Please try again.',
    }

    return codeMessages[error.code] || error.message
  }

  return error.message
}
