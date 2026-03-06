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
  RiSparklingLine,
  RiArrowUpLine,
  RiUploadLine,
  RiSettings4Line,
  RiTimeLine,
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

  const firstName = user?.user_metadata?.first_name || user?.user_metadata?.full_name?.split(' ')[0] || 'there';

  const stats = [
    {
      label: 'Total Contacts',
      value: contactCount || 0,
      href: '/contacts',
      icon: RiContactsLine,
      color: 'brand',
      bgColor: 'bg-brand-50',
      iconColor: 'text-brand-600',
      borderHover: 'hover:border-brand-200',
    },
    {
      label: 'Workflows',
      value: workflowCount || 0,
      href: '/workflows',
      icon: RiFlowChart,
      color: 'blue',
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      borderHover: 'hover:border-blue-200',
    },
    {
      label: 'Active Workflows',
      value: activeWorkflows || 0,
      icon: RiTimeLine,
      color: 'emerald',
      bgColor: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      borderHover: 'hover:border-emerald-200',
    },
    {
      label: 'Messages Today',
      value: messagesToday || 0,
      icon: RiMessageLine,
      color: 'amber',
      bgColor: 'bg-amber-50',
      iconColor: 'text-amber-600',
      borderHover: 'hover:border-amber-200',
    },
  ];

  return (
    <div className="space-y-8 dashboard-page">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-7 md:p-8 text-white shadow-[0_8px_40px_rgba(83,71,209,0.25)]">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/[0.08] rounded-full blur-3xl animate-float" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-brand-400/20 rounded-full blur-3xl animate-float-delayed" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-300/[0.05] rounded-full blur-3xl" />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.05%22%20stroke-width%3D%221%22%3E%3Cpath%20d%3D%22M0%2020h40M20%200v40%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-60" />

        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 text-[13px] font-medium text-white/90 ring-1 ring-white/10">
                  <RiSparklingLine className="w-3.5 h-3.5 animate-pulse-soft" />
                  {getGreeting()}
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight">
                Welcome back, {firstName}!
              </h1>
              <p className="text-white/60 text-[15px] max-w-lg leading-relaxed">
                You have{' '}
                <span className="text-white font-semibold">
                  {activeWorkflows || 0} active workflow{(activeWorkflows || 0) !== 1 ? 's' : ''}
                </span>{' '}
                reaching{' '}
                <span className="text-white font-semibold">
                  {contactCount || 0} contact{(contactCount || 0) !== 1 ? 's' : ''}
                </span>
                .
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/workflows/new"
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-brand-600 rounded-xl font-semibold text-sm hover:bg-white/90 shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-all duration-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 active:translate-y-0"
              >
                <RiAddLine className="w-4 h-4" />
                New Workflow
              </Link>
              <Link
                href="/contacts"
                className="flex items-center gap-2 px-5 py-2.5 text-white/90 border border-white/20 rounded-xl font-medium text-sm hover:bg-white/10 hover:border-white/30 transition-all duration-200 backdrop-blur-sm"
              >
                <RiContactsLine className="w-4 h-4" />
                Contacts
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-fade-in">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`group relative bg-white rounded-2xl border border-gray-200/80 p-5 transition-all duration-300 hover:shadow-soft-lg hover:-translate-y-0.5 ${stat.borderHover}`}
          >
            {stat.href ? (
              <Link href={stat.href} className="absolute inset-0 rounded-2xl" />
            ) : null}

            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${stat.bgColor} transition-all duration-300 group-hover:scale-105`}>
                <stat.icon className={`w-[18px] h-[18px] ${stat.iconColor}`} />
              </div>
              {stat.href && (
                <RiArrowRightLine className="w-4 h-4 text-gray-300 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all duration-200" />
              )}
            </div>
            <div className="metric-value text-2xl mb-0.5">
              {stat.value.toLocaleString()}
            </div>
            <p className="metric-label text-[13px]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-fade-in">
        {[
          { href: '/workflows/new', icon: RiSparklingLine, label: 'New Workflow', desc: 'Create automation', color: 'brand' },
          { href: '/contacts/upload', icon: RiUploadLine, label: 'Import Contacts', desc: 'Upload CSV', color: 'blue' },
          { href: '/analytics', icon: RiBarChartLine, label: 'Analytics', desc: 'View reports', color: 'emerald' },
          { href: '/settings', icon: RiSettings4Line, label: 'Settings', desc: 'Configure', color: 'gray' },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group relative bg-white rounded-2xl border border-gray-200/80 p-4 transition-all duration-300 hover:shadow-soft-lg hover:-translate-y-0.5 hover:border-gray-300/80"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-all duration-300 group-hover:scale-105 ${
                action.color === 'brand' ? 'bg-brand-50 text-brand-600 group-hover:bg-brand-100' :
                action.color === 'blue' ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-100' :
                action.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100' :
                'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
              }`}>
                <action.icon className="w-[18px] h-[18px]" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm tracking-[-0.01em]">{action.label}</p>
                <p className="text-[12px] text-gray-400">{action.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Workflows */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-soft overflow-hidden">
        {/* Gradient top line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />

        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 tracking-tight">Recent Workflows</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">Your latest automation sequences</p>
          </div>
          <Link
            href="/workflows"
            className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 transition-colors"
          >
            View all
            <RiArrowRightLine className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentWorkflows && recentWorkflows.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {recentWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="group block p-4 hover:bg-gray-50/50 transition-colors duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 group-hover:border-brand-100 group-hover:bg-brand-50/50 transition-all duration-200">
                      <RiFlowChart className="w-[18px] h-[18px] text-gray-400 group-hover:text-brand-500 transition-colors" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm tracking-[-0.01em] group-hover:text-brand-700 transition-colors">{workflow.name}</p>
                      <p className="text-[12px] text-gray-400 mt-0.5 tabular-nums">
                        {workflow.total_enrolled || 0} enrolled · {workflow.total_responses || 0} responses
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg ${
                      workflow.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15'
                        : workflow.status === 'paused'
                        ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15'
                        : 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200/60'
                    }`}
                  >
                    {workflow.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
              <RiFlowChart className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm mb-1 font-medium">No workflows yet</p>
            <p className="text-gray-400 text-[13px] mb-5">Create your first automation to get started</p>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-semibold transition-colors"
            >
              <RiAddLine className="w-4 h-4" />
              Create your first workflow
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
