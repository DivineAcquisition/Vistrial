export type Usage = {
  owner: string
  status: string
  costs: number
  region: string
  stability: number
  lastEdited: string
}

export type OverviewData = {
  date: string
  "Rows written": number
  "Rows read": number
  Queries: number
  "Payments completed": number
  "Sign ups": number
  Logins: number
  "Sign outs": number
  "Support calls": number
}

// Re-export booking customization schema
export * from './booking-schema'

// Re-export booking schema mappers for database operations
export * from './booking-schema-mappers'

// Note: Payment schema has some naming conflicts with booking schema
// Import payment schema directly from '@/data/payment-schema' when needed
// or use the explicit re-exports below

// Re-export payment schema types that don't conflict
export type {
  // Status types
  StripeAccountStatus,
  PaymentStatus,
  PaymentType,
  PaymentMethodType,
  RefundReason,
  RefundStatus,
  InvoiceStatus,
  PayoutStatus,
  BookingPaymentStatus,
  PaymentDepositType,
  MembershipStatus,

  // Business & Contact Stripe fields
  BusinessStripeFields,
  PaymentSettings,
  ContactStripeFields,

  // Core entities
  Payment,
  Refund,
  InvoiceLineItem,
  Invoice,
  SavedPaymentMethod,
  Payout,

  // Stripe fields for other entities
  MembershipStripeFields,
  BookingPaymentFields,

  // API types
  CreatePaymentIntentParams,
  PaymentResult,
  CreateSubscriptionParams,
  SubscriptionResult,
  CreateRefundParams,
  RefundResult,

  // Connect types
  ConnectAccountStatus,
  CreateConnectAccountParams,
  CreateConnectAccountResult,

  // Stats & filters
  PaymentStats,
  PaymentFilters,
  PaginatedPaymentsResponse,

  // Webhook types
  StripeWebhookEventType,
} from './payment-schema'

export {
  // Constants
  DEFAULT_PAYMENT_SETTINGS,
  PLATFORM_FEE_CONFIG,
  FREQUENCY_TO_STRIPE_INTERVAL,

  // Helper functions (renamed to avoid conflict)
  calculatePlatformFee as calculateStripePlatformFee,
  calculateDeposit as calculatePaymentDeposit,
} from './payment-schema'
