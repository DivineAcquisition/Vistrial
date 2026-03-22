// @ts-nocheck
// Deliverable deadline scanner — runs at 9am
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendSlackMessage } from '@/lib/slack/messages';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, slack_webhook_url');
  if (!orgs) return NextResponse.json({ checked: 0 });

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const in3days = new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0];
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  let alertsSent = 0;

  for (const org of orgs) {
    if (!org.slack_webhook_url) continue;

    // Due in 3 days
    const { data: dueSoon } = await admin.from('projects').select('project_name, due_date, clients(company_name), team_members(full_name)').eq('org_id', org.id).eq('due_date', in3days).not('status', 'in', '("complete","cancelled")');
    for (const p of dueSoon || []) {
      await sendSlackMessage(org.slack_webhook_url, [{ type: 'section', text: { type: 'mrkdwn', text: `📋 *Due in 3 days:* ${p.project_name} for ${p.clients?.company_name}\nAssigned: ${p.team_members?.full_name || 'Unassigned'}` } }]);
      alertsSent++;
    }

    // Due tomorrow
    const { data: dueTomorrow } = await admin.from('projects').select('project_name, clients(company_name), team_members(full_name)').eq('org_id', org.id).eq('due_date', tomorrow).not('status', 'in', '("complete","cancelled")');
    for (const p of dueTomorrow || []) {
      await sendSlackMessage(org.slack_webhook_url, [{ type: 'section', text: { type: 'mrkdwn', text: `⏰ *Due TOMORROW:* ${p.project_name} for ${p.clients?.company_name}\nAssigned: ${p.team_members?.full_name || 'Unassigned'}. Confirm it's on track.` } }]);
      alertsSent++;
    }

    // Overdue
    const { data: overdue } = await admin.from('projects').select('project_name, due_date, clients(company_name, id), team_members(full_name)').eq('org_id', org.id).lt('due_date', todayStr).not('status', 'in', '("complete","cancelled")');
    for (const p of overdue || []) {
      const daysOver = Math.floor((today.getTime() - new Date(p.due_date).getTime()) / 86400000);
      await sendSlackMessage(org.slack_webhook_url, [{ type: 'section', text: { type: 'mrkdwn', text: `🔴 *OVERDUE (${daysOver}d):* ${p.project_name} for ${p.clients?.company_name}\nThis impacts client health score. Resolution needed today.` } }]);
      alertsSent++;
    }
  }

  return NextResponse.json({ success: true, alertsSent });
}

export async function POST(req: NextRequest) { return GET(req); }
