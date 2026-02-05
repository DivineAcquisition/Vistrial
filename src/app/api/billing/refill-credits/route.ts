// @ts-nocheck
// ============================================
// REFILL CREDITS API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { processCreditsRefill } from '@/services/billing.service';
import { MIN_REFILL_AMOUNT, isValidRefillAmount } from '@/lib/stripe/prices';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check billing permission
    if (
      context.membership?.role !== 'owner' &&
      !context.membership?.permissions.billing
    ) {
      return NextResponse.json(
        { error: 'No permission to manage billing' },
        { status: 403 }
      );
    }

    if (!context.organization.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { amount_cents } = body as { amount_cents: number };

    if (!amount_cents || !isValidRefillAmount(amount_cents)) {
      return NextResponse.json(
        { error: `Minimum refill amount is $${(MIN_REFILL_AMOUNT / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    const result = await processCreditsRefill({
      organizationId: context.organization.id,
      amountCents: amount_cents,
      stripeCustomerId: context.organization.stripe_customer_id,
      isAutoRefill: false,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Payment failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      new_balance_cents: result.newBalance,
    });
  } catch (error) {
    console.error('Refill credits error:', error);
    return NextResponse.json(
      { error: 'Failed to refill credits' },
      { status: 500 }
    );
  }
}
