/**
 * Enrollment Status Component
 * 
 * Displays contact enrollment status in a workflow:
 * - Current step indicator
 * - Progress visualization
 * - Status badge (in_progress, completed, paused, failed)
 * - Next action date/time
 * - Manual advance/pause controls
 * 
 * Used in: Contact details, workflow enrollments list
 */

"use client";

import { 
  CheckCircle2, 
  Clock, 
  Pause, 
  Play, 
  AlertCircle,
  ArrowRight,
  MessageSquare,
  Phone
} from "lucide-react";

interface Enrollment {
  id: string;
  workflow_id: string;
  workflow_name: string;
  contact_id: string;
  status: "in_progress" | "completed" | "paused" | "failed";
  current_step: number;
  total_steps: number;
  next_step_at?: string;
  started_at: string;
  completed_at?: string;
}

interface EnrollmentStatusProps {
  enrollment: Enrollment;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onAdvance?: (id: string) => void;
}

const statusConfig = {
  in_progress: { 
    label: "In Progress", 
    icon: Play, 
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30" 
  },
  completed: { 
    label: "Completed", 
    icon: CheckCircle2, 
    color: "text-green-400 bg-green-500/10 border-green-500/30" 
  },
  paused: { 
    label: "Paused", 
    icon: Pause, 
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30" 
  },
  failed: { 
    label: "Failed", 
    icon: AlertCircle, 
    color: "text-red-400 bg-red-500/10 border-red-500/30" 
  },
};

export function EnrollmentStatus({ 
  enrollment, 
  onPause, 
  onResume, 
  onAdvance 
}: EnrollmentStatusProps) {
  const status = statusConfig[enrollment.status];
  const StatusIcon = status.icon;
  const progressPercentage = (enrollment.current_step / enrollment.total_steps) * 100;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-medium text-gray-900">{enrollment.workflow_name}</h4>
          <p className="text-sm text-gray-400">
            Step {enrollment.current_step} of {enrollment.total_steps}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border ${status.color}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-brand-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Next Action */}
      {enrollment.status === "in_progress" && enrollment.next_step_at && (
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Clock className="w-4 h-4" />
          <span>
            Next step: {new Date(enrollment.next_step_at).toLocaleString()}
          </span>
        </div>
      )}

      {/* Completed Info */}
      {enrollment.status === "completed" && enrollment.completed_at && (
        <div className="flex items-center gap-2 text-sm text-green-400 mb-4">
          <CheckCircle2 className="w-4 h-4" />
          <span>
            Completed on {new Date(enrollment.completed_at).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        {enrollment.status === "in_progress" && (
          <>
            <button
              onClick={() => onPause?.(enrollment.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
            <button
              onClick={() => onAdvance?.(enrollment.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              Advance
            </button>
          </>
        )}
        {enrollment.status === "paused" && (
          <button
            onClick={() => onResume?.(enrollment.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        )}
      </div>
    </div>
  );
}

// Compact version for lists
export function EnrollmentStatusBadge({ enrollment }: { enrollment: Enrollment }) {
  const status = statusConfig[enrollment.status];
  const StatusIcon = status.icon;

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${status.color}`}>
        <StatusIcon className="w-3 h-3" />
        {status.label}
      </span>
      <span className="text-xs text-gray-500">
        {enrollment.current_step}/{enrollment.total_steps}
      </span>
    </div>
  );
}
