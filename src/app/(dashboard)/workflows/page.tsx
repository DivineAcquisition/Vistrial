/**
 * Workflows Page
 *
 * Server component that fetches real workflows from Supabase.
 * Displays workflow cards with stats, status badges, and CTAs.
 */

import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import {
  RiFlowChart,
  RiAddLine,
  RiMagicLine,
  RiGroupLine,
  RiMessage2Line,
  RiArrowRightSLine,
} from '@remixicon/react';
import type { Workflow, WorkflowStatus } from '@/types/database';

export const metadata: Metadata = {
  title: 'Workflows',
};

export const dynamic = 'force-dynamic';

const STATUS_BADGE_STYLES: Record<WorkflowStatus, string> = {
  active: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20',
  paused: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
  draft: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/20',
  archived: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const status = (workflow.status || 'draft') as WorkflowStatus;
  const badgeStyle = STATUS_BADGE_STYLES[status] ?? STATUS_BADGE_STYLES.draft;

  return (
    <Link
      href={`/workflows/${workflow.id}`}
      className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
          <RiFlowChart className="w-6 h-6" />
        </div>
        <span
          className={`px-2.5 py-1 text-xs font-medium rounded-full ${badgeStyle}`}
        >
          {status}
        </span>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2">{workflow.name}</h3>

      <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
        <span className="flex items-center gap-1">
          <RiGroupLine className="w-4 h-4" />
          {workflow.total_enrolled ?? 0} enrolled
        </span>
        <span className="flex items-center gap-1">
          <RiMessage2Line className="w-4 h-4" />
          {workflow.total_responses ?? 0} responses
        </span>
      </div>

      <p className="text-gray-400 text-sm mb-4">
        Created {formatDate(workflow.created_at)}
      </p>

      <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
        <span className="text-brand-600 text-sm font-medium group-hover:text-brand-700 transition-colors flex items-center gap-1">
          View workflow
          <RiArrowRightSLine className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </Link>
  );
}

export default async function WorkflowsPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const supabase = await getSupabaseServerClient();
  const orgId = (context.organization as { id: string }).id;

  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, name, status, total_enrolled, total_responses, created_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch workflows:', error);
  }

  const workflowList = (workflows ?? []) as Workflow[];

  const stats = {
    total: workflowList.length,
    active: workflowList.filter((w) => w.status === 'active').length,
    totalEnrolled: workflowList.reduce((sum, w) => sum + (w.total_enrolled ?? 0), 0),
    totalResponses: workflowList.reduce((sum, w) => sum + (w.total_responses ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-gray-500 mt-1">
            Automate your lead reactivation with SMS and voice workflows
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/workflows/generate"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <RiMagicLine className="w-5 h-5" />
            AI Generate
          </Link>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition-colors"
          >
            <RiAddLine className="w-5 h-5" />
            Create Workflow
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiFlowChart className="w-4 h-4" />
            <span className="text-sm">Total Workflows</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <RiFlowChart className="w-4 h-4" />
            <span className="text-sm">Active</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiGroupLine className="w-4 h-4" />
            <span className="text-sm">Total Enrolled</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalEnrolled}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiMessage2Line className="w-4 h-4" />
            <span className="text-sm">Total Responses</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalResponses}</p>
        </div>
      </div>

      {/* Workflow list or empty state */}
      {workflowList.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
            <RiFlowChart className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2 font-medium">No workflows yet</p>
          <p className="text-gray-500 text-sm mb-6">
            Create your first workflow to start automating lead reactivation
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/workflows/generate"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              <RiMagicLine className="w-5 h-5" />
              AI Generate
            </Link>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition-colors"
            >
              <RiAddLine className="w-5 h-5" />
              Create Workflow
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowList.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}
    </div>
  );
}
