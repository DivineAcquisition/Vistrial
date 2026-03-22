// @ts-nocheck
// Daily health score computation for all clients — runs at 6am
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { computeFullHealth } from '@/lib/agent/health-scoring';
import { checkAndCreateRetentionCases } from '@/lib/agent/retention-cases';
import { sendSlackMessage, buildHealthAlertBlocks } from '@/lib/slack/messages';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron') || request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && !cronHeader?.includes(secret) && !cronHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id, slack_webhook_url');
  if (!orgs) return NextResponse.json({ scanned: 0 });

  let total = 0;
  let alerts = 0;

  for (const org of orgs) {
    const { data: clients } = await admin.from('clients').select('*').eq('org_id', org.id).neq('status', 'churned');
    if (!clients) continue;

    for (const client of clients) {
      const { data: lastInt } = await admin.from('interactions').select('interaction_date, sentiment').eq('client_id', client.id).order('interaction_date', { ascending: false }).limit(1).maybeSingle();
      const daysSince = lastInt ? Math.floor((Date.now() - new Date(lastInt.interaction_date).getTime()) / 86400000) : 30;
      const { count: overdueCount } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', client.id).lt('due_date', new Date().toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');
      const { count: totalProjects } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', client.id).not('status', 'in', '("complete","cancelled")');
      const { data: overdueInv } = await admin.from('invoices').select('due_date').eq('client_id', client.id).eq('status', 'overdue').order('due_date');
      const oldestDays = overdueInv?.length ? Math.floor((Date.now() - new Date(overdueInv[0].due_date).getTime()) / 86400000) : 0;
      const daysToRenewal = client.contract_end_date ? Math.floor((new Date(client.contract_end_date).getTime() - Date.now()) / 86400000) : null;
      const { data: history } = await admin.from('health_score_history').select('composite_score').eq('client_id', client.id).order('score_date', { ascending: false }).limit(7);
      const prevAvg = history?.length ? Math.round(history.reduce((s, h) => s + (h.composite_score || 50), 0) / history.length) : 50;

      const result = computeFullHealth({ daysSinceInteraction: daysSince, lastSentiment: lastInt?.sentiment, overdueDeliverables: overdueCount || 0, totalDeliverables: totalProjects || 0, overdueInvoices: overdueInv?.length || 0, oldestOverdueDays: oldestDays, daysToRenewal, renewalStatus: client.renewal_status || 'not_yet', avgResponseHours: null, npsScore: client.nps_score, previousAvgScore: prevAvg });

      const prevWarning = client.warning_level;
      await admin.from('clients').update({ health_score: result.score, health_trend: result.trend, warning_level: result.warningLevel, health_last_updated: new Date().toISOString() }).eq('id', client.id);
      await admin.from('health_score_history').insert({ org_id: org.id, client_id: client.id, interaction_recency_score: result.factors.interactionRecency, sentiment_score: result.factors.sentiment, deliverable_health_score: result.factors.deliverableHealth, billing_status_score: result.factors.billingStatus, contract_timeline_score: result.factors.contractTimeline, engagement_signal_score: result.factors.engagementSignals, composite_score: result.score, warning_level: result.warningLevel, trend: result.trend, factors: result.factors });

      // Alert on warning level change
      if (result.warningLevel !== 'none' && result.warningLevel !== prevWarning && org.slack_webhook_url) {
        await sendSlackMessage(org.slack_webhook_url, buildHealthAlertBlocks({ clientName: client.company_name, healthScore: result.score, previousScore: client.health_score || 50, warningLevel: result.warningLevel, reason: `Top factor: interaction ${daysSince}d ago, ${overdueCount || 0} overdue`, clientId: client.id }));
        alerts++;
      }
      total++;
    }

    // Check retention cases
    await checkAndCreateRetentionCases(org.id);
  }

  return NextResponse.json({ success: true, scanned: total, alerts });
}

export async function POST(req: NextRequest) { return GET(req); }
