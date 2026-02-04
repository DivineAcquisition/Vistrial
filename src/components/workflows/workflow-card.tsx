/**
 * Workflow Card Component
 * 
 * Card component for displaying workflow summary:
 * - Workflow name and description
 * - Status indicator (active, paused, draft)
 * - Quick stats (enrolled, completed, response rate)
 * - Step count and type icons
 * - Quick action buttons (activate, pause, edit)
 * 
 * Used in: /workflows page grid
 */

"use client";

import Link from "next/link";
import { 
  MessageSquare, 
  Phone, 
  Play, 
  Pause, 
  MoreHorizontal,
  Users,
  TrendingUp,
  ArrowRight
} from "lucide-react";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: "active" | "paused" | "draft";
  step_count: number;
  has_sms: boolean;
  has_voice: boolean;
  enrolled_count: number;
  completed_count: number;
  response_rate: number;
}

interface WorkflowCardProps {
  workflow: Workflow;
  onActivate?: (id: string) => void;
  onPause?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const statusConfig = {
  active: { label: "Active", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  paused: { label: "Paused", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  draft: { label: "Draft", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export function WorkflowCard({ workflow, onActivate, onPause }: WorkflowCardProps) {
  const status = statusConfig[workflow.status];

  return (
    <div className="group bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-violet-500/30 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Type Icons */}
          <div className="flex items-center gap-1">
            {workflow.has_sms && (
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                <MessageSquare className="w-4 h-4" />
              </div>
            )}
            {workflow.has_voice && (
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Phone className="w-4 h-4" />
              </div>
            )}
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${status.color}`}>
            {status.label}
          </span>
        </div>
        <button className="p-2 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-white/5">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <Link href={`/workflows/${workflow.id}`}>
        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-violet-400 transition-colors">
          {workflow.name}
        </h3>
        {workflow.description && (
          <p className="text-gray-400 text-sm mb-4 line-clamp-2">
            {workflow.description}
          </p>
        )}
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-white/5 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
            <Users className="w-3 h-3" />
          </div>
          <p className="text-lg font-semibold text-white">{workflow.enrolled_count}</p>
          <p className="text-xs text-gray-500">Enrolled</p>
        </div>
        <div className="text-center p-2 bg-white/5 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
            <TrendingUp className="w-3 h-3" />
          </div>
          <p className="text-lg font-semibold text-white">{workflow.completed_count}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div className="text-center p-2 bg-white/5 rounded-lg">
          <p className="text-lg font-semibold text-green-400">{workflow.response_rate}%</p>
          <p className="text-xs text-gray-500">Response</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <span className="text-sm text-gray-400">{workflow.step_count} steps</span>
        <div className="flex items-center gap-2">
          {workflow.status === "active" ? (
            <button
              onClick={() => onPause?.(workflow.id)}
              className="p-2 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
              title="Pause workflow"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onActivate?.(workflow.id)}
              className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
              title="Activate workflow"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <Link 
            href={`/workflows/${workflow.id}`}
            className="p-2 text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
