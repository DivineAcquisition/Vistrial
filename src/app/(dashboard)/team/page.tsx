// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, AlertCircle } from 'lucide-react';

export const metadata: Metadata = { title: 'Team | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const orgId = (context.organization as any).id;

  const { data: members } = await admin.from('team_members').select('*').eq('org_id', orgId).order('full_name');
  const all = members || [];

  // Get client counts per member
  const enriched = await Promise.all(all.map(async (m) => {
    const { count: activeClients } = await admin.from('clients').select('*', { count: 'exact', head: true }).eq('assigned_to', m.id).neq('status', 'churned');
    const { count: atRiskClients } = await admin.from('clients').select('*', { count: 'exact', head: true }).eq('assigned_to', m.id).in('warning_level', ['active', 'critical']);
    const { data: clientsList } = await admin.from('clients').select('health_score').eq('assigned_to', m.id).neq('status', 'churned');
    const avgHealth = clientsList?.length ? Math.round(clientsList.reduce((s, c) => s + (c.health_score || 50), 0) / clientsList.length) : 0;
    const capacityPct = m.client_capacity > 0 ? Math.round((activeClients || 0) / m.client_capacity * 100) : 0;
    return { ...m, activeClients: activeClients || 0, atRiskClients: atRiskClients || 0, avgHealth, capacityPct };
  }));

  return (
    <div className="space-y-6 dashboard-page">
      <div><h1 className="text-2xl font-bold tracking-tight">Team Workload</h1><p className="text-gray-500 text-sm mt-1">Monitor capacity and client assignments</p></div>

      <Card>
        <CardHeader><CardTitle>Team Members</CardTitle></CardHeader>
        <CardContent>
          {enriched.length === 0 ? <p className="text-gray-400 text-sm text-center py-12">No team members yet</p> : (
            <div className="space-y-3">{enriched.map(m => (
              <div key={m.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 hover:shadow-soft transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center font-bold text-sm text-brand-600">{m.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                  <div><p className="font-semibold text-sm">{m.full_name}</p><p className="text-[10px] text-gray-400">{m.role?.replace('_', ' ')} · {m.email}</p></div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center"><p className="font-bold">{m.activeClients}/{m.client_capacity}</p><p className="text-[10px] text-gray-400">Clients</p></div>
                  <div className="w-24">
                    <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-gray-400">Capacity</span><span className="text-[10px] font-medium">{m.capacityPct}%</span></div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${m.capacityPct > 100 ? 'bg-red-500' : m.capacityPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(m.capacityPct, 100)}%` }} /></div>
                  </div>
                  <div className="text-center"><p className="font-bold">{m.avgHealth}</p><p className="text-[10px] text-gray-400">Avg Health</p></div>
                  {m.atRiskClients > 0 && <Badge className="bg-red-50 text-red-700 text-[10px]"><AlertCircle className="h-3 w-3 mr-1" />{m.atRiskClients} at-risk</Badge>}
                  <Badge variant={m.status === 'active' ? 'success' : 'secondary'}>{m.status}</Badge>
                </div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
