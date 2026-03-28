// @ts-nocheck
// ============================================
// DAILY SCAN ENGINE
// Scans all clients for one org, generates events, dispatches alerts
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { classifyUrgency, AgentEvent, buildClientDigests } from '@/lib/agent/urgency';
import { dispatchClientDigest } from '@/lib/agent/dispatcher';

export async function runDailyScan(organizationId: string) {
  const admin = getSupabaseAdminClient();
  const allEvents: AgentEvent[] = [];
  let notificationsSent = 0;

  const { data: run } = await admin.from('agent_scheduled_runs').insert({ organization_id: organizationId, run_type: 'daily_scan', status: 'running', started_at: new Date().toISOString() }).select().single();

  try {
    const [{ data: clients }, { data: assignments }, { data: teamMembers }] = await Promise.all([
      admin.from('clients').select('*').eq('org_id', organizationId).neq('status', 'churned'),
      admin.from('client_assignments').select('*').eq('organization_id', organizationId),
      admin.from('team_members').select('*').eq('org_id', organizationId),
    ]);

    if (!clients || clients.length === 0) {
      await admin.from('agent_scheduled_runs').update({ status: 'completed', completed_at: new Date().toISOString(), results: { message: 'No active clients' } }).eq('id', run?.id);
      return { clientDigests: [], notificationsSent: 0, briefEvents: [] };
    }

    for (const client of clients) {
      const { data: lastInt } = await admin.from('interactions').select('interaction_date, sentiment').eq('client_id', client.id).order('interaction_date', { ascending: false }).limit(1).maybeSingle();
      const daysSince = lastInt ? Math.floor((Date.now() - new Date(lastInt.interaction_date).getTime()) / 86400000) : 30;

      const { count: overdueProj } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', client.id).lt('due_date', new Date().toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');

      const { data: overdueInv } = await admin.from('invoices').select('due_date').eq('client_id', client.id).eq('status', 'overdue');
      const maxInvDays = overdueInv?.length ? Math.max(...overdueInv.map(i => Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86400000))) : 0;

      const daysToRenewal = client.contract_end_date ? Math.floor((new Date(client.contract_end_date).getTime() - Date.now()) / 86400000) : null;

      // Check health override
      let healthScore = client.health_score || 50;
      if (client.health_score_override !== null && client.health_override_expires_at && new Date(client.health_override_expires_at) > new Date()) {
        healthScore = client.health_score_override;
      }

      const assignment = assignments?.find(a => a.client_id === client.id && a.role === 'account_manager');
      const assignedMember = assignment ? teamMembers?.find(m => m.id === assignment.team_member_id) : null;

      const eventData = { healthScore, daysSinceLastInteraction: daysSince, contractExpiringDays: daysToRenewal, invoiceOverdueDays: maxInvDays, deliverableOverdueDays: overdueProj || 0, healthTrend: client.health_trend };
      const base = { organizationId, clientId: client.id, clientName: client.company_name, assignedTeamMemberId: assignedMember?.id };

      if (healthScore < 20) allEvents.push({ ...base, type: 'critical_health', data: eventData, urgency: classifyUrgency('critical_health', eventData), message: `Health critical at ${healthScore}. Last contact ${daysSince}d ago.`, suggestedAction: 'Emergency call today.' });
      else if (healthScore < 50) allEvents.push({ ...base, type: 'low_health', data: eventData, urgency: classifyUrgency('low_health', eventData), message: `Health at ${healthScore}. Needs check-in.`, suggestedAction: `Personal outreach. Last contact ${daysSince}d ago.` });

      if (daysSince >= 14 && healthScore >= 20) allEvents.push({ ...base, type: 'stale_relationship', data: eventData, urgency: classifyUrgency('stale_relationship', eventData), message: `No interaction in ${daysSince} days.`, suggestedAction: 'Reach out today.' });
      if (daysToRenewal !== null && daysToRenewal <= 30 && daysToRenewal > 0) allEvents.push({ ...base, type: 'contract_expiring', data: eventData, urgency: classifyUrgency('contract_expiring', eventData), message: `Contract expires in ${daysToRenewal} days.`, suggestedAction: daysToRenewal <= 14 ? 'Schedule renewal call.' : 'Start renewal conversation.' });
      if (maxInvDays >= 7) allEvents.push({ ...base, type: 'invoice_overdue', data: eventData, urgency: classifyUrgency('invoice_overdue', eventData), message: `Invoice ${maxInvDays} days overdue.`, suggestedAction: maxInvDays >= 14 ? 'Escalate.' : 'Send reminder.' });
      if ((overdueProj || 0) > 0) allEvents.push({ ...base, type: 'deliverable_overdue', data: eventData, urgency: classifyUrgency('deliverable_overdue', eventData), message: `${overdueProj} overdue deliverable(s).`, suggestedAction: 'Update client with new date.' });
      if (healthScore >= 80 && client.health_trend === 'improving') allEvents.push({ ...base, type: 'client_thriving', data: eventData, urgency: 'routine', message: `Thriving — health at ${healthScore}.` });
    }

    const digests = buildClientDigests(allEvents);

    // Enrich with team member platform IDs
    for (const d of digests) {
      if (d.assignedTeamMemberId) {
        const m = teamMembers?.find(t => t.id === d.assignedTeamMemberId);
        if (m) { d.assignedTeamMemberName = m.full_name; d.slackUserId = m.slack_user_id; d.discordUserId = m.discord_user_id; }
      }
    }

    // Dispatch
    for (const d of digests) {
      const result = await dispatchClientDigest(d, { slack_webhook_url: null }); // Will fetch from org
      if (result.dispatched) notificationsSent++;
    }

    await admin.from('agent_scheduled_runs').update({ status: 'completed', completed_at: new Date().toISOString(), results: { clientsScanned: clients.length, eventsGenerated: allEvents.length, digestsCreated: digests.length, notificationsSent }, notifications_sent: notificationsSent }).eq('id', run?.id);

    return { clientDigests: digests, notificationsSent, briefEvents: allEvents.filter(e => e.urgency === 'important' || e.urgency === 'routine') };
  } catch (error: any) {
    await admin.from('agent_scheduled_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: error.message }).eq('id', run?.id);
    throw error;
  }
}
