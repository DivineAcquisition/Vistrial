// @ts-nocheck
import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generatePriorities } from '@/lib/agent/priorities';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const orgId = context.organization.id;

    const { data: clients } = await admin.from('clients').select('id, company_name, health_score, warning_level, contract_end_date, renewal_status, next_check_in_date, status').eq('org_id', orgId).neq('status', 'churned');

    if (!clients) return NextResponse.json({ priorities: [] });

    // Compute days since interaction for each client
    const enriched = await Promise.all(clients.map(async (c) => {
      const { data: last } = await admin.from('interactions').select('interaction_date').eq('client_id', c.id).order('interaction_date', { ascending: false }).limit(1).maybeSingle();
      const { count: overdue } = await admin.from('projects').select('*', { count: 'exact', head: true }).eq('client_id', c.id).lt('due_date', new Date().toISOString().split('T')[0]).not('status', 'in', '("complete","cancelled")');

      return {
        ...c,
        days_since_interaction: last ? Math.floor((Date.now() - new Date(last.interaction_date).getTime()) / 86400000) : 30,
        overdue_deliverables: overdue || 0,
        days_to_renewal: c.contract_end_date ? Math.floor((new Date(c.contract_end_date).getTime() - Date.now()) / 86400000) : null,
      };
    }));

    const priorities = generatePriorities({ clients: enriched });

    return NextResponse.json({ priorities, totalEstimatedMinutes: priorities.reduce((s, p) => s + p.estimatedMinutes, 0) });
  } catch (error) {
    console.error('Priorities error:', error);
    return NextResponse.json({ error: 'Failed to generate priorities' }, { status: 500 });
  }
}
