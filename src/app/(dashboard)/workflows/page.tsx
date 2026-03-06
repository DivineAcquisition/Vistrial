/**
 * Workflows Page
 * 
 * This page displays all reactivation workflows:
 * - Grid/list view of available workflow templates
 * - Active workflow status and statistics
 * - Create new workflow button
 * - Quick actions: activate, pause, edit, duplicate, delete
 * - Filter by status (active, paused, draft)
 * - Sort by name, created date, enrollment count
 */

import Link from "next/link";
import { 
  RiFlowChart,
  RiAddLine,
  RiPlayLine,
  RiGroupLine,
  RiMessage2Line,
  RiPhoneLine,
  RiMoreLine,
  RiArrowRightSLine,
} from "@remixicon/react";

export const dynamic = "force-dynamic";

// Placeholder workflow templates
const workflowTemplates = [
  {
    id: "reactivation-sms",
    name: "SMS Reactivation",
    description: "Re-engage dormant leads with a personalized SMS sequence",
    icon: RiMessage2Line,
    color: "brand",
    steps: 5,
    defaultDelay: "3 days",
  },
  {
    id: "reactivation-voice",
    name: "Voice Reactivation",
    description: "Automated voice calls to reconnect with past customers",
    icon: RiPhoneLine,
    color: "blue",
    steps: 3,
    defaultDelay: "7 days",
  },
  {
    id: "reactivation-combo",
    name: "Multi-Channel Reactivation",
    description: "Combine SMS and voice for maximum engagement",
    icon: RiFlowChart,
    color: "amber",
    steps: 7,
    defaultDelay: "5 days",
  },
];

function WorkflowCard({ workflow }: { workflow: typeof workflowTemplates[0] }) {
  const Icon = workflow.icon;
  const colorClasses = {
    brand: "bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10",
    blue: "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-600/10",
    amber: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/10",
  };

  return (
    <Link
      href={`/workflows/${workflow.id}`}
      className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[workflow.color as keyof typeof colorClasses]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <button 
          onClick={(e) => e.preventDefault()}
          className="p-2 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-gray-100"
        >
          <RiMoreLine className="w-5 h-5" />
        </button>
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{workflow.name}</h3>
      <p className="text-gray-500 text-sm mb-4">{workflow.description}</p>
      
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>{workflow.steps} steps</span>
        <span>•</span>
        <span>{workflow.defaultDelay} between steps</span>
      </div>
      
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
        <span className="text-brand-600 text-sm font-medium group-hover:text-brand-700 transition-colors flex items-center gap-1">
          Configure workflow
          <RiArrowRightSLine className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </Link>
  );
}

export default async function WorkflowsPage() {
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
        <Link 
          href="/workflows/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg font-medium shadow-sm shadow-brand-600/20 hover:bg-brand-700 transition-colors"
        >
          <RiAddLine className="w-5 h-5" />
          Create Workflow
        </Link>
      </div>

      {/* Active Workflows Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Active Workflows</h2>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20 rounded-full">
              0 active
            </span>
          </div>
        </div>
        
        {/* Empty State */}
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
            <RiFlowChart className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">No active workflows</p>
          <p className="text-gray-500 text-sm">
            Choose a template below to get started
          </p>
        </div>
      </div>

      {/* Workflow Templates */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Workflow Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowTemplates.map((template) => (
            <WorkflowCard key={template.id} workflow={template} />
          ))}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiGroupLine className="w-4 h-4" />
            <span className="text-sm">Total Enrolled</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiMessage2Line className="w-4 h-4" />
            <span className="text-sm">SMS Sent</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiPhoneLine className="w-4 h-4" />
            <span className="text-sm">Calls Made</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <RiPlayLine className="w-4 h-4" />
            <span className="text-sm">Response Rate</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">0%</p>
        </div>
      </div>
    </div>
  );
}
