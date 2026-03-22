// @ts-nocheck
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Phone, Mail, Calendar, DollarSign, FileText, MessageSquare, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

export const metadata: Metadata = { title: 'Client Detail | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const orgId = (context.organization as any).id;

  const { data: client, error } = await admin.from('clients').select('*, team_members(full_name, email)').eq('id', params.id).eq('org_id', orgId).single();
  if (error || !client) notFound();

  const [{ data: contacts }, { data: projects }, { data: interactions }, { data: invoices }, { data: healthHistory }, { data: drafts }] = await Promise.all([
    admin.from('client_contacts').select('*').eq('client_id', client.id).order('is_primary', { ascending: false }),
    admin.from('projects').select('*').eq('client_id', client.id).order('due_date'),
    admin.from('interactions').select('*').eq('client_id', client.id).order('interaction_date', { ascending: false }).limit(10),
    admin.from('invoices').select('*').eq('client_id', client.id).order('issue_date', { ascending: false }),
    admin.from('health_score_history').select('*').eq('client_id', client.id).order('score_date', { ascending: false }).limit(30),
    admin.from('agent_drafts').select('*').eq('client_id', client.id).eq('status', 'pending').order('created_at', { ascending: false }),
  ]);

  const warningColors: Record<string, string> = { none: 'bg-emerald-50 text-emerald-700', soft: 'bg-amber-50 text-amber-700', active: 'bg-orange-50 text-orange-700', critical: 'bg-red-50 text-red-700' };
  const daysToRenewal = client.contract_end_date ? Math.floor((new Date(client.contract_end_date).getTime() - Date.now()) / 86400000) : null;
  const overdueProjects = (projects || []).filter(p => p.due_date && new Date(p.due_date) < new Date() && !['complete', 'cancelled'].includes(p.status));
  const totalLTV = (invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <div className="space-y-6 dashboard-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-3"><h1 className="text-2xl font-bold tracking-tight">{client.company_name}</h1><Badge className={warningColors[client.warning_level] || ''}>{client.warning_level}</Badge></div>
            <p className="text-sm text-gray-500">{client.industry || 'Service Business'} · {client.client_type || 'Retainer'} · Assigned to {client.team_members?.full_name || 'Unassigned'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><MessageSquare className="h-4 w-4 mr-2" />Draft Message</Button>
          <Button variant="gradient"><Phone className="h-4 w-4 mr-2" />Contact</Button>
        </div>
      </div>

      {/* Health + Key Metrics */}
      <div className="grid grid-cols-5 gap-4 stagger-fade-in">
        <Card className={client.health_score < 40 ? 'border-red-200 bg-red-50/30' : client.health_score < 60 ? 'border-amber-200 bg-amber-50/30' : ''}>
          <CardContent className="pt-6 text-center"><p className="text-4xl font-bold">{client.health_score || 50}</p><p className="text-xs text-gray-500">Health Score</p><p className="text-[10px] text-gray-400 mt-1">{client.health_trend || 'stable'}</p></CardContent>
        </Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">${client.monthly_value || '0'}</p><p className="text-xs text-gray-500">Monthly Value</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">${totalLTV.toLocaleString()}</p><p className="text-xs text-gray-500">Total LTV</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{daysToRenewal !== null ? `${daysToRenewal}d` : '—'}</p><p className="text-xs text-gray-500">To Renewal</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{overdueProjects.length}</p><p className="text-xs text-gray-500">Overdue</p></CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pending Drafts */}
          {drafts && drafts.length > 0 && (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-600" />Pending Drafts ({drafts.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">{drafts.map(d => (
                <div key={d.id} className="p-3 rounded-xl bg-white border border-brand-100">
                  <p className="text-xs font-medium text-brand-600 mb-1">{d.draft_type?.replace('_', ' ')}</p>
                  <p className="text-sm text-gray-700">{d.body?.slice(0, 200)}...</p>
                  <div className="flex gap-2 mt-2"><Button size="sm" variant="gradient">Approve & Send</Button><Button size="sm" variant="outline">Edit</Button></div>
                </div>
              ))}</CardContent>
            </Card>
          )}

          {/* Recent Interactions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Interactions</CardTitle></CardHeader>
            <CardContent>
              {(!interactions || interactions.length === 0) ? <p className="text-gray-400 text-sm text-center py-6">No interactions yet</p> : (
                <div className="space-y-3">{interactions.map(int => (
                  <div key={int.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100 shrink-0 mt-0.5">
                      {int.direction === 'inbound' ? <Mail className="h-3.5 w-3.5 text-blue-500" /> : <MessageSquare className="h-3.5 w-3.5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-sm font-medium">{int.type?.replace('_', ' ')}</p>{int.sentiment && <Badge className="text-[9px]" variant={int.sentiment === 'positive' || int.sentiment === 'enthusiastic' ? 'success' : int.sentiment === 'frustrated' || int.sentiment === 'angry' ? 'destructive' : 'secondary'}>{int.sentiment}</Badge>}{int.was_automated && <Badge variant="outline" className="text-[9px]">Auto</Badge>}</div>
                      <p className="text-xs text-gray-500 truncate">{int.summary || int.subject || '—'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{new Date(int.interaction_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>

          {/* Projects */}
          <Card>
            <CardHeader><CardTitle className="text-base">Projects & Deliverables</CardTitle></CardHeader>
            <CardContent>
              {(!projects || projects.length === 0) ? <p className="text-gray-400 text-sm text-center py-6">No projects</p> : (
                <div className="space-y-2">{projects.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80">
                    <div><p className="text-sm font-medium">{p.project_name}</p><p className="text-[10px] text-gray-400">{p.deliverable_type || 'Project'} · Due {p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'}</p></div>
                    <Badge variant={p.status === 'complete' ? 'success' : p.due_date && new Date(p.due_date) < new Date() && p.status !== 'complete' ? 'destructive' : 'secondary'}>{p.status?.replace('_', ' ')}</Badge>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Contacts</CardTitle></CardHeader><CardContent>
            {(!contacts || contacts.length === 0) ? <p className="text-gray-400 text-sm">No contacts</p> : contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-xs font-bold text-brand-600">{c.full_name?.[0]}</div>
                <div><p className="text-sm font-medium">{c.full_name}{c.is_primary && <span className="text-[9px] text-brand-600 ml-1">Primary</span>}</p><p className="text-[10px] text-gray-400">{c.role?.replace('_', ' ')} · {c.email}</p></div>
              </div>
            ))}
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Start Date</span><span>{client.start_date ? new Date(client.start_date).toLocaleDateString() : '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Contract End</span><span>{client.contract_end_date ? new Date(client.contract_end_date).toLocaleDateString() : '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Renewal Status</span><span>{client.renewal_status || 'not_yet'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Check-in Cadence</span><span>{client.check_in_cadence?.replace('_', ' ') || 'bi-weekly'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">NPS</span><span>{client.nps_score || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Comm Style</span><span>{client.communication_style || 'direct'}</span></div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader><CardContent>
            {(!invoices || invoices.length === 0) ? <p className="text-gray-400 text-sm">No invoices</p> : invoices.slice(0, 5).map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <div><p className="font-medium">${inv.amount}</p><p className="text-[10px] text-gray-400">{inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : ''}</p></div>
                <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'destructive' : 'secondary'}>{inv.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
