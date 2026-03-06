// ============================================
// SUBSCRIPTION PLANS CONFIGURATION
// Enhanced with monthly/yearly pricing,
// detailed feature limits, and usage tracking
// ============================================

export interface PlanFeatures {
  contacts: number;
  smsPerMonth: number;
  emailsPerMonth: number;
  voiceDropsPerMonth: number;
  workflows: number;
  bookingPages: number;
  teamMembers: number;
  support: 'email' | 'priority' | 'dedicated';
  customBranding: boolean;
  apiAccess: boolean;
  webhooks: boolean;
  whiteLabel: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: PlanFeatures;
  popular?: boolean;
  // Legacy compatibility
  contactLimit?: number;
}

export const PLANS: Record<string, Plan> = {
  lite: {
    id: 'lite',
    name: 'Vistrial Lite',
    description: 'Perfect for small businesses just getting started',
    monthlyPrice: 49,
    yearlyPrice: 470,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_LITE_MONTHLY_ID || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_LITE_YEARLY_ID || '',
    contactLimit: 500,
    features: {
      contacts: 500,
      smsPerMonth: 500,
      emailsPerMonth: 2000,
      voiceDropsPerMonth: 0,
      workflows: 3,
      bookingPages: 1,
      teamMembers: 1,
      support: 'email',
      customBranding: false,
      apiAccess: false,
      webhooks: false,
      whiteLabel: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Vistrial Pro',
    description: 'For growing businesses that need more power',
    monthlyPrice: 149,
    yearlyPrice: 1430,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY_ID || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY_ID || '',
    contactLimit: 2500,
    features: {
      contacts: 2500,
      smsPerMonth: 2500,
      emailsPerMonth: 10000,
      voiceDropsPerMonth: 500,
      workflows: 10,
      bookingPages: 5,
      teamMembers: 3,
      support: 'priority',
      customBranding: true,
      apiAccess: true,
      webhooks: true,
      whiteLabel: false,
    },
    popular: true,
  },
  agency: {
    id: 'agency',
    name: 'Vistrial Agency',
    description: 'For agencies managing multiple clients',
    monthlyPrice: 399,
    yearlyPrice: 3830,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY_ID || '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_AGENCY_YEARLY_ID || '',
    contactLimit: 10000,
    features: {
      contacts: 10000,
      smsPerMonth: 10000,
      emailsPerMonth: 50000,
      voiceDropsPerMonth: 2500,
      workflows: -1, // Unlimited
      bookingPages: -1, // Unlimited
      teamMembers: 10,
      support: 'dedicated',
      customBranding: true,
      apiAccess: true,
      webhooks: true,
      whiteLabel: true,
    },
  },
};

export const OVERAGE_PRICES = {
  sms: 0.02,
  email: 0.001,
  voiceDrop: 0.05,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getPlanById(planId: string): Plan | undefined {
  return PLANS[planId];
}

export function getPlanByPriceId(priceId: string): Plan | undefined {
  if (!priceId) return undefined;
  return Object.values(PLANS).find(
    (plan) =>
      plan.stripePriceIdMonthly === priceId ||
      plan.stripePriceIdYearly === priceId
  );
}

export function isYearlyPrice(priceId: string): boolean {
  return Object.values(PLANS).some(
    (plan) => plan.stripePriceIdYearly === priceId
  );
}

export function getContactLimit(planId: string): number {
  const plan = getPlanById(planId);
  return plan?.features.contacts || plan?.contactLimit || 500;
}

export function isPlanUpgrade(currentPlanId: string, newPlanId: string): boolean {
  const planOrder = ['lite', 'pro', 'agency'];
  const currentIndex = planOrder.indexOf(currentPlanId);
  const newIndex = planOrder.indexOf(newPlanId);
  return newIndex > currentIndex;
}

// Legacy message pricing
export const MESSAGE_PRICING = {
  sms: 0.015,
  voice: 0.05,
} as const;

// Legacy credit bundles
export const CREDIT_BUNDLES = [
  { id: 'credits_10', amount: 10, price: 10, bonus: 0 },
  { id: 'credits_25', amount: 25, price: 25, bonus: 0 },
  { id: 'credits_50', amount: 55, price: 50, bonus: 5 },
  { id: 'credits_100', amount: 115, price: 100, bonus: 15 },
  { id: 'credits_250', amount: 300, price: 250, bonus: 50 },
] as const;

// Legacy PlanId type
export type PlanId = keyof typeof PLANS;

// Legacy getPlan function
export function getPlan(planId: string) {
  return PLANS[planId as PlanId] || null;
}
