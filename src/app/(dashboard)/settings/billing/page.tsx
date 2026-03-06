// ============================================
// BILLING SETTINGS PAGE
// Server component that fetches data and renders dashboard
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { BillingDashboard } from '@/components/billing/billing-dashboard';
import { PLANS, getPlanById } from '@/lib/stripe/plans';
import { getOrganizationUsage, calculateOverageCharges } from '@/lib/stripe/usage';
import type { UsageData } from '@/lib/stripe/usage';

export const metadata: Metadata = {
  title: 'Billing',
};

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const org = context.organization as Record<string, any>;

  // Get subscription data from database (fast, avoids Stripe API call at page load)
  const subscription = org.stripe_subscription_id
    ? {
        id: org.stripe_subscription_id,
        status: org.subscription_status || 'active',
        planId: org.subscription_plan || org.plan_tier || 'lite',
        planName:
          getPlanById(org.subscription_plan || org.plan_tier || 'lite')?.name ||
          'Lite',
        interval: org.subscription_interval || 'month',
        currentPeriodStart: org.subscription_current_period_start || org.current_period_start,
        currentPeriodEnd: org.subscription_current_period_end || org.current_period_end,
        cancelAtPeriodEnd: false,
      }
    : null;

  // Fetch usage data
  let usage: UsageData;
  try {
    usage = await getOrganizationUsage(org.id);
  } catch (error) {
    console.error('Failed to load usage data:', error);
    usage = {
      sms: { used: 0, limit: 500, overage: 0 },
      emails: { used: 0, limit: 2000, overage: 0 },
      voiceDrops: { used: 0, limit: 0, overage: 0 },
      contacts: { used: 0, limit: 500 },
      workflows: { used: 0, limit: 3 },
      bookingPages: { used: 0, limit: 1 },
    };
  }

  const overageCharges = calculateOverageCharges(usage);

  const currentPlan =
    getPlanById(subscription?.planId || 'lite') || PLANS.lite;

  return (
    <BillingDashboard
      organization={org}
      subscription={subscription}
      usage={usage}
      overageCharges={overageCharges}
      currentPlan={currentPlan}
      plans={Object.values(PLANS)}
      showSuccessMessage={searchParams.success === 'true'}
      showCanceledMessage={searchParams.canceled === 'true'}
    />
  );
}
