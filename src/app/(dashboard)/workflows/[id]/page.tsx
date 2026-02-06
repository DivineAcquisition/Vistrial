/**
 * Workflow Detail / Builder Page
 * 
 * This page allows users to configure and manage a specific workflow:
 * - Visual workflow builder with drag-and-drop steps
 * - Step configuration (message content, delays, conditions)
 * - Enrollment settings (criteria, limits, schedules)
 * - Analytics for this specific workflow
 * - Test workflow functionality
 * - Activate/Pause controls
 * - Enrolled contacts list
 */

import Link from "next/link";
import { 
  ArrowLeft,
  Play,
  Settings,
  Users,
  MessageSquare,
  Clock,
  Plus,
  GripVertical,
  Trash2,
  Edit2,
  Save
} from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Placeholder workflow step
interface WorkflowStep {
  id: string;
  type: "sms" | "voice" | "delay" | "condition";
  content?: string;
  delay?: string;
  order: number;
}

const placeholderSteps: WorkflowStep[] = [
  { id: "1", type: "sms", content: "Hi {{first_name}}, we haven't heard from you in a while! We'd love to help with your next project.", order: 1 },
  { id: "2", type: "delay", delay: "3 days", order: 2 },
  { id: "3", type: "sms", content: "{{first_name}}, just checking in - any home service needs we can help with?", order: 3 },
  { id: "4", type: "delay", delay: "5 days", order: 4 },
  { id: "5", type: "voice", content: "Personalized voice call with special offer", order: 5 },
];

function StepCard({ step, index }: { step: WorkflowStep; index: number }) {
  const typeConfig = {
    sms: { icon: MessageSquare, label: "SMS", color: "violet" },
    voice: { icon: MessageSquare, label: "Voice Call", color: "blue" },
    delay: { icon: Clock, label: "Wait", color: "gray" },
    condition: { icon: Settings, label: "Condition", color: "amber" },
  };

  const config = typeConfig[step.type];

  return (
    <div className="group relative flex items-start gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-200 hover:border-white/20 transition-all">
      {/* Drag Handle */}
      <button className="p-1 text-gray-500 hover:text-gray-600 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Step Number */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-sm font-medium">
        {index + 1}
      </div>

      {/* Step Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded bg-${config.color}-500/20 text-${config.color}-400`}>
            {config.label}
          </span>
          {step.delay && (
            <span className="text-sm text-gray-500">Wait {step.delay}</span>
          )}
        </div>
        {step.content && (
          <p className="text-gray-600 text-sm">{step.content}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-50">
          <Edit2 className="w-4 h-4" />
        </button>
        <button className="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-gray-50">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default async function WorkflowDetailPage({ params }: PageProps) {
  const { id } = await params;

  // TODO: Fetch workflow details from workflows.service.ts
  // TODO: Load enrollment stats and activity

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/workflows"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Workflows
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">SMS Reactivation</h1>
          <p className="text-gray-500 mt-1">
            Workflow ID: {id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-200 text-gray-900 rounded-xl font-medium hover:bg-gray-700 transition-colors">
            <Settings className="w-5 h-5" />
            Settings
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-gray-900 rounded-xl font-medium hover:bg-green-700 transition-colors">
            <Play className="w-5 h-5" />
            Activate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Workflow Builder */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Workflow Steps</h2>
              <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-500/10 text-brand-400 rounded-lg hover:bg-brand-500/20 transition-colors">
                <Plus className="w-4 h-4" />
                Add Step
              </button>
            </div>

            {/* Steps List */}
            <div className="space-y-3">
              {placeholderSteps.map((step, index) => (
                <div key={step.id}>
                  <StepCard step={step} index={index} />
                  {index < placeholderSteps.length - 1 && (
                    <div className="flex justify-center py-2">
                      <div className="w-px h-6 bg-gray-100" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add Step Button */}
            <button className="w-full mt-4 p-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-brand-500/30 hover:text-brand-400 transition-all flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" />
              Add another step
            </button>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-gray-900 rounded-xl font-medium hover:bg-brand-700 transition-colors">
              <Save className="w-5 h-5" />
              Save Changes
            </button>
          </div>
        </div>

        {/* Sidebar - Stats & Enrollments */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Performance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Enrolled</span>
                <span className="text-gray-900 font-medium">0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Completed</span>
                <span className="text-gray-900 font-medium">0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Response Rate</span>
                <span className="text-green-400 font-medium">0%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Messages Sent</span>
                <span className="text-gray-900 font-medium">0</span>
              </div>
            </div>
          </div>

          {/* Enrolled Contacts */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Enrolled Contacts</h3>
              <Link href="/contacts" className="text-sm text-brand-400 hover:text-brand-300">
                View all
              </Link>
            </div>
            
            <div className="text-center py-6">
              <Users className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No contacts enrolled yet</p>
            </div>
          </div>

          {/* Enrollment Settings */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Enrollment Settings</h3>
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Auto-enroll new contacts</span>
                <span className="text-gray-600">Off</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Sending hours</span>
                <span className="text-gray-600">9 AM - 8 PM</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Timezone</span>
                <span className="text-gray-600">Contact&apos;s local time</span>
              </div>
            </div>
            <button className="w-full mt-4 py-2 text-sm text-brand-400 hover:text-brand-300 transition-colors">
              Edit settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
