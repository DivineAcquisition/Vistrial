// @ts-nocheck
// ============================================
// EMAIL SEND API
// Manual email sending endpoint via Resend
// Domains: vistrial.io & mail.vistrial.io
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { sendEmailMessage } from '@/services/messaging.service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { contact_id, subject, content } = body as {
      contact_id: string;
      subject: string;
      content: string;
    };

    if (!contact_id || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: contact_id, content' },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        { error: 'Missing required field: subject' },
        { status: 400 }
      );
    }

    if (content.length > 50000) {
      return NextResponse.json(
        { error: 'Email content too long (max 50,000 characters)' },
        { status: 400 }
      );
    }

    const result = await sendEmailMessage({
      organizationId: context.organization.id,
      contactId: contact_id,
      subject,
      content,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message_id: result.dbMessageId,
      cost_cents: result.costCents,
    });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
