// @ts-nocheck
// ============================================
// RETENTION CASE MANAGEMENT
// Auto-create cases when health drops, track interventions, resolve on recovery
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function checkAndCreateRetentionCases(orgId: string) {
  const admin = getSupabaseAdminClient();

  // Find clients with active/critical warnings that don't have an open retention case
  const { data: atRiskClients } = await admin
    .from('clients')
    .select('id, company_name, health_score, warning_level, monthly_value')
    .eq('org_id', orgId)
    .in('warning_level', ['active', 'critical']);

  if (!atRiskClients || atRiskClients.length === 0) return { created: 0, resolved: 0 };

  let created = 0;
  for (const client of atRiskClients) {
    const { data: existingCase } = await admin
      .from('retention_cases')
      .select('id')
      .eq('client_id', client.id)
      .eq('status', 'open')
      .maybeSingle();

    if (!existingCase) {
      await admin.from('retention_cases').insert({
        org_id: orgId,
        client_id: client.id,
        status: 'open',
        initial_health: client.health_score,
        lowest_health: client.health_score,
        current_health: client.health_score,
        trigger_reason: `Health dropped to ${client.health_score} (${client.warning_level})`,
        revenue_at_risk: client.monthly_value || 0,
      });
      created++;
    } else {
      // Update lowest health if it dropped further
      await admin.from('retention_cases').update({
        current_health: client.health_score,
        lowest_health: Math.min(client.health_score, 0), // Will be updated properly below
      }).eq('id', existingCase.id);

      // Actually get the current lowest
      const { data: rc } = await admin.from('retention_cases').select('lowest_health').eq('id', existingCase.id).single();
      if (rc && client.health_score < (rc.lowest_health || 100)) {
        await admin.from('retention_cases').update({ lowest_health: client.health_score }).eq('id', existingCase.id);
      }
    }
  }

  // Check for resolved cases (health recovered above 70)
  let resolved = 0;
  const { data: openCases } = await admin
    .from('retention_cases')
    .select('id, client_id, opened_at')
    .eq('org_id', orgId)
    .eq('status', 'open');

  if (openCases) {
    for (const rc of openCases) {
      const { data: client } = await admin.from('clients').select('health_score, monthly_value').eq('id', rc.client_id).single();
      if (client && client.health_score >= 70) {
        const daysOpen = Math.floor((Date.now() - new Date(rc.opened_at).getTime()) / 86400000);
        await admin.from('retention_cases').update({
          status: 'saved',
          current_health: client.health_score,
          outcome: 'saved',
          days_to_resolution: daysOpen,
          revenue_saved: client.monthly_value || 0,
          resolved_at: new Date().toISOString(),
        }).eq('id', rc.id);
        resolved++;
      }
    }
  }

  return { created, resolved };
}
