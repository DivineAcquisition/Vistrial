// @ts-nocheck
// ============================================
// AUTO-REFILL SETTINGS API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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
      !context.membership?.permissions?.billing
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { enabled, amount_cents } = body;

    // Validate amount
    if (enabled && (!amount_cents || amount_cents < 1500)) {
      return NextResponse.json(
        { error: 'Minimum refill amount is $15' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();

    const { error } = await admin
      .from('credit_balances')
      .update({
        auto_refill_enabled: enabled,
        auto_refill_amount_cents: enabled ? amount_cents : null,
      })
      .eq('organization_id', context.organization.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Auto-refill settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
