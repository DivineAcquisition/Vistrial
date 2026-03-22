// @ts-nocheck
// ============================================
// MILESTONE DETECTION
// Auto-detect and celebrate client achievements
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function detectMilestones(orgId: string) {
  const admin = getSupabaseAdminClient();
  const today = new Date();
  const detected: Array<{ clientId: string; clientName: string; type: string }> = [];

  const { data: clients } = await admin
    .from('clients')
    .select('id, company_name, start_date, health_score, warning_level, renewal_status, referrals_given, testimonial_status')
    .eq('org_id', orgId)
    .eq('status', 'active');

  if (!clients) return detected;

  for (const client of clients) {
    if (!client.start_date) continue;

    const daysInEngagement = Math.floor((today.getTime() - new Date(client.start_date).getTime()) / 86400000);

    const milestoneChecks = [
      { type: '30_day', days: 30, tolerance: 1 },
      { type: '60_day', days: 60, tolerance: 1 },
      { type: '90_day', days: 90, tolerance: 1 },
      { type: '6_month', days: 182, tolerance: 2 },
      { type: '1_year', days: 365, tolerance: 2 },
    ];

    for (const check of milestoneChecks) {
      if (Math.abs(daysInEngagement - check.days) <= check.tolerance) {
        // Check if already recorded
        const { data: existing } = await admin
          .from('milestones')
          .select('id')
          .eq('client_id', client.id)
          .eq('milestone_type', check.type)
          .maybeSingle();

        if (!existing) {
          await admin.from('milestones').insert({
            org_id: orgId,
            client_id: client.id,
            milestone_type: check.type,
            date_achieved: today.toISOString().split('T')[0],
          });
          detected.push({ clientId: client.id, clientName: client.company_name, type: check.type });
        }
      }
    }

    // Renewal confirmed milestone
    if (client.renewal_status === 'accepted') {
      const { data: existing } = await admin.from('milestones').select('id').eq('client_id', client.id).eq('milestone_type', 'renewal_confirmed').maybeSingle();
      if (!existing) {
        await admin.from('milestones').insert({ org_id: orgId, client_id: client.id, milestone_type: 'renewal_confirmed' });
        detected.push({ clientId: client.id, clientName: client.company_name, type: 'renewal_confirmed' });
      }
    }
  }

  return detected;
}
