// @ts-nocheck
// ============================================
// SLACK INTERACTIVE WEBHOOK HANDLER
// Handles button clicks from Slack Block Kit messages
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const payloadStr = params.get('payload');
    if (!payloadStr) return NextResponse.json({ error: 'No payload' }, { status: 400 });

    const payload = JSON.parse(payloadStr);
    const actionId = payload.actions?.[0]?.action_id;
    const value = payload.actions?.[0]?.value;
    const userId = payload.user?.id;
    const admin = getSupabaseAdminClient();

    switch (actionId) {
      case 'approve_draft': {
        if (!value) break;
        const { data: draft } = await admin.from('agent_drafts').select('*').eq('id', value).single();
        if (!draft) break;

        await admin.from('agent_drafts').update({ status: 'sent', approved_at: new Date().toISOString(), sent_at: new Date().toISOString() }).eq('id', value);

        // Log the interaction
        await admin.from('interactions').insert({
          org_id: draft.org_id, client_id: draft.client_id,
          interaction_date: new Date().toISOString(),
          type: draft.draft_type || 'check_in', direction: 'outbound',
          channel: draft.channel || 'email',
          subject: draft.subject, summary: draft.body?.slice(0, 300),
          outcome: 'awaiting_response', was_automated: true, agent_draft_id: draft.id,
        });

        await admin.from('agent_actions_log').insert({
          org_id: draft.org_id, client_id: draft.client_id,
          action_type: 'draft_approved', action_detail: `Draft approved via Slack by ${userId}`,
          permission_tier: draft.permission_tier,
        });

        return NextResponse.json({ response_type: 'in_channel', text: '✅ Draft approved and sent!' });
      }

      case 'dismiss_draft': {
        if (!value) break;
        await admin.from('agent_drafts').update({ status: 'dismissed', dismissed_at: new Date().toISOString() }).eq('id', value);
        return NextResponse.json({ response_type: 'ephemeral', text: '🚫 Draft dismissed.' });
      }

      case 'handle_manually': {
        return NextResponse.json({ response_type: 'ephemeral', text: '🙋 Got it — you\'ll handle this one personally.' });
      }

      case 'edit_draft': {
        return NextResponse.json({ response_type: 'ephemeral', text: '✏️ Open the Vistrial dashboard to edit this draft.' });
      }

      default:
        return NextResponse.json({ text: 'Action received' });
    }

    return NextResponse.json({ text: 'OK' });
  } catch (error) {
    console.error('Slack webhook error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
