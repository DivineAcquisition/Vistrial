// @ts-nocheck
// ============================================
// REPORT GENERATION
// Weekly brief + monthly summary
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function generateWeeklyBrief(orgId: string) {
  const admin = getSupabaseAdminClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const { data: clients } = await admin.from('clients').select('*').eq('org_id', orgId).neq('status', 'churned');
  if (!clients) return null;

  const totalClients = clients.length;
  const avgHealth = totalClients > 0 ? Math.round(clients.reduce((s, c) => s + (c.health_score || 50), 0) / totalClients) : 0;

  const healthDist = {
    green: clients.filter(c => (c.health_score || 50) >= 80).length,
    yellow: clients.filter(c => (c.health_score || 50) >= 60 && (c.health_score || 50) < 80).length,
    orange: clients.filter(c => (c.health_score || 50) >= 40 && (c.health_score || 50) < 60).length,
    red: clients.filter(c => (c.health_score || 50) < 40).length,
  };

  const needsAttention = clients
    .filter(c => c.warning_level && c.warning_level !== 'none')
    .sort((a, b) => (a.health_score || 50) - (b.health_score || 50))
    .slice(0, 5)
    .map(c => ({ name: c.company_name, score: c.health_score || 50, trend: c.health_trend || 'stable', reason: c.warning_level || '' }));

  const renewals = clients
    .filter(c => c.contract_end_date && new Date(c.contract_end_date).getTime() - now.getTime() < 60 * 86400000)
    .map(c => ({
      name: c.company_name,
      daysLeft: Math.floor((new Date(c.contract_end_date).getTime() - now.getTime()) / 86400000),
      status: c.renewal_status || 'not_yet',
      health: c.health_score || 50,
    }));

  const { count: deliverablesDue } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('due_date', now.toISOString().split('T')[0]).lte('due_date', new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');
  const { count: overdueCount } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('org_id', orgId).lt('due_date', now.toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');
  const { count: completedLastWeek } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('completed_date', weekAgo.toISOString().split('T')[0]).eq('status', 'complete');

  // Recent milestones
  const { data: recentMilestones } = await admin.from('milestones').select('*, clients(company_name)').eq('org_id', orgId).gte('date_achieved', weekAgo.toISOString().split('T')[0]);

  // Revenue
  const mrr = clients.filter(c => c.status === 'active').reduce((s, c) => s + (parseFloat(c.monthly_value) || 0), 0);

  return {
    totalClients,
    avgHealth,
    healthDistribution: healthDist,
    needsAttention,
    renewals,
    deliverablesDue: deliverablesDue || 0,
    overdueCount: overdueCount || 0,
    completedLastWeek: completedLastWeek || 0,
    milestones: recentMilestones || [],
    mrr,
  };
}

export function formatWeeklyBriefText(brief: any): string {
  const d = brief.healthDistribution;
  let text = `📊 WEEKLY OPERATIONS BRIEF\n\n`;
  text += `PORTFOLIO HEALTH\n`;
  text += `Total clients: ${brief.totalClients} | Avg health: ${brief.avgHealth}/100\n`;
  text += `🟢 ${d.green} healthy | 🟡 ${d.yellow} watch | 🟠 ${d.orange} at-risk | 🔴 ${d.red} critical\n\n`;

  if (brief.needsAttention.length > 0) {
    text += `NEEDS ATTENTION\n`;
    brief.needsAttention.forEach((c: any) => { text += `• ${c.name} — ${c.score}/100 (${c.trend}) — ${c.reason}\n`; });
    text += '\n';
  }

  if (brief.renewals.length > 0) {
    text += `RENEWALS\n`;
    brief.renewals.forEach((r: any) => { text += `• ${r.name} — ${r.daysLeft} days — ${r.status} — Health: ${r.health}\n`; });
    text += '\n';
  }

  text += `FULFILLMENT\n`;
  text += `Due this week: ${brief.deliverablesDue} | Overdue: ${brief.overdueCount} | Completed last week: ${brief.completedLastWeek}\n\n`;
  text += `MRR: $${brief.mrr.toLocaleString()}\n`;

  return text;
}
