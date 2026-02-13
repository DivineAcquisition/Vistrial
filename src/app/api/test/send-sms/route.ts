// ============================================
// TEST SMS ENDPOINT
// Use this to verify Telnyx is working
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/telnyx/send-sms';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json({ error: 'to and message are required' }, { status: 400 });
    }

    const fromNumber = context.organization.telnyx_phone_number;

    if (!fromNumber) {
      return NextResponse.json(
        { error: 'No Telnyx phone number configured for this organization' },
        { status: 400 }
      );
    }

    const result = await sendSMS({ to, from: fromNumber, text: message });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Test SMS error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send' },
      { status: 500 }
    );
  }
}
