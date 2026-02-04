/**
 * Subscription Plans Configuration
 * 
 * Centralized plan definitions for the application
 */

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
  popular?: boolean;
  features: string[];
  limits: PlanLimits;
}

export interface PlanLimits {
  smsCredits: number; // -1 for unlimited
  voiceMinutes: number; // -1 for unlimited
  workflows: number; // -1 for unlimited
  contacts: number; // -1 for unlimited
  teamMembers: number; // -1 for unlimited
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for small businesses getting started with lead reactivation",
    priceMonthly: 49,
    priceAnnual: 470,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    features: [
      "500 SMS credits/month",
      "50 voice minutes/month",
      "1 active workflow",
      "Up to 1,000 contacts",
      "Basic analytics",
      "Email support",
    ],
    limits: {
      smsCredits: 500,
      voiceMinutes: 50,
      workflows: 1,
      contacts: 1000,
      teamMembers: 1,
    },
  },
  {
    id: "growth",
    name: "Growth",
    description: "For growing businesses with more leads to reactivate",
    priceMonthly: 149,
    priceAnnual: 1430,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
    popular: true,
    features: [
      "2,000 SMS credits/month",
      "200 voice minutes/month",
      "5 active workflows",
      "Up to 10,000 contacts",
      "Advanced analytics",
      "Priority support",
      "Custom templates",
    ],
    limits: {
      smsCredits: 2000,
      voiceMinutes: 200,
      workflows: 5,
      contacts: 10000,
      teamMembers: 3,
    },
  },
  {
    id: "scale",
    name: "Scale",
    description: "For agencies and larger operations requiring volume",
    priceMonthly: 399,
    priceAnnual: 3830,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_SCALE_ANNUAL,
    features: [
      "10,000 SMS credits/month",
      "1,000 voice minutes/month",
      "Unlimited workflows",
      "Unlimited contacts",
      "White-label options",
      "Dedicated support",
      "Custom integrations",
      "API access",
    ],
    limits: {
      smsCredits: 10000,
      voiceMinutes: 1000,
      workflows: -1,
      contacts: -1,
      teamMembers: -1,
    },
  },
];

export const FREE_TRIAL_DAYS = 14;

export const CREDIT_COSTS = {
  sms: 1, // 1 credit per SMS
  voice_per_minute: 5, // 5 credits per minute of voice
  ai_processing: 2, // 2 credits per AI processing call
};

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function getPlanByName(name: string): Plan | undefined {
  return PLANS.find((plan) => plan.name.toLowerCase() === name.toLowerCase());
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

export function formatLimit(limit: number): string {
  if (limit === -1) return "Unlimited";
  return limit.toLocaleString();
}
