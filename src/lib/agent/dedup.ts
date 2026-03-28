// @ts-nocheck
// ============================================
// DEDUPLICATION LAYER
// Prevents duplicate notifications within same day
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export function generateDedupKey(organizationId: string, clientId: string | undefined, eventType: string, date?: Date): string {
  const dateStr = (date || new Date()).toISOString().split('T')[0];
  return `${organizationId}:${clientId || 'system'}:${eventType}:${dateStr}`;
}

export async function wasAlreadyDispatched(dedupKey: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('agent_dedup_log').select('id').eq('dedup_key', dedupKey).maybeSingle();
  return data !== null;
}

export async function recordDispatch(dedupKey: string, organizationId: string, clientId: string | undefined, eventType: string, channelsUsed: string[]): Promise<void> {
  const admin = getSupabaseAdminClient();
  await admin.from('agent_dedup_log').upsert({ dedup_key: dedupKey, organization_id: organizationId, client_id: clientId, event_type: eventType, channels_used: channelsUsed, dispatched_at: new Date().toISOString() }, { onConflict: 'dedup_key' });
}
