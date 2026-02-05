// @ts-nocheck
// ============================================
// CREATE CHECKOUT SESSION API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { createCheckoutSession, initializeBilling } from '@/services/billing.service';
import type { PlanTier } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan_tier } = body as { plan_tier: PlanTier };

    if (!plan_tier || !['starter', 'growth'].includes(plan_tier)) {
      return NextResponse.json(
        { error: 'Invalid plan tier' },
        { status: 400 }
      );
    }

    // Ensure organization has Stripe customer
    let stripeCustomerId = context.organization.stripe_customer_id;

    if (!stripeCustomerId) {
      stripeCustomerId = await initializeBilling({
        organizationId: context.organization.id,
        organizationName: context.organization.name,
        email: context.user.email!,
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { sessionId, url } = await createCheckoutSession({
      organization: {
        ...context.organization,
        stripe_customer_id: stripeCustomerId,
      } as any,
      planTier: plan_tier,
      successUrl: `${baseUrl}/settings/billing?success=true`,
      cancelUrl: `${baseUrl}/settings/billing?canceled=true`,
    });

    return NextResponse.json({ sessionId, url });
  } catch (error) {
    console.error('Create checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
