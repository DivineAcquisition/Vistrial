// ============================================
// PURCHASE AND CONFIGURE PHONE NUMBER
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

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

    const apiKey = process.env.TELNYX_API_KEY;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    if (apiKey && messagingProfileId) {
      // Order the phone number via Telnyx
      const orderResponse = await fetch('https://api.telnyx.com/v2/number_orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_numbers: [{ phone_number: phoneNumber }],
          messaging_profile_id: messagingProfileId,
        }),
      });

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json().catch(() => ({}));
        console.error('Telnyx order error:', errorData);
        return NextResponse.json({ error: 'Failed to purchase number' }, { status: 500 });
      }
    }

    // Save to organization
    await admin.from('organizations').update({
      telnyx_phone_number: phoneNumber,
      telnyx_messaging_profile_id: messagingProfileId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', org.id);

    return NextResponse.json({ success: true, phoneNumber });
  } catch (error) {
    console.error('Purchase number error:', error);
    return NextResponse.json({ error: 'Failed to purchase number' }, { status: 500 });
  }
}
