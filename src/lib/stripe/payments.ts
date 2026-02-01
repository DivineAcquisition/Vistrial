import { stripe, calculatePlatformFee, dollarsToCents, centsToDollars } from './client'
import type {
  CreatePaymentIntentParams,
  PaymentResult,
  PaymentSettings,
} from '@/data/payment-schema'
import { calculateDeposit } from '@/data/payment-schema'

// ============================================
// GET OR CREATE STRIPE CUSTOMER
// Creates a customer on the connected account if needed
// ============================================

export async function getOrCreateStripeCustomer(
  contactData: {
    id: string
    email?: string | null
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    stripeCustomerId?: string | null
  },
  stripeAccountId: string
): Promise<string> {
  // Return existing customer if we have one and it's valid
  if (contactData.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(contactData.stripeCustomerId, {
        stripeAccount: stripeAccountId,
      })
      return contactData.stripeCustomerId
    } catch {
      // Customer doesn't exist on this connected account, create new one
    }
  }

  // Create customer on connected account
  const customer = await stripe.customers.create(
    {
      email: contactData.email || undefined,
      name: [contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || undefined,
      phone: contactData.phone || undefined,
      metadata: {
        contact_id: contactData.id,
        platform: 'vistrial',
      },
    },
    { stripeAccount: stripeAccountId }
  )

  return customer.id
}

// ============================================
// CREATE PAYMENT INTENT
// Creates a payment intent with destination charges to the connected account
// ============================================

export async function createPaymentIntent(
  params: CreatePaymentIntentParams,
  stripeAccountId: string,
  businessName: string,
  customerId?: string
): Promise<PaymentResult> {
  try {
    // Convert to cents
    const amountInCents = dollarsToCents(params.amount)

    // Calculate platform fee
    const platformFee = calculatePlatformFee(amountInCents)

    // Build description
    const description = params.description || `Payment to ${businessName}`

    // Create payment intent with destination charge
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      customer: customerId,
      description,
      metadata: {
        business_id: params.businessId,
        contact_id: params.contactId,
        booking_id: params.bookingId || '',
        quote_id: params.quoteId || '',
        payment_type: params.paymentType,
        platform: 'vistrial',
        ...params.metadata,
      },
      application_fee_amount: platformFee,
      transfer_data: {
        destination: stripeAccountId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    })

    return {
      success: true,
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create payment intent'
    return { success: false, error: message }
  }
}

// ============================================
// CREATE BOOKING DEPOSIT PAYMENT INTENT
// Creates a deposit payment for a booking based on business settings
// ============================================

export interface BookingDepositParams {
  bookingId: string
  bookingTotal: number
  scheduledDate: string
  contactId: string
  businessId: string
  businessName: string
  stripeAccountId: string
  paymentSettings: PaymentSettings
  customerId?: string
}

export async function createBookingDeposit(
  params: BookingDepositParams
): Promise<PaymentResult & { depositAmount?: number }> {
  const {
    bookingId,
    bookingTotal,
    scheduledDate,
    contactId,
    businessId,
    businessName,
    stripeAccountId,
    paymentSettings,
    customerId,
  } = params

  // Check if deposits are enabled
  if (!paymentSettings.collectDeposit || paymentSettings.depositType === 'none') {
    return { success: false, error: 'Deposits not enabled for this business' }
  }

  // Calculate deposit amount
  const depositAmount = calculateDeposit(
    bookingTotal,
    paymentSettings.depositType,
    paymentSettings.depositPercentage,
    paymentSettings.depositFixedAmount
  )

  if (depositAmount <= 0) {
    return { success: false, error: 'Invalid deposit amount' }
  }

  // Create payment intent
  const result = await createPaymentIntent(
    {
      businessId,
      contactId,
      amount: depositAmount,
      bookingId,
      paymentType: 'deposit',
      description: `Deposit for cleaning on ${scheduledDate}`,
      metadata: {
        scheduled_date: scheduledDate,
      },
    },
    stripeAccountId,
    businessName,
    customerId
  )

  return {
    ...result,
    depositAmount: result.success ? depositAmount : undefined,
  }
}

// ============================================
// CREATE FULL PAYMENT INTENT
// Creates a payment for the full booking amount
// ============================================

export interface FullPaymentParams {
  bookingId: string
  bookingTotal: number
  scheduledDate: string
  contactId: string
  businessId: string
  businessName: string
  stripeAccountId: string
  customerId?: string
}

export async function createFullPayment(params: FullPaymentParams): Promise<PaymentResult> {
  const {
    bookingId,
    bookingTotal,
    scheduledDate,
    contactId,
    businessId,
    businessName,
    stripeAccountId,
    customerId,
  } = params

  return createPaymentIntent(
    {
      businessId,
      contactId,
      amount: bookingTotal,
      bookingId,
      paymentType: 'full_payment',
      description: `Payment for cleaning on ${scheduledDate}`,
      metadata: {
        scheduled_date: scheduledDate,
      },
    },
    stripeAccountId,
    businessName,
    customerId
  )
}

// ============================================
// COLLECT REMAINING BALANCE
// Creates a payment for the remaining balance after deposit
// ============================================

export interface BalancePaymentParams {
  bookingId: string
  balanceDue: number
  scheduledDate: string
  contactId: string
  businessId: string
  businessName: string
  stripeAccountId: string
  customerId?: string
}

export async function collectBookingBalance(params: BalancePaymentParams): Promise<PaymentResult> {
  const {
    bookingId,
    balanceDue,
    scheduledDate,
    contactId,
    businessId,
    businessName,
    stripeAccountId,
    customerId,
  } = params

  if (balanceDue <= 0) {
    return { success: false, error: 'No balance due' }
  }

  return createPaymentIntent(
    {
      businessId,
      contactId,
      amount: balanceDue,
      bookingId,
      paymentType: 'balance',
      description: `Remaining balance for cleaning on ${scheduledDate}`,
      metadata: {
        scheduled_date: scheduledDate,
      },
    },
    stripeAccountId,
    businessName,
    customerId
  )
}

// ============================================
// GET PAYMENT INTENT DETAILS
// Retrieves details of a payment intent
// ============================================

export async function getPaymentIntentDetails(paymentIntentId: string): Promise<{
  id: string
  amount: number
  status: string
  paymentMethodTypes: string[]
  chargeId: string | null
  receiptUrl: string | null
  metadata: Record<string, string>
}> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  })

  const charge = paymentIntent.latest_charge as import('stripe').Stripe.Charge | null

  return {
    id: paymentIntent.id,
    amount: centsToDollars(paymentIntent.amount),
    status: paymentIntent.status,
    paymentMethodTypes: paymentIntent.payment_method_types,
    chargeId: charge?.id || null,
    receiptUrl: charge?.receipt_url || null,
    metadata: paymentIntent.metadata as Record<string, string>,
  }
}

// ============================================
// CANCEL PAYMENT INTENT
// Cancels a payment intent if it hasn't been captured
// ============================================

export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel payment intent'
    return { success: false, error: message }
  }
}

// ============================================
// CAPTURE PAYMENT INTENT
// Captures an authorized payment (for manual capture flows)
// ============================================

export async function capturePaymentIntent(
  paymentIntentId: string,
  amountToCapture?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const params: import('stripe').Stripe.PaymentIntentCaptureParams = {}

    if (amountToCapture !== undefined) {
      params.amount_to_capture = dollarsToCents(amountToCapture)
    }

    await stripe.paymentIntents.capture(paymentIntentId, params)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to capture payment'
    return { success: false, error: message }
  }
}

// ============================================
// RETRIEVE PAYMENT METHOD
// Gets details about a payment method
// ============================================

export async function getPaymentMethodDetails(
  paymentMethodId: string,
  stripeAccountId?: string
): Promise<{
  id: string
  type: string
  card?: {
    brand: string
    last4: string
    expMonth: number
    expYear: number
  }
  usBankAccount?: {
    bankName: string | null
    last4: string | null
    accountType: string | null
  }
}> {
  const paymentMethod = await stripe.paymentMethods.retrieve(
    paymentMethodId,
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  )

  return {
    id: paymentMethod.id,
    type: paymentMethod.type,
    card: paymentMethod.card
      ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        }
      : undefined,
    usBankAccount: paymentMethod.us_bank_account
      ? {
          bankName: paymentMethod.us_bank_account.bank_name,
          last4: paymentMethod.us_bank_account.last4,
          accountType: paymentMethod.us_bank_account.account_type,
        }
      : undefined,
  }
}

// ============================================
// LIST PAYMENT METHODS FOR CUSTOMER
// Gets all saved payment methods for a customer
// ============================================

export async function listCustomerPaymentMethods(
  customerId: string,
  stripeAccountId: string,
  type: 'card' | 'us_bank_account' = 'card'
): Promise<
  {
    id: string
    type: string
    brand?: string
    last4?: string
    expMonth?: number
    expYear?: number
    bankName?: string
  }[]
> {
  const paymentMethods = await stripe.paymentMethods.list(
    {
      customer: customerId,
      type,
    },
    { stripeAccount: stripeAccountId }
  )

  return paymentMethods.data.map((pm) => ({
    id: pm.id,
    type: pm.type,
    brand: pm.card?.brand,
    last4: pm.card?.last4 || pm.us_bank_account?.last4 || undefined,
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
    bankName: pm.us_bank_account?.bank_name || undefined,
  }))
}

// ============================================
// CREATE SETUP INTENT
// Creates a setup intent for saving a payment method
// ============================================

export async function createSetupIntent(
  customerId: string,
  stripeAccountId: string
): Promise<{ success: boolean; clientSecret?: string; error?: string }> {
  try {
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          platform: 'vistrial',
        },
      },
      { stripeAccount: stripeAccountId }
    )

    return {
      success: true,
      clientSecret: setupIntent.client_secret!,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create setup intent'
    return { success: false, error: message }
  }
}

// ============================================
// ATTACH PAYMENT METHOD
// Attaches a payment method to a customer
// ============================================

export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.paymentMethods.attach(
      paymentMethodId,
      { customer: customerId },
      { stripeAccount: stripeAccountId }
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to attach payment method'
    return { success: false, error: message }
  }
}

// ============================================
// DETACH PAYMENT METHOD
// Removes a payment method from a customer
// ============================================

export async function detachPaymentMethod(
  paymentMethodId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.paymentMethods.detach(paymentMethodId, { stripeAccount: stripeAccountId })
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to detach payment method'
    return { success: false, error: message }
  }
}

// ============================================
// SET DEFAULT PAYMENT METHOD
// Sets a payment method as the default for a customer
// ============================================

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  stripeAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await stripe.customers.update(
      customerId,
      {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      },
      { stripeAccount: stripeAccountId }
    )

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set default payment method'
    return { success: false, error: message }
  }
}
