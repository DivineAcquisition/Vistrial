// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { generateWeeklyBrief, formatWeeklyBriefText } from '@/lib/agent/reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, RefreshCw } from 'lucide-react';

export const metadata: Metadata = { title: 'Reports | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const orgId = (context.organization as any).id;

  const brief = await generateWeeklyBrief(orgId);
  const briefText = brief ? formatWeeklyBriefText(brief) : null;

  return (
    <div className="space-y-6 dashboard-page">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Reports</h1><p className="text-gray-500 text-sm mt-1">Automated operations reports</p></div>
      </div>

      {brief ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-600" />Weekly Operations Brief</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4 mb-6 stagger-fade-in">
              <div className="p-4 bg-gray-50 rounded-xl text-center"><p className="text-2xl font-bold">{brief.totalClients}</p><p className="text-xs text-gray-500">Total Clients</p></div>
              <div className="p-4 bg-gray-50 rounded-xl text-center"><p className="text-2xl font-bold">{brief.avgHealth}/100</p><p className="text-xs text-gray-500">Avg Health</p></div>
              <div className="p-4 bg-gray-50 rounded-xl text-center">
                <div className="flex justify-center gap-2 text-sm">
                  <span className="text-emerald-600">🟢{brief.healthDistribution.green}</span>
                  <span className="text-amber-600">🟡{brief.healthDistribution.yellow}</span>
                  <span className="text-orange-600">🟠{brief.healthDistribution.orange}</span>
                  <span className="text-red-600">🔴{brief.healthDistribution.red}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Distribution</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl text-center"><p className="text-2xl font-bold">${brief.mrr.toLocaleString()}</p><p className="text-xs text-gray-500">MRR</p></div>
            </div>

            {brief.needsAttention.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-3">Needs Attention</h3>
                <div className="space-y-2">{brief.needsAttention.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80">
                    <span className="text-sm font-medium">{c.name}</span>
                    <div className="flex items-center gap-2"><span className="text-sm">{c.score}/100</span><span className="text-xs text-gray-400">({c.trend})</span><span className="text-xs text-gray-400">{c.reason}</span></div>
                  </div>
                ))}</div>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl"><p className="text-sm font-medium mb-1">Due This Week</p><p className="text-2xl font-bold">{brief.deliverablesDue}</p></div>
              <div className="p-4 bg-gray-50 rounded-xl"><p className="text-sm font-medium mb-1">Overdue</p><p className="text-2xl font-bold text-red-600">{brief.overdueCount}</p></div>
              <div className="p-4 bg-gray-50 rounded-xl"><p className="text-sm font-medium mb-1">Completed Last Week</p><p className="text-2xl font-bold text-emerald-600">{brief.completedLastWeek}</p></div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="pt-6 text-center py-12"><p className="text-gray-400">No data to generate a report yet. Add clients and interactions to get started.</p></CardContent></Card>
      )}
    </div>
  );
}
