// ============================================
// SUBSCRIPTION PLAN CONSTANTS
// ============================================

export const PLANS = {
  lite: {
    id: 'lite',
    name: 'Lite',
    price: {
      monthly: 49,
      yearly: 490,
    },
    limits: {
      sms: 500,
      email: 1000,
      contacts: 1000,
      workflows: 3,
      teamMembers: 1,
    },
    features: [
      '500 SMS/month',
      '1,000 emails/month',
      'Up to 1,000 contacts',
      '3 active workflows',
      'Basic analytics',
      'Email support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: {
      monthly: 149,
      yearly: 1490,
    },
    limits: {
      sms: 2000,
      email: 5000,
      contacts: 10000,
      workflows: 10,
      teamMembers: 5,
    },
    features: [
      '2,000 SMS/month',
      '5,000 emails/month',
      'Up to 10,000 contacts',
      '10 active workflows',
      'Advanced analytics',
      'Priority support',
      '5 team members',
      'Custom booking pages',
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    price: {
      monthly: 349,
      yearly: 3490,
    },
    limits: {
      sms: 10000,
      email: 25000,
      contacts: -1, // unlimited
      workflows: -1, // unlimited
      teamMembers: -1, // unlimited
    },
    features: [
      '10,000 SMS/month',
      '25,000 emails/month',
      'Unlimited contacts',
      'Unlimited workflows',
      'White-label options',
      'Dedicated support',
      'Unlimited team members',
      'API access',
      'Custom integrations',
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const OVERAGE_RATES = {
  sms: 0.015, // $0.015 per SMS over limit
  email: 0.002, // $0.002 per email over limit
} as const;

export function getPlanLimits(planId: string | null) {
  if (!planId || !(planId in PLANS)) {
    // Free/trial limits
    return {
      sms: 100,
      email: 100,
      contacts: 100,
      workflows: 1,
      teamMembers: 1,
    };
  }

  return PLANS[planId as PlanId].limits;
}
