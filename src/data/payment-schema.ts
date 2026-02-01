// ============================================
// VISTRIAL - PAYMENT SYSTEM SCHEMA
// TypeScript types for Stripe Connect payment processing
// ============================================

// ============================================
// STRIPE ACCOUNT STATUS TYPES
// ============================================

export type StripeAccountStatus = 'not_connected' | 'pending' | 'restricted' | 'active'

export type PaymentStatus = 
  | 'pending' 
  | 'processing' 
  | 'succeeded' 
  | 'failed' 
  | 'canceled' 
  | 'refunded' 
  | 'partially_refunded'

export type PaymentType = 
  | 'deposit' 
  | 'full_payment' 
  | 'subscription' 
  | 'refund' 
  | 'adjustment'
  | 'balance'

export type PaymentMethodType = 'card' | 'ach_debit' | 'us_bank_account'

export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'other'

export type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'canceled'

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export type PayoutStatus = 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'

export type BookingPaymentStatus = 'pending' | 'deposit_paid' | 'paid' | 'failed' | 'refunded'

export type PaymentDepositType = 'percentage' | 'fixed' | 'full' | 'none'

export type MembershipStatus = 
  | 'pending' 
  | 'active' 
  | 'paused' 
  | 'past_due' 
  | 'canceling' 
  | 'canceled'

// ============================================
// BUSINESS STRIPE FIELDS
// ============================================

export interface BusinessStripeFields {
  stripeAccountId: string | null
  stripeAccountStatus: StripeAccountStatus
  stripeChargesEnabled: boolean
  stripePayoutsEnabled: boolean
  stripeDetailsSubmitted: boolean
  stripeOnboardingCompleted: boolean
  stripeDefaultCurrency: string
  stripeCountry: string
  paymentSettings: PaymentSettings
}

export interface PaymentSettings {
  collectDeposit: boolean
  depositType: PaymentDepositType
  depositPercentage: number
  depositFixedAmount: number | null
  acceptCard: boolean
  acceptAch: boolean
  sendReceipt: boolean
  autoChargeMembership: boolean
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  collectDeposit: true,
  depositType: 'percentage',
  depositPercentage: 25,
  depositFixedAmount: null,
  acceptCard: true,
  acceptAch: false,
  sendReceipt: true,
  autoChargeMembership: true,
}

// ============================================
// CONTACT STRIPE FIELDS
// ============================================

export interface ContactStripeFields {
  stripeCustomerId: string | null
}

// ============================================
// PAYMENT
// ============================================

export interface Payment {
  id: string
  businessId: string
  contactId: string | null

  // Related entities
  bookingId: string | null
  membershipId: string | null
  quoteId: string | null
  invoiceId: string | null

  // Stripe IDs
  stripePaymentIntentId: string | null
  stripeChargeId: string | null
  stripeInvoiceId: string | null
  stripeSubscriptionId: string | null
  stripeTransferId: string | null

  // Amount
  amount: number
  currency: string

  // Fees
  stripeFee: number
  platformFee: number
  netAmount: number | null

  // Type & Status
  paymentType: PaymentType
  status: PaymentStatus

  // Payment method
  paymentMethodType: PaymentMethodType | null
  paymentMethodLast4: string | null
  paymentMethodBrand: string | null

  // Metadata
  description: string | null
  metadata: Record<string, unknown> | null
  failureReason: string | null

  // Refund tracking
  refundedAmount: number

  // Timestamps
  createdAt: Date
  updatedAt: Date
  succeededAt: Date | null
  failedAt: Date | null
}

// ============================================
// REFUND
// ============================================

export interface Refund {
  id: string
  paymentId: string
  businessId: string

  stripeRefundId: string | null

  amount: number
  reason: RefundReason | null

  notes: string | null
  status: RefundStatus

  refundedBy: string | null

  createdAt: Date
  processedAt: Date | null
}

// ============================================
// INVOICE
// ============================================

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id: string
  businessId: string
  contactId: string

  // Related
  bookingId: string | null
  membershipId: string | null

  // Stripe
  stripeInvoiceId: string | null
  stripeInvoiceUrl: string | null
  stripeInvoicePdf: string | null

  // Invoice details
  invoiceNumber: string | null

  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number

  // Status
  status: InvoiceStatus

  // Dates
  issueDate: string
  dueDate: string | null
  paidAt: Date | null

  // Line items
  lineItems: InvoiceLineItem[]

  notes: string | null

  createdAt: Date
  updatedAt: Date
}

// ============================================
// SAVED PAYMENT METHOD (Saved cards/bank accounts)
// ============================================

export interface SavedPaymentMethod {
  id: string
  contactId: string
  businessId: string

  stripePaymentMethodId: string

  type: PaymentMethodType

  // Card details
  cardBrand: string | null
  cardLast4: string | null
  cardExpMonth: number | null
  cardExpYear: number | null

  // Bank details
  bankName: string | null
  bankLast4: string | null

  isDefault: boolean

  createdAt: Date
}

// ============================================
// PAYOUT
// ============================================

export interface Payout {
  id: string
  businessId: string

  stripePayoutId: string | null
  stripeBalanceTransactionId: string | null

  amount: number
  currency: string

  status: PayoutStatus

  arrivalDate: string | null

  failureMessage: string | null

  createdAt: Date
  updatedAt: Date
}

// ============================================
// MEMBERSHIP STRIPE FIELDS
// ============================================

export interface MembershipStripeFields {
  stripeSubscriptionId: string | null
  stripePriceId: string | null
  stripeProductId: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  trialEnd: Date | null
}

// ============================================
// BOOKING PAYMENT FIELDS
// ============================================

export interface BookingPaymentFields {
  stripePaymentIntentId: string | null
  depositAmount: number | null
  depositPaid: boolean
  depositPaidAt: Date | null
  paymentStatus: BookingPaymentStatus
  balanceDue: number | null
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreatePaymentIntentParams {
  businessId: string
  contactId: string
  amount: number // in dollars
  bookingId?: string
  quoteId?: string
  paymentType: PaymentType
  description?: string
  metadata?: Record<string, string>
}

export interface PaymentResult {
  success: boolean
  clientSecret?: string
  paymentIntentId?: string
  paymentId?: string
  error?: string
}

export interface CreateSubscriptionParams {
  membershipId: string
  paymentMethodId: string
}

export interface SubscriptionResult {
  success: boolean
  subscriptionId?: string
  clientSecret?: string
  error?: string
}

export interface CreateRefundParams {
  paymentId: string
  amount?: number
  reason?: RefundReason
  notes?: string
  refundedBy?: string
}

export interface RefundResult {
  success: boolean
  refundId?: string
  error?: string
}

// ============================================
// STRIPE CONNECT TYPES
// ============================================

export interface ConnectAccountStatus {
  id: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirements: {
    currentlyDue: string[]
    eventuallyDue: string[]
    pastDue: string[]
    pendingVerification: string[]
    disabledReason: string | null
  }
  capabilities: Record<string, string> | null
}

export interface CreateConnectAccountParams {
  businessId: string
  email: string
  businessName: string
  country?: string
}

export interface CreateConnectAccountResult {
  accountId: string
  alreadyExists: boolean
}

// ============================================
// PAYMENT STATS
// ============================================

export interface PaymentStats {
  thisMonthRevenue: number
  thisMonthNet: number
  lastMonthRevenue: number
  growthPercent: number
  pendingAmount: number
  failedCount: number
}

// ============================================
// PAYMENT FILTERS
// ============================================

export interface PaymentFilters {
  status?: string
  type?: string
  dateFrom?: string
  dateTo?: string
  contactId?: string
  page?: number
  pageSize?: number
}

export interface PaginatedPaymentsResponse {
  payments: Payment[]
  total: number
  page: number
  totalPages: number
}

// ============================================
// WEBHOOK EVENT TYPES
// ============================================

export type StripeWebhookEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'account.updated'
  | 'payout.created'
  | 'payout.paid'
  | 'payout.failed'
  | 'charge.refunded'

// ============================================
// PLATFORM FEE CONFIGURATION
// ============================================

export const PLATFORM_FEE_CONFIG = {
  percentFee: 2.9, // 2.9%
  fixedFee: 30, // 30 cents
}

export function calculatePlatformFee(amountInCents: number): number {
  return Math.round(
    amountInCents * (PLATFORM_FEE_CONFIG.percentFee / 100) + PLATFORM_FEE_CONFIG.fixedFee
  )
}

// ============================================
// FREQUENCY INTERVAL MAPPING
// ============================================

export const FREQUENCY_TO_STRIPE_INTERVAL: Record<
  string,
  { interval: 'week' | 'month'; intervalCount: number }
> = {
  weekly: { interval: 'week', intervalCount: 1 },
  biweekly: { interval: 'week', intervalCount: 2 },
  monthly: { interval: 'month', intervalCount: 1 },
}

// ============================================
// DEPOSIT CALCULATION
// ============================================

export function calculateDeposit(
  total: number,
  depositType: PaymentDepositType,
  depositPercentage: number,
  depositFixedAmount: number | null
): number {
  switch (depositType) {
    case 'percentage':
      return Math.round(total * (depositPercentage / 100) * 100) / 100
    case 'fixed':
      return Math.min(depositFixedAmount || 0, total)
    case 'full':
      return total
    case 'none':
    default:
      return 0
  }
}
