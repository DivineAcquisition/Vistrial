// @ts-nocheck
// ============================================
// CONVERSATION UPDATE API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { status, assigned_to } = body;

    const admin = createAdminClient();

    // Verify conversation belongs to organization
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('id', params.id)
      .eq('organization_id', context.organization.id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updates.status = status;
    }

    if (assigned_to !== undefined) {
      updates.assigned_to = assigned_to;
    }

    const { data, error } = await admin
      .from('conversations')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ conversation: data });
  } catch (error) {
    console.error('Update conversation error:', error);
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    );
  }
}
