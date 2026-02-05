import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  RiContactsLine,
  RiFlowChart,
  RiBarChartLine,
  RiArrowRightLine,
  RiAddLine,
  RiMessageLine,
  RiTimeLine,
  RiSparklingLine,
} from '@remixicon/react';

export const metadata: Metadata = {
  title: 'Dashboard | Vistrial',
};

export const dynamic = 'force-dynamic';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const supabase = await getSupabaseServerClient();
  const { organization, user } = context;

  // Get quick stats
  const [
    { count: contactCount },
    { count: workflowCount },
    { count: activeWorkflows },
    { count: messagesToday },
  ] = await Promise.all([
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .is('deleted_at', null),
    supabase
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .is('deleted_at', null),
    supabase
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .eq('status', 'active')
      .is('deleted_at', null),
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .gte('created_at', new Date().toISOString().split('T')[0]),
  ]);

  // Get recent workflows
  const { data: recentWorkflows } = await supabase
    .from('workflows')
    .select('id, name, status, total_enrolled, total_responses')
    .eq('organization_id', organization.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5) as { data: { id: string; name: string; status: string; total_enrolled: number | null; total_responses: number | null }[] | null };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-purple-600 p-6 md:p-8 text-white">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RiSparklingLine className="w-5 h-5 animate-pulse" />
                <span className="text-sm font-medium text-white/80">
                  {getGreeting()}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">
                Welcome back, {firstName}!
              </h1>
              <p className="text-white/70 max-w-lg">
                You have{' '}
                <span className="text-white font-semibold">
                  {activeWorkflows || 0} active workflows
                </span>{' '}
                reaching{' '}
                <span className="text-white font-semibold">
                  {contactCount || 0} contacts
                </span>
                .
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/workflows/new"
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-violet-600 rounded-xl font-medium hover:bg-white/90 shadow-xl shadow-black/10 transition-all"
              >
                <RiAddLine className="w-5 h-5" />
                New Workflow
              </Link>
              <Link
                href="/contacts"
                className="flex items-center gap-2 px-4 py-2.5 text-white border border-white/20 rounded-xl font-medium hover:bg-white/10 transition-all"
              >
                <RiContactsLine className="w-5 h-5" />
                Contacts
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/contacts"
          className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 hover:border-violet-500/30 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-colors">
              <RiContactsLine className="w-5 h-5" />
            </div>
            <RiArrowRightLine className="w-4 h-4 text-gray-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {contactCount || 0}
          </div>
          <p className="text-sm text-gray-500">Total Contacts</p>
        </Link>

        <Link
          href="/workflows"
          className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 hover:border-blue-500/30 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <RiFlowChart className="w-5 h-5" />
            </div>
            <RiArrowRightLine className="w-4 h-4 text-gray-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {workflowCount || 0}
          </div>
          <p className="text-sm text-gray-500">Workflows</p>
        </Link>

        <div className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-green-500/10 text-green-400">
              <RiFlowChart className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {activeWorkflows || 0}
          </div>
          <p className="text-sm text-gray-500">Active Workflows</p>
        </div>

        <div className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
              <RiMessageLine className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {messagesToday || 0}
          </div>
          <p className="text-sm text-gray-500">Messages Today</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/workflows/new"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-violet-500/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-colors">
              <RiAddLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">New Workflow</p>
              <p className="text-xs text-gray-500">Create automation</p>
            </div>
          </div>
        </Link>

        <Link
          href="/contacts/upload"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-blue-500/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <RiContactsLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Import Contacts</p>
              <p className="text-xs text-gray-500">Upload CSV</p>
            </div>
          </div>
        </Link>

        <Link
          href="/analytics"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-green-500/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <RiBarChartLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Analytics</p>
              <p className="text-xs text-gray-500">View reports</p>
            </div>
          </div>
        </Link>

        <Link
          href="/settings"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-purple-500/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
              <RiTimeLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Settings</p>
              <p className="text-xs text-gray-500">Configure</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Workflows */}
      <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Workflows</h2>
          <Link
            href="/workflows"
            className="text-sm text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1 transition-colors"
          >
            View all
            <RiArrowRightLine className="w-4 h-4" />
          </Link>
        </div>

        {recentWorkflows && recentWorkflows.length > 0 ? (
          <div className="divide-y divide-white/5">
            {recentWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="block p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                      <RiFlowChart className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{workflow.name}</p>
                      <p className="text-sm text-gray-500">
                        {workflow.total_enrolled || 0} enrolled ·{' '}
                        {workflow.total_responses || 0} responses
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      workflow.status === 'active'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : workflow.status === 'paused'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-white/10 text-gray-400 border border-white/10'
                    }`}
                  >
                    {workflow.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
              <RiFlowChart className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No workflows yet</p>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              Create your first workflow
              <RiArrowRightLine className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
