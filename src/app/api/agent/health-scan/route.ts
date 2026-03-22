// @ts-nocheck
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { computeFullHealth } from '@/lib/agent/health-scoring';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const admin = getSupabaseAdminClient();

    const { data: orgs } = await admin.from('organizations').select('id');
    if (!orgs) return NextResponse.json({ scanned: 0 });

    let totalScanned = 0;

    for (const org of orgs) {
      const { data: clients } = await admin.from('clients').select('*').eq('org_id', org.id).neq('status', 'churned');
      if (!clients) continue;

      for (const client of clients) {
        // Get latest interaction
        const { data: lastInteraction } = await admin.from('interactions').select('interaction_date, sentiment').eq('client_id', client.id).order('interaction_date', { ascending: false }).limit(1).maybeSingle();
        const daysSince = lastInteraction ? Math.floor((Date.now() - new Date(lastInteraction.interaction_date).getTime()) / 86400000) : 30;

        // Get overdue deliverables
        const { count: overdueCount } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', client.id).lt('due_date', new Date().toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');
        const { count: totalProjects } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', client.id).not('status', 'in', '("complete","cancelled")');

        // Get overdue invoices
        const { data: overdueInvoices } = await admin.from('invoices').select('due_date').eq('client_id', client.id).eq('status', 'overdue').order('due_date', { ascending: true });
        const oldestOverdueDays = overdueInvoices?.length ? Math.floor((Date.now() - new Date(overdueInvoices[0].due_date).getTime()) / 86400000) : 0;

        // Days to renewal
        const daysToRenewal = client.contract_end_date ? Math.floor((new Date(client.contract_end_date).getTime() - Date.now()) / 86400000) : null;

        // Previous avg score (7-day)
        const { data: history } = await admin.from('health_score_history').select('composite_score').eq('client_id', client.id).order('score_date', { ascending: false }).limit(7);
        const prevAvg = history?.length ? Math.round(history.reduce((s, h) => s + (h.composite_score || 50), 0) / history.length) : 50;

        const result = computeFullHealth({
          daysSinceInteraction: daysSince,
          lastSentiment: lastInteraction?.sentiment || null,
          overdueDeliverables: overdueCount || 0,
          totalDeliverables: totalProjects || 0,
          overdueInvoices: overdueInvoices?.length || 0,
          oldestOverdueDays,
          daysToRenewal,
          renewalStatus: client.renewal_status || 'not_yet',
          avgResponseHours: null,
          npsScore: client.nps_score,
          previousAvgScore: prevAvg,
        });

        // Update client record
        await admin.from('clients').update({
          health_score: result.score,
          health_trend: result.trend,
          warning_level: result.warningLevel,
          health_last_updated: new Date().toISOString(),
        }).eq('id', client.id);

        // Record history
        await admin.from('health_score_history').insert({
          org_id: org.id, client_id: client.id,
          interaction_recency_score: result.factors.interactionRecency,
          sentiment_score: result.factors.sentiment,
          deliverable_health_score: result.factors.deliverableHealth,
          billing_status_score: result.factors.billingStatus,
          contract_timeline_score: result.factors.contractTimeline,
          engagement_signal_score: result.factors.engagementSignals,
          composite_score: result.score,
          warning_level: result.warningLevel,
          trend: result.trend,
          factors: result.factors,
        });

        totalScanned++;
      }
    }

    return NextResponse.json({ success: true, scanned: totalScanned });
  } catch (error) {
    console.error('Health scan error:', error);
    return NextResponse.json({ error: 'Health scan failed' }, { status: 500 });
  }
}
