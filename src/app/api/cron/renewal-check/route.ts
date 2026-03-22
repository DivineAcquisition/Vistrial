// @ts-nocheck
// Renewal tracking scanner — runs at 9:30am
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendSlackMessage } from '@/lib/slack/messages';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, slack_webhook_url');
  if (!orgs) return NextResponse.json({ checked: 0 });

  let triggered = 0;
  const now = Date.now();

  for (const org of orgs) {
    const { data: clients } = await admin.from('clients').select('id, company_name, contract_end_date, renewal_status, health_score, monthly_value').eq('org_id', org.id).eq('status', 'active').not('contract_end_date', 'is', null);
    if (!clients) continue;

    for (const client of clients) {
      const daysToRenewal = Math.floor((new Date(client.contract_end_date).getTime() - now) / 86400000);
      if (daysToRenewal > 60 || daysToRenewal < 0) continue;

      const rs = client.renewal_status || 'not_yet';

      // 60 days: start sequence
      if (daysToRenewal <= 60 && daysToRenewal > 30 && rs === 'not_yet') {
        await admin.from('clients').update({ status: 'pre_renewal', renewal_status: 'sequence_started' }).eq('id', client.id);
        if (org.slack_webhook_url) {
          await sendSlackMessage(org.slack_webhook_url, [{ type: 'section', text: { type: 'mrkdwn', text: `📅 *Renewal in ${daysToRenewal} days:* ${client.company_name}\nHealth: ${client.health_score}/100 | Value: $${client.monthly_value}/mo\nSchedule renewal prep conversation within 2 weeks.` } }]);
        }
        triggered++;
      }

      // 30 days: escalate if no conversation
      if (daysToRenewal <= 30 && daysToRenewal > 14 && (rs === 'not_yet' || rs === 'sequence_started')) {
        if (org.slack_webhook_url) {
          await sendSlackMessage(org.slack_webhook_url, [{ type: 'section', text: { type: 'mrkdwn', text: `⚠️ *Renewal in ${daysToRenewal} days — no conversation yet:* ${client.company_name}\nHealth: ${client.health_score}/100 | Value: $${client.monthly_value}/mo\nDraft renewal email is ready for review.` } }]);
        }
        triggered++;
      }

      // 14 days: urgent escalation
      if (daysToRenewal <= 14 && rs !== 'accepted') {
        if (org.slack_webhook_url) {
          await sendSlackMessage(org.slack_webhook_url, [{ type: 'section', text: { type: 'mrkdwn', text: `🔴 *URGENT — Renewal in ${daysToRenewal} days:* ${client.company_name}\nStatus: ${rs} | Health: ${client.health_score}/100\nThis needs to be closed THIS WEEK. $${client.monthly_value}/mo at risk.` } }]);
        }
        triggered++;
      }
    }
  }

  return NextResponse.json({ success: true, triggered });
}

export async function POST(req: NextRequest) { return GET(req); }
