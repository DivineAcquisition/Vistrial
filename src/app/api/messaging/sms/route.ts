// @ts-nocheck
// ============================================
// SMS SEND API
// Manual SMS sending endpoint
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { sendSmsMessage } from '@/services/messaging.service';

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
    const { contact_id, content } = body as {
      contact_id: string;
      content: string;
    };

    if (!contact_id || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: contact_id, content' },
        { status: 400 }
      );
    }

    if (content.length > 1600) {
      return NextResponse.json(
        { error: 'Message content too long (max 1600 characters)' },
        { status: 400 }
      );
    }

    const result = await sendSmsMessage({
      organizationId: context.organization.id,
      contactId: contact_id,
      content,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send message' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message_id: result.dbMessageId,
      cost_cents: result.costCents,
    });
  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}
