// ============================================
// ANALYTICS SERVICE
// Central service for all analytics tracking
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function updateAnalytics(
  organizationId: string,
  metric: string,
  value: number = 1
): Promise<void> {
  const admin = getSupabaseAdminClient();
  const today = new Date().toISOString().split('T')[0];

  // Try to upsert via RPC, fallback to direct insert
  try {
    await admin.rpc('upsert_daily_metric', {
      p_organization_id: organizationId,
      p_date: today,
      p_metric: metric,
      p_value: value,
    });
  } catch {
    // Fallback: direct insert (will be aggregated later)
    await admin.from('usage_records').insert({
      organization_id: organizationId,
      usage_type: `analytics_${metric}`,
      quantity: value,
      period_start: today,
      period_end: today,
    }).then(() => {}).catch(() => {});
  }
}

export async function getAnalyticsSummary(
  organizationId: string,
  startDate: Date,
  endDate: Date
) {
  const admin = getSupabaseAdminClient();

  const { data } = await admin
    .from('daily_metrics')
    .select('date, metric, value')
    .eq('organization_id', organizationId)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  const summary: Record<string, number> = {};
  for (const row of data || []) {
    summary[row.metric] = (summary[row.metric] || 0) + row.value;
  }
  return { summary, data: data || [] };
}
