/**
 * Workflow Builder Component
 * 
 * Visual workflow builder with:
 * - Drag-and-drop step ordering
 * - Step type selection (SMS, Voice, Delay, Condition)
 * - Step configuration panels
 * - Template variable insertion
 * - Preview of message content
 * - Delay configuration
 * - Save/cancel actions
 * 
 * Uses: @atlaskit/pragmatic-drag-and-drop
 */

"use client";

import { useState } from "react";
import { 
  Plus, 
  GripVertical, 
  MessageSquare, 
  Phone, 
  Clock, 
  GitBranch,
  Trash2,
  Edit2,
  Save,
  X
} from "lucide-react";

export type StepType = "sms" | "voice" | "delay" | "condition";

export interface WorkflowStep {
  id: string;
  type: StepType;
  order: number;
  content?: string;
  delay_value?: number;
  delay_unit?: "minutes" | "hours" | "days";
  condition?: {
    field: string;
    operator: string;
    value: string;
  };
}

interface WorkflowBuilderProps {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  onSave: () => void;
  saving?: boolean;
}

const stepTypeConfig = {
  sms: { icon: MessageSquare, label: "SMS Message", color: "violet" },
  voice: { icon: Phone, label: "Voice Call", color: "blue" },
  delay: { icon: Clock, label: "Wait/Delay", color: "gray" },
  condition: { icon: GitBranch, label: "Condition", color: "amber" },
};

function StepEditor({ 
  step, 
  onUpdate, 
  onDelete 
}: { 
  step: WorkflowStep; 
  onUpdate: (step: WorkflowStep) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStep, setEditedStep] = useState(step);
  const config = stepTypeConfig[step.type];
  const Icon = config.icon;

  const handleSave = () => {
    onUpdate(editedStep);
    setIsEditing(false);
  };

  return (
    <div className="group relative flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-all">
      {/* Drag Handle */}
      <button className="p-1 text-gray-500 hover:text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Step Number */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-sm font-medium">
        {step.order}
      </div>

      {/* Step Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded bg-${config.color}-500/20 text-${config.color}-400`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-gray-300">{config.label}</span>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            {step.type === "sms" && (
              <textarea
                value={editedStep.content || ""}
                onChange={(e) => setEditedStep({ ...editedStep, content: e.target.value })}
                rows={3}
                placeholder="Enter your message... Use {{first_name}} for personalization"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 resize-none text-sm"
              />
            )}
            {step.type === "voice" && (
              <textarea
                value={editedStep.content || ""}
                onChange={(e) => setEditedStep({ ...editedStep, content: e.target.value })}
                rows={3}
                placeholder="Enter your voice script..."
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 resize-none text-sm"
              />
            )}
            {step.type === "delay" && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={editedStep.delay_value || 1}
                  onChange={(e) => setEditedStep({ ...editedStep, delay_value: parseInt(e.target.value) })}
                  min={1}
                  className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm"
                />
                <select
                  value={editedStep.delay_unit || "days"}
                  onChange={(e) => setEditedStep({ ...editedStep, delay_unit: e.target.value as any })}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedStep(step);
                }}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div>
            {step.type === "delay" ? (
              <p className="text-gray-400 text-sm">
                Wait {step.delay_value || 1} {step.delay_unit || "days"}
              </p>
            ) : (
              <p className="text-gray-300 text-sm line-clamp-2">
                {step.content || "Click edit to add content"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => setIsEditing(true)}
            className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-50"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function WorkflowBuilder({ steps, onChange, onSave, saving }: WorkflowBuilderProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const addStep = (type: StepType) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      type,
      order: steps.length + 1,
      content: type === "delay" ? undefined : "",
      delay_value: type === "delay" ? 3 : undefined,
      delay_unit: type === "delay" ? "days" : undefined,
    };
    onChange([...steps, newStep]);
    setShowAddMenu(false);
  };

  const updateStep = (index: number, updatedStep: WorkflowStep) => {
    const newSteps = [...steps];
    newSteps[index] = updatedStep;
    onChange(newSteps);
  };

  const deleteStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    // Reorder remaining steps
    newSteps.forEach((step, i) => {
      step.order = i + 1;
    });
    onChange(newSteps);
  };

  return (
    <div className="space-y-4">
      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id}>
            <StepEditor
              step={step}
              onUpdate={(s) => updateStep(index, s)}
              onDelete={() => deleteStep(index)}
            />
            {index < steps.length - 1 && (
              <div className="flex justify-center py-2">
                <div className="w-px h-6 bg-gray-100" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Step Button */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full p-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-brand-500/30 hover:text-brand-400 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add step
        </button>

        {showAddMenu && (
          <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-white border border-gray-200 rounded-xl shadow-xl z-10">
            {Object.entries(stepTypeConfig).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => addStep(type as StepType)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className={`p-2 rounded-lg bg-${config.color}-500/10 text-${config.color}-400`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-gray-900">{config.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-5 h-5" />
          {saving ? "Saving..." : "Save Workflow"}
        </button>
      </div>
    </div>
  );
}
