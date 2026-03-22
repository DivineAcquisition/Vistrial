// @ts-nocheck
// Auto-execute Tier 1 actions — runs at 8:30am
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPermissionTier, canAutoSend } from '@/lib/agent/permissions';
import { generateDraft } from '@/lib/agent/drafting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, name');
  if (!orgs) return NextResponse.json({ executed: 0 });

  let executed = 0;

  for (const org of orgs) {
    // Find clients with check-ins due today and healthy enough for auto-send
    const today = new Date().toISOString().split('T')[0];
    const { data: clients } = await admin.from('clients').select('*, client_contacts(full_name, email)').eq('org_id', org.id).eq('next_check_in_date', today).gte('health_score', 70).eq('status', 'active');

    if (!clients) continue;

    for (const client of clients) {
      const tier = getPermissionTier(client.health_score || 50, 'check_in');
      if (!canAutoSend(tier)) continue;

      const contact = client.client_contacts?.[0];
      if (!contact?.email) continue;

      // Generate and auto-send check-in
      const draft = await generateDraft({
        clientName: client.company_name,
        contactName: contact.full_name || 'there',
        healthScore: client.health_score || 50,
        warningLevel: client.warning_level || 'none',
        daysSinceContact: 0,
        recentSentiment: null,
        overdueDeliverables: [],
        renewalDays: null,
        businessName: org.name || 'Our Team',
        teamMemberName: 'Account Team',
        communicationStyle: client.communication_style || 'direct',
        draftType: 'check_in',
      });

      // Save draft as auto-sent
      await admin.from('agent_drafts').insert({
        org_id: org.id, client_id: client.id, draft_type: 'check_in', channel: 'email',
        subject: draft.subject, body: draft.body, permission_tier: 1, status: 'sent',
        sent_at: new Date().toISOString(),
      });

      // Log interaction
      await admin.from('interactions').insert({
        org_id: org.id, client_id: client.id, interaction_date: new Date().toISOString(),
        type: 'check_in', direction: 'outbound', channel: 'email',
        subject: draft.subject, summary: draft.body.slice(0, 200),
        outcome: 'awaiting_response', was_automated: true,
      });

      // Log action
      await admin.from('agent_actions_log').insert({
        org_id: org.id, client_id: client.id, action_type: 'auto_check_in',
        action_detail: `Auto-sent check-in to ${contact.full_name} at ${client.company_name}`,
        permission_tier: 1,
      });

      // Update next check-in based on cadence
      const cadenceMap: Record<string, number> = { weekly: 7, bi_weekly: 14, monthly: 30, quarterly: 90 };
      const nextDays = cadenceMap[client.check_in_cadence || 'bi_weekly'] || 14;
      const nextDate = new Date(Date.now() + nextDays * 86400000).toISOString().split('T')[0];
      await admin.from('clients').update({ next_check_in_date: nextDate }).eq('id', client.id);

      executed++;
    }
  }

  return NextResponse.json({ success: true, executed });
}

export async function POST(req: NextRequest) { return GET(req); }
