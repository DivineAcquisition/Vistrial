// @ts-nocheck
// Milestone detection — runs at 10am
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { detectMilestones } from '@/lib/agent/milestones';
import { sendSlackMessage } from '@/lib/slack/messages';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, slack_webhook_url');
  if (!orgs) return NextResponse.json({ detected: 0 });

  let totalDetected = 0;
  const milestoneLabels: Record<string, string> = {
    '30_day': '30 Day', '60_day': '60 Day', '90_day': '90 Day',
    '6_month': '6 Month', '1_year': '1 Year', 'renewal_confirmed': 'Renewal Confirmed',
  };

  for (const org of orgs) {
    const milestones = await detectMilestones(org.id);
    totalDetected += milestones.length;

    if (milestones.length > 0 && org.slack_webhook_url) {
      const celebrationLines = milestones.map(m => `🎉 ${m.clientName} — ${milestoneLabels[m.type] || m.type} milestone!`);
      await sendSlackMessage(org.slack_webhook_url, [
        { type: 'header', text: { type: 'plain_text', text: '🎉 Milestones Today' } },
        { type: 'section', text: { type: 'mrkdwn', text: celebrationLines.join('\n') } },
      ]);
    }
  }

  return NextResponse.json({ success: true, detected: totalDetected });
}

export async function POST(req: NextRequest) { return GET(req); }
