// @ts-nocheck
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ArrowRight, AlertCircle, Users, TrendingUp, TrendingDown } from 'lucide-react';

export const metadata: Metadata = { title: 'Clients | Vistrial' };
export const dynamic = 'force-dynamic';

const warningColors: Record<string, string> = { none: 'bg-emerald-50 text-emerald-700', soft: 'bg-amber-50 text-amber-700', active: 'bg-orange-50 text-orange-700', critical: 'bg-red-50 text-red-700' };
const statusColors: Record<string, string> = { onboarding: 'bg-blue-50 text-blue-700', active: 'bg-emerald-50 text-emerald-700', at_risk: 'bg-red-50 text-red-700', pre_renewal: 'bg-purple-50 text-purple-700', renewed: 'bg-emerald-50 text-emerald-700', paused: 'bg-gray-100 text-gray-600', churned: 'bg-red-100 text-red-700' };

export default async function ClientsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const orgId = (context.organization as any).id;

  const { data: clients } = await admin.from('clients').select('*, team_members(full_name)').eq('org_id', orgId).order('health_score', { ascending: true });

  const all = clients || [];
  const avgHealth = all.length > 0 ? Math.round(all.reduce((s, c) => s + (c.health_score || 50), 0) / all.length) : 0;
  const atRisk = all.filter(c => c.warning_level && c.warning_level !== 'none').length;
  const mrr = all.filter(c => c.status === 'active').reduce((s, c) => s + (parseFloat(c.monthly_value) || 0), 0);

  return (
    <div className="space-y-6 dashboard-page">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Clients</h1><p className="text-gray-500 text-sm mt-1">Monitor health scores and manage client relationships</p></div>
        <Button variant="gradient"><Plus className="h-4 w-4 mr-2" />Add Client</Button>
      </div>

      <div className="grid grid-cols-4 gap-4 stagger-fade-in">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-brand-600" /><div><p className="text-2xl font-bold">{all.length}</p><p className="text-xs text-gray-500">Total Clients</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-emerald-600" /><div><p className="text-2xl font-bold">{avgHealth}/100</p><p className="text-xs text-gray-500">Avg Health</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertCircle className="h-8 w-8 text-red-500" /><div><p className="text-2xl font-bold">{atRisk}</p><p className="text-xs text-gray-500">At Risk</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-emerald-600" /><div><p className="text-2xl font-bold">${mrr.toLocaleString()}</p><p className="text-xs text-gray-500">MRR</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Clients</CardTitle></CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-400 mb-4">No clients yet</p><Button variant="gradient"><Plus className="h-4 w-4 mr-2" />Add Your First Client</Button></div>
          ) : (
            <div className="space-y-2">
              {all.map(client => (
                <Link key={client.id} href={`/clients/${client.id}`} className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 hover:border-gray-300 hover:shadow-soft transition-all duration-200 group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-sm text-gray-600">{(client.health_score || 50)}</div>
                    <div>
                      <p className="font-semibold text-sm group-hover:text-brand-600 transition-colors">{client.company_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`text-[10px] ${statusColors[client.status] || ''}`}>{client.status?.replace('_', ' ')}</Badge>
                        {client.warning_level !== 'none' && <Badge className={`text-[10px] ${warningColors[client.warning_level] || ''}`}>{client.warning_level}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right hidden md:block"><p className="text-gray-400 text-[10px]">Monthly Value</p><p className="font-medium">${client.monthly_value || '—'}</p></div>
                    <div className="text-right hidden md:block"><p className="text-gray-400 text-[10px]">Assigned</p><p className="font-medium">{client.team_members?.full_name || '—'}</p></div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">{client.health_trend === 'improving' ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : client.health_trend === 'declining' ? <TrendingDown className="h-3 w-3 text-red-500" /> : null}{client.health_trend}</div>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
