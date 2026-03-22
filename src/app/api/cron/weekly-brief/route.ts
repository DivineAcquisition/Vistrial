// @ts-nocheck
// Weekly brief generation — runs Monday at 7am
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateWeeklyBrief } from '@/lib/agent/reports';
import { sendSlackMessage, buildWeeklyBriefBlocks } from '@/lib/slack/messages';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, slack_webhook_url');
  if (!orgs) return NextResponse.json({ generated: 0 });

  let generated = 0;

  for (const org of orgs) {
    const brief = await generateWeeklyBrief(org.id);
    if (!brief) continue;

    if (org.slack_webhook_url) {
      const blocks = buildWeeklyBriefBlocks(brief);
      await sendSlackMessage(org.slack_webhook_url, blocks);
    }

    generated++;
  }

  return NextResponse.json({ success: true, generated });
}

export async function POST(req: NextRequest) { return GET(req); }
