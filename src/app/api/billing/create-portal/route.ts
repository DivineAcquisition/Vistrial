// @ts-nocheck
// ============================================
// CREATE BILLING PORTAL SESSION API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { createBillingPortalSession } from '@/services/billing.service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!context.organization.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const url = await createBillingPortalSession({
      organization: context.organization as any,
      returnUrl: `${baseUrl}/settings/billing`,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Create portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
