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
  Workflow, 
  Plus, 
  Play, 
  Users, 
  MessageSquare,
  Phone,
  MoreHorizontal,
  ArrowRight
} from "lucide-react";

export const dynamic = "force-dynamic";

// Placeholder workflow templates
const workflowTemplates = [
  {
    id: "reactivation-sms",
    name: "SMS Reactivation",
    description: "Re-engage dormant leads with a personalized SMS sequence",
    icon: MessageSquare,
    color: "violet",
    steps: 5,
    defaultDelay: "3 days",
  },
  {
    id: "reactivation-voice",
    name: "Voice Reactivation",
    description: "Automated voice calls to reconnect with past customers",
    icon: Phone,
    color: "blue",
    steps: 3,
    defaultDelay: "7 days",
  },
  {
    id: "reactivation-combo",
    name: "Multi-Channel Reactivation",
    description: "Combine SMS and voice for maximum engagement",
    icon: Workflow,
    color: "amber",
    steps: 7,
    defaultDelay: "5 days",
  },
];

function WorkflowCard({ workflow }: { workflow: typeof workflowTemplates[0] }) {
  const Icon = workflow.icon;
  const colorClasses = {
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  return (
    <Link
      href={`/workflows/${workflow.id}`}
      className="group bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-violet-500/30 transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[workflow.color as keyof typeof colorClasses]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <button 
          onClick={(e) => e.preventDefault()}
          className="p-2 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>
      
      <h3 className="text-lg font-semibold text-white mb-2">{workflow.name}</h3>
      <p className="text-gray-400 text-sm mb-4">{workflow.description}</p>
      
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>{workflow.steps} steps</span>
        <span>•</span>
        <span>{workflow.defaultDelay} between steps</span>
      </div>
      
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
        <span className="text-violet-400 text-sm font-medium group-hover:text-violet-300 transition-colors flex items-center gap-1">
          Configure workflow
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </span>
      </div>
    </Link>
  );
}

export default async function WorkflowsPage() {
  // TODO: Implement with workflows.service.ts
  // - Fetch user's active workflows
  // - Include enrollment counts and stats

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-gray-400 mt-1">
            Automate your lead reactivation with SMS and voice workflows
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
          <Plus className="w-5 h-5" />
          Create Workflow
        </button>
      </div>

      {/* Active Workflows Section */}
      <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Active Workflows</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
              0 active
            </span>
          </div>
        </div>
        
        {/* Empty State */}
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
            <Workflow className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-2">No active workflows</p>
          <p className="text-gray-500 text-sm">
            Choose a template below to get started
          </p>
        </div>
      </div>

      {/* Workflow Templates */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Workflow Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowTemplates.map((template) => (
            <WorkflowCard key={template.id} workflow={template} />
          ))}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Total Enrolled</span>
          </div>
          <p className="text-2xl font-bold text-white">0</p>
        </div>
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm">SMS Sent</span>
          </div>
          <p className="text-2xl font-bold text-white">0</p>
        </div>
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Phone className="w-4 h-4" />
            <span className="text-sm">Calls Made</span>
          </div>
          <p className="text-2xl font-bold text-white">0</p>
        </div>
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <Play className="w-4 h-4" />
            <span className="text-sm">Response Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">0%</p>
        </div>
      </div>
    </div>
  );
}
