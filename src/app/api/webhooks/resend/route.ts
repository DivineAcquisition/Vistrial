// @ts-nocheck
// ============================================
// RESEND WEBHOOK HANDLER
// Handle email delivery events
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

// Resend webhook event types
type ResendEvent = {
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.opened' | 'email.clicked';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    tags?: Record<string, string>;
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ResendEvent;
    const admin = getSupabaseAdminClient();

    const { type, data } = body;
    const tags = data.tags || {};

    // Only process campaign emails
    if (tags.type !== 'campaign') {
      return NextResponse.json({ received: true });
    }

    const contactId = tags.contact_id;
    const organizationId = tags.organization_id;

    if (!contactId || !organizationId) {
      return NextResponse.json({ received: true });
    }

    // Update message status based on event type
    switch (type) {
      case 'email.delivered':
        await admin
          .from('messages')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .eq('contact_id', contactId)
          .eq('type', 'email')
          .is('delivered_at', null);
        break;

      case 'email.bounced':
        await admin
          .from('messages')
          .update({
            status: 'bounced',
            metadata: { bounce_type: 'hard' },
          })
          .eq('contact_id', contactId)
          .eq('type', 'email')
          .order('created_at', { ascending: false })
          .limit(1);

        // Mark contact email as invalid
        await admin
          .from('contacts')
          .update({
            metadata: { email_bounced: true },
          })
          .eq('id', contactId);
        break;

      case 'email.complained':
        // Mark contact as unsubscribed
        await admin
          .from('contacts')
          .update({
            status: 'unsubscribed',
            unsubscribed_at: new Date().toISOString(),
          })
          .eq('id', contactId);
        break;

      case 'email.opened':
        await admin
          .from('messages')
          .update({
            metadata: { opened: true, opened_at: new Date().toISOString() },
          })
          .eq('contact_id', contactId)
          .eq('type', 'email')
          .order('created_at', { ascending: false })
          .limit(1);
        break;

      case 'email.clicked':
        await admin
          .from('messages')
          .update({
            metadata: { clicked: true, clicked_at: new Date().toISOString() },
          })
          .eq('contact_id', contactId)
          .eq('type', 'email')
          .order('created_at', { ascending: false })
          .limit(1);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
