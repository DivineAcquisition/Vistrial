// @ts-nocheck
// ============================================
// CONVERSATION MESSAGES API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getSupabaseServerClient();

    // Get conversation
    const { data: conversation, error: convError } = await supabase
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
      .eq('id', params.id)
      .eq('organization_id', context.organization.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true });

    if (msgError) {
      throw msgError;
    }

    // Format conversation
    const formattedConversation = {
      id: conversation.id,
      organization_id: conversation.organization_id,
      contact_id: conversation.contact_id,
      contact_name: conversation.contact
        ? `${conversation.contact.first_name || ''} ${conversation.contact.last_name || ''}`.trim() || null
        : null,
      contact_phone: conversation.contact?.phone || null,
      contact_email: conversation.contact?.email || null,
      status: conversation.status,
      last_message: conversation.last_message,
      last_message_at: conversation.last_message_at,
      last_message_direction: conversation.last_message_direction,
      unread_count: conversation.unread_count,
      workflow_id: conversation.workflow_id,
      workflow_name: conversation.workflow?.name || null,
      assigned_to: conversation.assigned_to,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    };

    return NextResponse.json({
      conversation: formattedConversation,
      messages: messages || [],
    });
  } catch (error) {
    console.error('Fetch messages error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = body;

    if (!content?.trim()) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();
    const admin = createAdminClient();

    // Get conversation with contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts!inner(
          id,
          phone,
          status
        )
      `)
      .eq('id', params.id)
      .eq('organization_id', context.organization.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Check contact is not unsubscribed
    if (conversation.contact.status === 'unsubscribed') {
      return NextResponse.json(
        { error: 'Contact has opted out of messages' },
        { status: 400 }
      );
    }

    const phone = conversation.contact.phone;
    if (!phone) {
      return NextResponse.json(
        { error: 'Contact has no phone number' },
        { status: 400 }
      );
    }

    // Create message record (in a real implementation, you would also send the SMS here)
    const { data: message, error: msgError } = await admin
      .from('conversation_messages')
      .insert({
        conversation_id: params.id,
        contact_id: conversation.contact_id,
        direction: 'outbound',
        type: 'sms',
        content: content.trim(),
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: {
          sent_by: context.user?.id,
        },
      })
      .select()
      .single();

    if (msgError) {
      throw msgError;
    }

    // Update conversation
    await admin
      .from('conversations')
      .update({
        last_message: content.trim(),
        last_message_at: new Date().toISOString(),
        last_message_direction: 'outbound',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    // Update contact last_contacted
    await admin
      .from('contacts')
      .update({
        last_contacted: new Date().toISOString(),
      })
      .eq('id', conversation.contact_id);

    return NextResponse.json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
