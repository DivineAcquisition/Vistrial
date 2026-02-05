// ============================================
// STRIPE EXPORTS
// ============================================

// Client-side
export { getStripeClient, redirectToCheckout, redirectToPortal } from './client';

// Server-side
export {
  getStripeServerClient,
  stripe,
  createStripeCustomer,
  getStripeCustomer,
  updateStripeCustomer,
  getOrCreateCustomer,
  createSubscriptionCheckout,
  createCheckoutSession,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  createPortalSession,
  createCreditRefillPaymentIntent,
  createPaymentIntent,
  chargeCustomerForCredits,
  constructWebhookEvent,
  verifyWebhookSignature,
  getUpcomingInvoice,
  listInvoices,
  listPaymentMethods,
  setDefaultPaymentMethod,
} from './server';

// Pricing configuration
export {
  PLANS,
  PLANS_ARRAY,
  getPlanConfig,
  getPlanByPriceId,
  getAllPlans,
  getContactLimit,
  getPlanById,
  CREDIT_PRICING,
  CREDIT_COSTS,
  getMessageCost,
  calculateMessagesCost,
  REFILL_OPTIONS,
  MIN_REFILL_AMOUNT,
  isValidRefillAmount,
  formatCentsToDollars,
  estimateMessagesForCredits,
  CREDIT_PACKAGES,
  getCreditPackageByCredits,
} from './prices';

export type { PlanConfig, CreditPackage } from './prices';
