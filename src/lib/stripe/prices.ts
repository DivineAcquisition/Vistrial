// ============================================
// STRIPE PRICE CONFIGURATION
// Centralized price IDs and plan details
// ============================================

import type { PlanTier } from '@/types/database';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  description: string;
  priceId: string;
  priceMonthly: number; // In dollars
  contactLimit: number;
  features: string[];
  recommended?: boolean;
  // Legacy compatibility
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses getting started with reactivation',
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_starter',
    priceMonthly: 99,
    contactLimit: 1000,
    features: [
      'Up to 1,000 contacts',
      'All workflow templates',
      'SMS & Voice drops',
      'Basic analytics',
      'Email support',
    ],
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  growth: {
    tier: 'growth',
    name: 'Growth',
    description: 'For growing businesses with larger databases',
    priceId: process.env.STRIPE_PRICE_GROWTH || 'price_growth',
    priceMonthly: 199,
    contactLimit: 5000,
    features: [
      'Up to 5,000 contacts',
      'All workflow templates',
      'SMS & Voice drops',
      'Advanced analytics',
      'Priority support',
      'Custom workflows',
    ],
    recommended: true,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
  },
};

// Legacy plans array for backward compatibility
export const PLANS_ARRAY: PlanConfig[] = Object.values(PLANS);

/**
 * Get plan config by tier
 */
export function getPlanConfig(tier: PlanTier): PlanConfig {
  return PLANS[tier];
}

/**
 * Get plan config by Stripe price ID
 */
export function getPlanByPriceId(priceId: string): PlanConfig | null {
  const plan = Object.values(PLANS).find(
    (p) => p.priceId === priceId || 
           p.stripePriceIdMonthly === priceId || 
           p.stripePriceIdAnnual === priceId
  );
  return plan || null;
}

/**
 * Get all available plans
 */
export function getAllPlans(): PlanConfig[] {
  return Object.values(PLANS);
}

/**
 * Get contact limit for a plan tier
 */
export function getContactLimit(tier: PlanTier): number {
  return PLANS[tier].contactLimit;
}

/**
 * Get plan by ID (legacy compatible)
 */
export function getPlanById(id: string): PlanConfig | undefined {
  return Object.values(PLANS).find((plan) => plan.tier === id);
}

// ============================================
// CREDIT PRICING
// ============================================

export const CREDIT_PRICING = {
  // SMS costs (in cents)
  sms: {
    cost: 0.8, // What we pay (Telnyx)
    price: 1.5, // What we charge
    margin: 0.7, // Our margin per SMS
  },
  // Voice drop costs (in cents)
  voice_drop: {
    cost: 2.0, // What we pay (ElevenLabs + delivery)
    price: 5.0, // What we charge
    margin: 3.0, // Our margin per voice drop
  },
  // Email costs (in cents) - future
  email: {
    cost: 0.1,
    price: 0.3,
    margin: 0.2,
  },
};

// Legacy credit costs for backward compatibility
export const CREDIT_COSTS = {
  sms: 1, // 1 credit per SMS
  voice_per_minute: 5, // 5 credits per minute of voice
};

/**
 * Get message cost in cents
 */
export function getMessageCost(type: 'sms' | 'voice_drop' | 'email'): number {
  return CREDIT_PRICING[type].price;
}

/**
 * Calculate total cost for a batch of messages
 */
export function calculateMessagesCost(counts: {
  sms?: number;
  voice_drop?: number;
  email?: number;
}): number {
  let total = 0;

  if (counts.sms) {
    total += counts.sms * CREDIT_PRICING.sms.price;
  }
  if (counts.voice_drop) {
    total += counts.voice_drop * CREDIT_PRICING.voice_drop.price;
  }
  if (counts.email) {
    total += counts.email * CREDIT_PRICING.email.price;
  }

  return Math.ceil(total); // Round up to nearest cent
}

// ============================================
// REFILL OPTIONS
// ============================================

export const REFILL_OPTIONS = [
  { value: 1500, label: '$15.00' },
  { value: 2500, label: '$25.00' },
  { value: 5000, label: '$50.00' },
  { value: 10000, label: '$100.00' },
  { value: 25000, label: '$250.00' },
  { value: 50000, label: '$500.00' },
];

export const MIN_REFILL_AMOUNT = 1500; // $15.00 in cents

/**
 * Validate refill amount
 */
export function isValidRefillAmount(amountCents: number): boolean {
  return amountCents >= MIN_REFILL_AMOUNT;
}

/**
 * Format cents as dollars
 */
export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Estimate messages for a credit amount
 */
export function estimateMessagesForCredits(
  amountCents: number,
  type: 'sms' | 'voice_drop' | 'email'
): number {
  const pricePerMessage = CREDIT_PRICING[type].price;
  return Math.floor(amountCents / pricePerMessage);
}

// ============================================
// CREDIT PACKAGES (Legacy)
// ============================================

export interface CreditPackage {
  id: string;
  credits: number;
  price: number; // in cents
  stripePriceId: string | undefined;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'credits_500',
    credits: 500,
    price: 2500, // $25
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_500,
  },
  {
    id: 'credits_1000',
    credits: 1000,
    price: 4500, // $45
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_1000,
  },
  {
    id: 'credits_5000',
    credits: 5000,
    price: 20000, // $200
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_5000,
  },
];

export function getCreditPackageByCredits(credits: number): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.credits === credits);
}
