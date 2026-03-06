// @ts-nocheck
// ============================================
// MARK CONVERSATION AS READ API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Update conversation
    await admin
      .from('conversations')
      .update({
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', context.organization.id);

    // Mark all inbound messages as read
    await admin
      .from('conversation_messages')
      .update({
        read_at: new Date().toISOString(),
      })
      .eq('conversation_id', params.id)
      .eq('direction', 'inbound')
      .is('read_at', null);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark as read' },
      { status: 500 }
    );
  }
}
