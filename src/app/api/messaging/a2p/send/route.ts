// @ts-nocheck
// ============================================
// SEND SMS VIA A2P REGISTERED NUMBER
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendSmsViaTelnyx } from '@/lib/telnyx/a2p-service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, message, contactId, workflowId, enrollmentId } = await request.json();
    if (!to || !message) return NextResponse.json({ error: 'to and message required' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const orgId = context.organization.id;

    // Get messaging registration
    const { data: reg } = await admin.from('messaging_registrations').select('*').eq('org_id', orgId).eq('overall_status', 'active').maybeSingle();
    if (!reg) return NextResponse.json({ error: 'Messaging not active. Complete A2P setup first.' }, { status: 400 });

    // Send via Telnyx
    const result = await sendSmsViaTelnyx({
      from: reg.telnyx_phone_number,
      to,
      text: message,
      messagingProfileId: reg.telnyx_messaging_profile_id,
    });

    // Log message
    await admin.from('message_log').insert({
      org_id: orgId,
      contact_id: contactId || null,
      workflow_id: workflowId || null,
      enrollment_id: enrollmentId || null,
      direction: 'outbound',
      channel: 'sms',
      from_number: reg.telnyx_phone_number,
      to_number: to,
      body: message,
      telnyx_message_id: result.messageId,
      status: result.status || 'queued',
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, messageId: result.messageId, status: result.status });
  } catch (error) {
    console.error('Send SMS error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Send failed' }, { status: 500 });
  }
}
