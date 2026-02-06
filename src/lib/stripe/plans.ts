// ============================================
// STRIPE PLANS CONFIGURATION
// ============================================

export const PLANS = {
  lite: {
    id: 'lite',
    name: 'Lite',
    price: 49,
    contactLimit: 250,
    description: 'Perfect for getting started',
    features: [
      '250 contacts',
      'SMS campaigns',
      'Pre-built templates',
      'Response inbox',
      'Auto opt-out handling',
      'Email support',
    ],
    notIncluded: [
      'Voice drops',
      'Custom workflows',
      'Revenue tracking',
      'Priority support',
    ],
    stripePriceId: process.env.STRIPE_LITE_PRICE_ID || '',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 99,
    contactLimit: 1000,
    description: 'For small businesses just getting started',
    features: [
      '1,000 contacts',
      'SMS campaigns',
      'Pre-built templates',
      'Response inbox',
      'Auto opt-out handling',
      'Email support',
      'Voice drops ($0.05/drop)',
      'Custom workflows',
    ],
    notIncluded: [
      'Revenue tracking',
      'Priority support',
      'Team access',
    ],
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || '',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 199,
    contactLimit: 5000,
    description: 'For growing businesses with larger databases',
    features: [
      '5,000 contacts',
      'Everything in Starter',
      'Revenue tracking',
      'Advanced segmentation',
      'Priority support',
      'Custom workflows',
      'Team access (up to 3)',
    ],
    notIncluded: [],
    stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID || '',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    price: 399,
    contactLimit: 15000,
    description: 'For established businesses with large customer bases',
    features: [
      '15,000 contacts',
      'Everything in Growth',
      'Dedicated account manager',
      'API access',
      'Custom integrations',
      'Unlimited team access',
      'Phone support',
    ],
    notIncluded: [],
    stripePriceId: process.env.STRIPE_SCALE_PRICE_ID || '',
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] || null;
}

export function getPlanByPriceId(priceId: string) {
  return Object.values(PLANS).find((plan) => plan.stripePriceId === priceId) || null;
}

export function getContactLimit(planId: string): number {
  const plan = getPlan(planId);
  return plan?.contactLimit || 0;
}

export function isPlanUpgrade(currentPlanId: string, newPlanId: string): boolean {
  const planOrder: PlanId[] = ['lite', 'starter', 'growth', 'scale'];
  const currentIndex = planOrder.indexOf(currentPlanId as PlanId);
  const newIndex = planOrder.indexOf(newPlanId as PlanId);
  return newIndex > currentIndex;
}

// Message pricing
export const MESSAGE_PRICING = {
  sms: 0.015,
  voice: 0.05,
} as const;

// Credit bundles
export const CREDIT_BUNDLES = [
  { id: 'credits_10', amount: 10, price: 10, bonus: 0 },
  { id: 'credits_25', amount: 25, price: 25, bonus: 0 },
  { id: 'credits_50', amount: 55, price: 50, bonus: 5 },
  { id: 'credits_100', amount: 115, price: 100, bonus: 15 },
  { id: 'credits_250', amount: 300, price: 250, bonus: 50 },
] as const;
