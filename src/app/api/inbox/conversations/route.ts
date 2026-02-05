// @ts-nocheck
// ============================================
// CONVERSATIONS LIST API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';

    const supabase = await getSupabaseServerClient();

    let query = supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts!inner(
          id,
          first_name,
          last_name,
          phone,
          email
        ),
        workflow:workflows(
          id,
          name
        )
      `)
      .eq('organization_id', context.organization.id)
      .order('last_message_at', { ascending: false });

    // Apply filters
    switch (filter) {
      case 'unread':
        query = query.gt('unread_count', 0);
        break;
      case 'interested':
        query = query.eq('status', 'interested');
        break;
      case 'needs_response':
        query = query.eq('status', 'needs_response');
        break;
      case 'booked':
        query = query.eq('status', 'booked');
        break;
      case 'closed':
        query = query.eq('status', 'closed');
        break;
    }

    const { data, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    // Format conversations
    const conversations = data?.map((conv) => ({
      id: conv.id,
      organization_id: conv.organization_id,
      contact_id: conv.contact_id,
      contact_name: conv.contact
        ? `${conv.contact.first_name || ''} ${conv.contact.last_name || ''}`.trim() || null
        : null,
      contact_phone: conv.contact?.phone || null,
      contact_email: conv.contact?.email || null,
      status: conv.status,
      last_message: conv.last_message,
      last_message_at: conv.last_message_at,
      last_message_direction: conv.last_message_direction,
      unread_count: conv.unread_count,
      workflow_id: conv.workflow_id,
      workflow_name: conv.workflow?.name || null,
      assigned_to: conv.assigned_to,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
    })) || [];

    // Get total unread count
    const { count: unreadCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', context.organization.id)
      .gt('unread_count', 0);

    return NextResponse.json({
      conversations,
      unread_count: unreadCount || 0,
    });
  } catch (error) {
    console.error('Fetch conversations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
