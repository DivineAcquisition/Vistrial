// ============================================
// SUBSCRIPTION MANAGEMENT API
// GET current subscription, PATCH to cancel/resume/upgrade
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getStripeServerClient } from '@/lib/stripe/server';
import { PLANS, getPlanById, getPlanByPriceId, isYearlyPrice } from '@/lib/stripe/plans';

// GET - Get current subscription details
export async function GET() {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    if (!org.stripe_subscription_id) {
      return NextResponse.json({ subscription: null });
    }

    try {
      const stripe = getStripeServerClient();
      const subscription = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id
      );

      const priceId = subscription.items.data[0]?.price.id;
      const plan = getPlanByPriceId(priceId);

      return NextResponse.json({
        subscription: {
          id: subscription.id,
          status: subscription.status,
          planId: plan?.id || org.subscription_plan || 'lite',
          planName: plan?.name || 'Unknown Plan',
          priceId,
          interval: isYearlyPrice(priceId) ? 'year' : 'month',
          currentPeriodStart: new Date(
            subscription.current_period_start * 1000
          ).toISOString(),
          currentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : null,
        },
      });
    } catch (error) {
      console.error('Failed to fetch subscription from Stripe:', error);
      // Return data from database as fallback
      return NextResponse.json({
        subscription: org.stripe_subscription_id
          ? {
              id: org.stripe_subscription_id,
              status: org.subscription_status || 'active',
              planId: org.subscription_plan || org.plan_tier || 'lite',
              planName: getPlanById(org.subscription_plan || org.plan_tier || 'lite')?.name || 'Lite',
              interval: org.subscription_interval || 'month',
              currentPeriodEnd: org.subscription_current_period_end || org.current_period_end,
              cancelAtPeriodEnd: false,
            }
          : null,
      });
    }
  } catch (error) {
    console.error('Get subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

// PATCH - Update subscription (cancel, resume, upgrade/downgrade)
export async function PATCH(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, planId, interval } = body;

    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    if (!org.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription' },
        { status: 400 }
      );
    }

    const stripe = getStripeServerClient();

    switch (action) {
      case 'cancel': {
        await stripe.subscriptions.update(org.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
        return NextResponse.json({
          success: true,
          message: 'Subscription will cancel at period end',
        });
      }

      case 'resume': {
        await stripe.subscriptions.update(org.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
        return NextResponse.json({
          success: true,
          message: 'Subscription resumed',
        });
      }

      case 'upgrade':
      case 'downgrade': {
        const plan = PLANS[planId];
        if (!plan) {
          return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }
        const priceId =
          interval === 'yearly'
            ? plan.stripePriceIdYearly
            : plan.stripePriceIdMonthly;

        if (!priceId) {
          return NextResponse.json(
            { error: 'Price not configured' },
            { status: 400 }
          );
        }

        const subscription = await stripe.subscriptions.retrieve(
          org.stripe_subscription_id
        );
        await stripe.subscriptions.update(org.stripe_subscription_id, {
          items: [
            {
              id: subscription.items.data[0].id,
              price: priceId,
            },
          ],
          proration_behavior: 'create_prorations',
        });

        return NextResponse.json({
          success: true,
          message: 'Subscription updated',
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Update subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
