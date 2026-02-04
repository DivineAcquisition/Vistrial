/**
 * Stripe Price Configuration
 * 
 * Centralized configuration for Stripe prices:
 * - Subscription plans (Starter, Growth, Scale)
 * - Credit packages
 * - Price IDs from environment variables
 */

export interface PlanConfig {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  stripePriceIdMonthly: string | undefined;
  stripePriceIdAnnual: string | undefined;
  features: string[];
  limits: {
    smsCredits: number;
    voiceMinutes: number;
    workflows: number;
    contacts: number;
  };
}

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For small businesses getting started",
    priceMonthly: 49,
    priceAnnual: 470, // ~20% discount
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    features: [
      "500 SMS credits/month",
      "50 voice minutes/month",
      "1 workflow",
      "1,000 contacts",
      "Email support",
    ],
    limits: {
      smsCredits: 500,
      voiceMinutes: 50,
      workflows: 1,
      contacts: 1000,
    },
  },
  {
    id: "growth",
    name: "Growth",
    description: "For growing businesses with more needs",
    priceMonthly: 149,
    priceAnnual: 1430,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_GROWTH,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
    features: [
      "2,000 SMS credits/month",
      "200 voice minutes/month",
      "5 workflows",
      "10,000 contacts",
      "Priority support",
      "Advanced analytics",
    ],
    limits: {
      smsCredits: 2000,
      voiceMinutes: 200,
      workflows: 5,
      contacts: 10000,
    },
  },
  {
    id: "scale",
    name: "Scale",
    description: "For larger operations and agencies",
    priceMonthly: 399,
    priceAnnual: 3830,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_SCALE,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_SCALE_ANNUAL,
    features: [
      "10,000 SMS credits/month",
      "1,000 voice minutes/month",
      "Unlimited workflows",
      "Unlimited contacts",
      "Dedicated support",
      "Custom integrations",
      "White-label options",
    ],
    limits: {
      smsCredits: 10000,
      voiceMinutes: 1000,
      workflows: -1, // unlimited
      contacts: -1, // unlimited
    },
  },
];

export interface CreditPackage {
  id: string;
  credits: number;
  price: number; // in cents
  stripePriceId: string | undefined;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "credits_500",
    credits: 500,
    price: 2500, // $25
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_500,
  },
  {
    id: "credits_1000",
    credits: 1000,
    price: 4500, // $45
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_1000,
  },
  {
    id: "credits_5000",
    credits: 5000,
    price: 20000, // $200
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_5000,
  },
];

export function getPlanById(id: string): PlanConfig | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function getCreditPackageByCredits(credits: number): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.credits === credits);
}
