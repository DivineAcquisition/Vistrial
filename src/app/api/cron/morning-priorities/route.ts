// @ts-nocheck
// Daily priority generation — runs at 8am, delivers to Slack DMs
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generatePriorities } from '@/lib/agent/priorities';
import { sendSlackMessage } from '@/lib/slack/messages';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, slack_webhook_url');
  if (!orgs) return NextResponse.json({ generated: 0 });

  let generated = 0;

  for (const org of orgs) {
    const { data: teamMembers } = await admin.from('team_members').select('id, full_name, slack_user_id').eq('org_id', org.id).eq('status', 'active');
    if (!teamMembers) continue;

    for (const tm of teamMembers) {
      const { data: clients } = await admin.from('clients').select('id, company_name, health_score, warning_level, contract_end_date, renewal_status, next_check_in_date, status').eq('org_id', org.id).eq('assigned_to', tm.id).neq('status', 'churned');
      if (!clients || clients.length === 0) continue;

      const enriched = await Promise.all(clients.map(async (c) => {
        const { data: last } = await admin.from('interactions').select('interaction_date').eq('client_id', c.id).order('interaction_date', { ascending: false }).limit(1).maybeSingle();
        const { count: overdue } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', c.id).lt('due_date', new Date().toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');
        return { ...c, days_since_interaction: last ? Math.floor((Date.now() - new Date(last.interaction_date).getTime()) / 86400000) : 30, overdue_deliverables: overdue || 0, days_to_renewal: c.contract_end_date ? Math.floor((new Date(c.contract_end_date).getTime() - Date.now()) / 86400000) : null };
      }));

      const priorities = generatePriorities({ clients: enriched });
      if (priorities.length === 0) continue;

      const estHours = Math.round(priorities.reduce((s, p) => s + p.estimatedMinutes, 0) / 60 * 10) / 10;

      await admin.from('daily_priorities').insert({ org_id: org.id, team_member_id: tm.id, priorities, estimated_hours: estHours, auto_actions_count: priorities.filter(p => p.urgency === 'low').length, delivered_via: 'slack', delivered_at: new Date().toISOString() });

      // Send to Slack
      if (org.slack_webhook_url) {
        const urgencyEmoji = { critical: '🔴', high: '🟡', medium: '🟢', low: '⚪' };
        const lines = priorities.slice(0, 8).map((p, i) => `${urgencyEmoji[p.urgency]} ${i + 1}. ${p.action} — ${p.clientName} — ${p.reason}`);
        await sendSlackMessage(org.slack_webhook_url, [
          { type: 'section', text: { type: 'mrkdwn', text: `Good morning ${tm.full_name}. Here's your day.\n\n${lines.join('\n')}\n\nEstimated time: ${estHours} hours.` } },
        ]);
      }
      generated++;
    }
  }

  return NextResponse.json({ success: true, generated });
}

export async function POST(req: NextRequest) { return GET(req); }
