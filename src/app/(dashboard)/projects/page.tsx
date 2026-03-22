// @ts-nocheck
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export const metadata: Metadata = { title: 'Projects | Vistrial' };
export const dynamic = 'force-dynamic';

const statusColors: Record<string, string> = { not_started: 'bg-gray-100 text-gray-600', in_progress: 'bg-blue-50 text-blue-700', in_review: 'bg-purple-50 text-purple-700', revision: 'bg-amber-50 text-amber-700', complete: 'bg-emerald-50 text-emerald-700', on_hold: 'bg-gray-100 text-gray-600', cancelled: 'bg-red-50 text-red-700' };

export default async function ProjectsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const orgId = (context.organization as any).id;

  const { data: projects } = await admin.from('projects').select('*, clients(company_name), team_members(full_name)').eq('org_id', orgId).order('due_date');
  const all = projects || [];
  const today = new Date().toISOString().split('T')[0];
  const overdue = all.filter(p => p.due_date && p.due_date < today && !['complete', 'cancelled'].includes(p.status));
  const active = all.filter(p => ['in_progress', 'in_review', 'revision'].includes(p.status));
  const completed = all.filter(p => p.status === 'complete');

  return (
    <div className="space-y-6 dashboard-page">
      <div><h1 className="text-2xl font-bold tracking-tight">Projects & Deliverables</h1><p className="text-gray-500 text-sm mt-1">Track fulfillment across all clients</p></div>

      <div className="grid grid-cols-4 gap-4 stagger-fade-in">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="h-8 w-8 text-brand-600" /><div><p className="text-2xl font-bold">{all.length}</p><p className="text-xs text-gray-500">Total</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-blue-600" /><div><p className="text-2xl font-bold">{active.length}</p><p className="text-xs text-gray-500">Active</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertCircle className="h-8 w-8 text-red-500" /><div><p className="text-2xl font-bold">{overdue.length}</p><p className="text-xs text-gray-500">Overdue</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-emerald-600" /><div><p className="text-2xl font-bold">{completed.length}</p><p className="text-xs text-gray-500">Completed</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Projects</CardTitle></CardHeader>
        <CardContent>
          {all.length === 0 ? <p className="text-gray-400 text-sm text-center py-12">No projects yet</p> : (
            <div className="space-y-2">{all.map(p => {
              const isOverdue = p.due_date && p.due_date < today && !['complete', 'cancelled'].includes(p.status);
              return (
                <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200/80 hover:border-gray-300 hover:shadow-soft'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOverdue ? 'bg-red-100' : 'bg-gray-100'}`}><FileText className={`h-5 w-5 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`} /></div>
                    <div><p className="font-semibold text-sm">{p.project_name}</p><p className="text-[10px] text-gray-400">{p.clients?.company_name || '—'} · {p.team_members?.full_name || 'Unassigned'} · Due {p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOverdue && <Badge className="bg-red-100 text-red-700 text-[10px]">OVERDUE</Badge>}
                    <Badge className={`text-[10px] ${statusColors[p.status] || ''}`}>{p.status?.replace('_', ' ')}</Badge>
                  </div>
                </div>
              );
            })}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
