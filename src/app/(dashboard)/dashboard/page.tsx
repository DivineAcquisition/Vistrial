import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  RiContactsLine,
  RiFlowChart,
  RiBarChartBoxLine,
  RiArrowRightSLine,
  RiAddLine,
  RiMessage2Line,
  RiSettings4Line,
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
      <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg shadow-brand-600/20 md:p-8">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <RiSparklingLine className="h-5 w-5 animate-pulse" />
                <span className="text-sm font-medium text-white/80">
                  {getGreeting()}
                </span>
              </div>
              <h1 className="mb-2 text-2xl font-bold md:text-3xl">
                Welcome back, {firstName}!
              </h1>
              <p className="max-w-lg text-white/70">
                You have{' '}
                <span className="font-semibold text-white">
                  {activeWorkflows || 0} active workflows
                </span>{' '}
                reaching{' '}
                <span className="font-semibold text-white">
                  {contactCount || 0} contacts
                </span>
                .
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/workflows/new"
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium text-brand-600 shadow-xl shadow-black/10 transition-all hover:bg-white/90"
              >
                <RiAddLine className="h-5 w-5" />
                New Workflow
              </Link>
              <Link
                href="/contacts"
                className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 font-medium text-white transition-all hover:bg-white/10"
              >
                <RiContactsLine className="h-5 w-5" />
                Contacts
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link
          href="/contacts"
          className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-colors group-hover:bg-brand-600 group-hover:text-white group-hover:ring-0">
              <RiContactsLine className="h-5 w-5" />
            </div>
            <RiArrowRightSLine className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {contactCount || 0}
          </div>
          <p className="text-sm text-gray-500">Total Contacts</p>
        </Link>

        <Link
          href="/workflows"
          className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-colors group-hover:bg-brand-600 group-hover:text-white group-hover:ring-0">
              <RiFlowChart className="h-5 w-5" />
            </div>
            <RiArrowRightSLine className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {workflowCount || 0}
          </div>
          <p className="text-sm text-gray-500">Workflows</p>
        </Link>

        <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600 ring-1 ring-inset ring-green-600/10">
              <RiFlowChart className="h-5 w-5" />
            </div>
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {activeWorkflows || 0}
          </div>
          <p className="text-sm text-gray-500">Active Workflows</p>
        </div>

        <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/10">
              <RiMessage2Line className="h-5 w-5" />
            </div>
          </div>
          <div className="mb-1 text-3xl font-bold text-gray-900">
            {messagesToday || 0}
          </div>
          <p className="text-sm text-gray-500">Messages Today</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link
          href="/workflows/new"
          className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-colors group-hover:bg-brand-600 group-hover:text-white group-hover:ring-0">
            <RiAddLine className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">New Workflow</p>
            <p className="text-xs text-gray-500">Create automation</p>
          </div>
        </Link>

        <Link
          href="/contacts/upload"
          className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-colors group-hover:bg-brand-600 group-hover:text-white group-hover:ring-0">
            <RiContactsLine className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Import Contacts</p>
            <p className="text-xs text-gray-500">Upload CSV</p>
          </div>
        </Link>

        <Link
          href="/analytics"
          className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600 ring-1 ring-inset ring-green-600/10 transition-colors group-hover:bg-green-600 group-hover:text-white group-hover:ring-0">
            <RiBarChartBoxLine className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Analytics</p>
            <p className="text-xs text-gray-500">View reports</p>
          </div>
        </Link>

        <Link
          href="/settings"
          className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-900/5 transition-colors group-hover:bg-gray-900 group-hover:text-white group-hover:ring-0">
            <RiSettings4Line className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Settings</p>
            <p className="text-xs text-gray-500">Configure</p>
          </div>
        </Link>
      </div>

      {/* Recent Workflows */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Workflows</h2>
          <Link
            href="/workflows"
            className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
          >
            View all
            <RiArrowRightSLine className="h-4 w-4" />
          </Link>
        </div>

        {recentWorkflows && recentWorkflows.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="block px-6 py-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                      <RiFlowChart className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{workflow.name}</p>
                      <p className="text-sm text-gray-500">
                        {workflow.total_enrolled || 0} enrolled ·{' '}
                        {workflow.total_responses || 0} responses
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      workflow.status === 'active'
                        ? 'bg-green-50 text-green-700 ring-green-600/20'
                        : workflow.status === 'paused'
                        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                        : 'bg-gray-50 text-gray-600 ring-gray-500/20'
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
              <RiFlowChart className="h-8 w-8 text-gray-400" />
            </div>
            <p className="mb-4 text-gray-500">No workflows yet</p>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Create your first workflow
              <RiArrowRightSLine className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
