// ============================================
// PURCHASE PHONE NUMBER API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { purchaseNumber } from '@/lib/telnyx/numbers';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const result = await purchaseNumber(phoneNumber);

    const admin = getSupabaseAdminClient();
    await admin
      .from('organizations')
      .update({
        telnyx_phone_number: phoneNumber,
        telnyx_messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.organization.id);

    return NextResponse.json({ success: true, phoneNumber, numberId: result.id });
  } catch (error) {
    console.error('Purchase number error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Purchase failed' },
      { status: 500 }
    );
  }
}
