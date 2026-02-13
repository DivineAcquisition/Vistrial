// ============================================
// SEND MESSAGE API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { sendMessage } from '@/lib/services/message-service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, type = 'sms', content, subject } = body;

    if (!contactId || !content) {
      return NextResponse.json({ error: 'contactId and content are required' }, { status: 400 });
    }

    const result = await sendMessage({
      organizationId: context.organization.id,
      contactId,
      type,
      content,
      subject,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
