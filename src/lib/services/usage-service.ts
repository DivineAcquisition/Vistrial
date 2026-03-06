// ============================================
// USAGE TRACKING SERVICE
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkUsageLimit, type ResourceType } from '@/lib/middleware/usage-enforcement';
import { emitEvent } from '@/lib/events/event-bus';

export async function recordUsage(
  organizationId: string,
  type: string,
  quantity: number = 1
): Promise<void> {
  const admin = getSupabaseAdminClient();

  const { data: org } = await admin
    .from('organizations')
    .select('subscription_current_period_start, subscription_current_period_end')
    .eq('id', organizationId)
    .single();

  const periodStart = org?.subscription_current_period_start
    ? new Date(org.subscription_current_period_start)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = org?.subscription_current_period_end
    ? new Date(org.subscription_current_period_end)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  await admin.from('usage_records').insert({
    organization_id: organizationId,
    usage_type: type,
    quantity,
    period_start: periodStart.toISOString().split('T')[0],
    period_end: periodEnd.toISOString().split('T')[0],
  });
}

export async function checkAndWarnUsage(
  organizationId: string,
  type: ResourceType
): Promise<void> {
  const check = await checkUsageLimit(organizationId, type);
  if (check.limit === -1) return;

  const pct = (check.currentUsage / check.limit) * 100;

  if (pct >= 80 && pct < 100) {
    await emitEvent('billing.usage_limit_warning', {
      organizationId, resourceType: type, usagePercent: pct,
    });
  }

  if (pct >= 100) {
    await emitEvent('billing.usage_limit_exceeded', {
      organizationId, resourceType: type,
    });
  }
}
