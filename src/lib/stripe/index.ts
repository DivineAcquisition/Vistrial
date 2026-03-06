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

// Enhanced plans
export {
  PLANS as SUBSCRIPTION_PLANS,
  getPlanById as getSubscriptionPlan,
  getPlanByPriceId as getSubscriptionPlanByPriceId,
  isYearlyPrice,
  OVERAGE_PRICES,
  isPlanUpgrade,
} from './plans';

export type { Plan, PlanFeatures } from './plans';

// Customer management
export {
  createOrGetStripeCustomerForOrg,
  getStripeCustomerById,
  updateStripeCustomerById,
} from './customers';

// Usage tracking
export {
  getOrganizationUsage,
  checkUsageLimit,
  calculateOverageCharges,
} from './usage';

export type { UsageData } from './usage';
