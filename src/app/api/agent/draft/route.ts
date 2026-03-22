// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateDraft } from '@/lib/agent/drafting';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { clientId, draftType, teamMemberId } = await request.json();
    const admin = getSupabaseAdminClient();
    const orgId = context.organization.id;

    const { data: client } = await admin.from('clients').select('*, client_contacts(full_name)').eq('id', clientId).single();
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    const { data: teamMember } = teamMemberId ? await admin.from('team_members').select('*').eq('id', teamMemberId).single() : { data: null };

    const contactName = client.client_contacts?.[0]?.full_name || 'there';
    const org = context.organization as Record<string, any>;

    const draft = await generateDraft({
      clientName: client.company_name,
      contactName,
      healthScore: client.health_score || 50,
      warningLevel: client.warning_level || 'none',
      daysSinceContact: 0,
      recentSentiment: null,
      overdueDeliverables: [],
      renewalDays: client.contract_end_date ? Math.floor((new Date(client.contract_end_date).getTime() - Date.now()) / 86400000) : null,
      businessName: org.name || 'Our Team',
      teamMemberName: teamMember?.full_name || 'Account Team',
      communicationStyle: client.communication_style || 'direct',
      draftType: draftType || 'check_in',
    });

    const { data: saved } = await admin.from('agent_drafts').insert({
      org_id: orgId, client_id: clientId, team_member_id: teamMemberId,
      draft_type: draftType || 'check_in', channel: 'email',
      subject: draft.subject, body: draft.body,
      permission_tier: client.health_score < 40 ? 3 : client.health_score < 70 ? 2 : 1,
      status: 'pending',
      context: { healthScore: client.health_score, warningLevel: client.warning_level },
    }).select().single();

    await admin.from('agent_actions_log').insert({
      org_id: orgId, client_id: clientId, action_type: 'draft_generated',
      action_detail: `Generated ${draftType} draft for ${client.company_name}`,
      permission_tier: saved?.permission_tier,
    });

    return NextResponse.json({ success: true, draft: saved });
  } catch (error) {
    console.error('Draft error:', error);
    return NextResponse.json({ error: 'Draft generation failed' }, { status: 500 });
  }
}
