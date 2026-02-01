import { loadStripe, Stripe } from '@stripe/stripe-js'

// ============================================
// CLIENT-SIDE STRIPE INSTANCE
// ============================================

let stripePromise: Promise<Stripe | null> | null = null

/**
 * Get or create the Stripe instance for client-side usage
 * Uses singleton pattern to avoid multiple initializations
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

    if (!publishableKey) {
      console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
      return Promise.resolve(null)
    }

    stripePromise = loadStripe(publishableKey)
  }

  return stripePromise
}

/**
 * Get Stripe instance with connected account
 * Used for Stripe Connect payments where the connected account receives the payment
 */
export async function getStripeWithConnectedAccount(
  connectedAccountId: string
): Promise<Stripe | null> {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

  if (!publishableKey) {
    console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
    return null
  }

  return loadStripe(publishableKey, {
    stripeAccount: connectedAccountId,
  })
}

// ============================================
// STRIPE ELEMENTS APPEARANCE
// ============================================

export interface StripeAppearance {
  theme: 'stripe' | 'night' | 'flat' | 'none'
  variables?: Record<string, string>
  rules?: Record<string, Record<string, string>>
}

/**
 * Default Stripe Elements appearance that matches the app theme
 */
export const defaultStripeAppearance: StripeAppearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#7c3aed',
    colorBackground: '#ffffff',
    colorText: '#1e293b',
    colorDanger: '#ef4444',
    fontFamily: 'Inter, system-ui, sans-serif',
    spacingUnit: '4px',
    borderRadius: '8px',
  },
  rules: {
    '.Input': {
      borderColor: '#e2e8f0',
      boxShadow: 'none',
    },
    '.Input:focus': {
      borderColor: '#7c3aed',
      boxShadow: '0 0 0 1px #7c3aed',
    },
    '.Label': {
      color: '#64748b',
      fontWeight: '500',
    },
    '.Error': {
      color: '#ef4444',
    },
  },
}

/**
 * Dark mode Stripe Elements appearance
 */
export const darkStripeAppearance: StripeAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#a78bfa',
    colorBackground: '#1e293b',
    colorText: '#f1f5f9',
    colorDanger: '#f87171',
    fontFamily: 'Inter, system-ui, sans-serif',
    spacingUnit: '4px',
    borderRadius: '8px',
  },
  rules: {
    '.Input': {
      borderColor: '#475569',
      backgroundColor: '#0f172a',
    },
    '.Input:focus': {
      borderColor: '#a78bfa',
      boxShadow: '0 0 0 1px #a78bfa',
    },
    '.Label': {
      color: '#94a3b8',
      fontWeight: '500',
    },
  },
}

// ============================================
// STRIPE ELEMENTS OPTIONS
// ============================================

export interface CreatePaymentElementOptions {
  clientSecret: string
  appearance?: StripeAppearance
}

/**
 * Create options for Stripe Payment Element
 */
export function createPaymentElementOptions(options: CreatePaymentElementOptions) {
  return {
    clientSecret: options.clientSecret,
    appearance: options.appearance || defaultStripeAppearance,
  }
}

/**
 * Payment Element layout options
 */
export const paymentElementLayout = {
  type: 'tabs' as const,
  defaultCollapsed: false,
}

// ============================================
// PAYMENT INTENT CLIENT HELPERS
// ============================================

export interface ConfirmPaymentResult {
  success: boolean
  error?: string
  paymentIntentId?: string
}

/**
 * Confirm a payment with the Payment Element
 */
export async function confirmPayment(
  stripe: Stripe,
  elements: ReturnType<Stripe['elements']>,
  returnUrl: string
): Promise<ConfirmPaymentResult> {
  const elementsInstance = elements as unknown as {
    submit: () => Promise<{ error?: { message: string } }>
  }

  // Submit the form first
  const { error: submitError } = await elementsInstance.submit()

  if (submitError) {
    return {
      success: false,
      error: submitError.message,
    }
  }

  // Confirm the payment
  const { error, paymentIntent } = await stripe.confirmPayment({
    elements: elements as unknown as import('@stripe/stripe-js').StripeElements,
    confirmParams: {
      return_url: returnUrl,
    },
    redirect: 'if_required',
  })

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  if (paymentIntent?.status === 'succeeded') {
    return {
      success: true,
      paymentIntentId: paymentIntent.id,
    }
  }

  if (paymentIntent?.status === 'requires_action') {
    return {
      success: false,
      error: 'Additional authentication required',
    }
  }

  return {
    success: false,
    error: 'Payment was not successful',
  }
}

// ============================================
// SETUP INTENT CLIENT HELPERS
// ============================================

export interface ConfirmSetupResult {
  success: boolean
  error?: string
  paymentMethodId?: string
}

/**
 * Confirm a setup intent for saving payment method
 */
export async function confirmSetup(
  stripe: Stripe,
  elements: ReturnType<Stripe['elements']>,
  returnUrl: string
): Promise<ConfirmSetupResult> {
  const { error, setupIntent } = await stripe.confirmSetup({
    elements: elements as unknown as import('@stripe/stripe-js').StripeElements,
    confirmParams: {
      return_url: returnUrl,
    },
    redirect: 'if_required',
  })

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  if (setupIntent?.status === 'succeeded') {
    return {
      success: true,
      paymentMethodId: setupIntent.payment_method as string,
    }
  }

  return {
    success: false,
    error: 'Setup was not successful',
  }
}
