// ============================================
// SEND EMAIL API
// Endpoint for sending campaign emails
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { sendCampaignEmail } from '@/lib/email/send-campaign';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, subject, body: emailBody, ctaText, ctaUrl } = body;

    if (!contactId || !subject || !emailBody) {
      return NextResponse.json(
        { error: 'contactId, subject, and body are required' },
        { status: 400 }
      );
    }

    const result = await sendCampaignEmail({
      organizationId: context.organization.id,
      contactId,
      subject,
      body: emailBody,
      ctaText,
      ctaUrl,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
