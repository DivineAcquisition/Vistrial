// ============================================
// STRIPE MODULE EXPORTS
// Re-exports all Stripe-related functionality
// ============================================

// Client utilities
export {
  stripe,
  calculatePlatformFee,
  dollarsToCents,
  centsToDollars,
  createPaymentMetadata,
  parseStripeError,
  getReadableErrorMessage,
  PLATFORM_FEE_PERCENT,
  PLATFORM_FEE_FIXED,
} from './client'

export type { StripeError } from './client'

// Client-side utilities
export {
  getStripe,
  getStripeWithConnectedAccount,
  defaultStripeAppearance,
  darkStripeAppearance,
  createPaymentElementOptions,
  paymentElementLayout,
  confirmPayment,
  confirmSetup,
} from './client-side'

export type {
  StripeAppearance,
  CreatePaymentElementOptions,
  ConfirmPaymentResult,
  ConfirmSetupResult,
} from './client-side'

// Stripe Connect
export {
  createConnectAccount,
  createOnboardingLink,
  getConnectAccountStatus,
  createDashboardLink,
  determineAccountStatus,
  syncConnectAccountStatus,
  updateExternalAccount,
  deleteConnectAccount,
  getAccountBalance,
  listPayouts,
  createPayout,
} from './connect'

// Payments
export {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  createBookingDeposit,
  createFullPayment,
  collectBookingBalance,
  getPaymentIntentDetails,
  cancelPaymentIntent,
  capturePaymentIntent,
  getPaymentMethodDetails,
  listCustomerPaymentMethods,
  createSetupIntent,
  attachPaymentMethod,
  detachPaymentMethod,
  setDefaultPaymentMethod,
} from './payments'

export type {
  BookingDepositParams,
  FullPaymentParams,
  BalancePaymentParams,
} from './payments'

// Subscriptions
export {
  createMembershipSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  reactivateSubscription,
  updateSubscriptionPrice,
  updateSubscriptionPaymentMethod,
  getSubscriptionDetails,
  listSubscriptionInvoices,
  mapStripeStatusToMembershipStatus,
  retrySubscriptionPayment,
  previewSubscriptionUpdate,
} from './subscriptions'

export type {
  CreateSubscriptionParams,
  UpdateSubscriptionPriceParams,
} from './subscriptions'

// Refunds
export {
  createRefund,
  createPartialRefund,
  getRefundDetails,
  listRefundsForPayment,
  cancelRefund,
  getPaymentRefundStatus,
  validateRefund,
  createValidatedRefund,
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
  getRefundReasonLabel,
  getRefundStatusLabel,
} from './refunds'

export type {
  CreateRefundParams,
  RefundValidation,
} from './refunds'

// Data fetching utilities
export {
  getPayments,
  getPaymentStats,
  getPayouts,
  getPaymentById,
  getCustomerPayments,
  getBookingPayments,
  getMembershipPayments,
  getPaymentSummaryByDateRange,
  getPaymentStatusCounts,
  getRevenueByPaymentType,
} from './data'

export type {
  PaymentSummaryItem,
  PaymentStatusCounts,
  RevenueByType,
} from './data'
