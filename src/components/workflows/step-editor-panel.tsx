// @ts-nocheck
'use client';

// ============================================
// STEP EDITOR PANEL
// Visual step builder with drag-and-drop
// ============================================

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  GripVertical,
  MessageSquare,
  Phone,
  Trash2,
  Edit,
  Clock,
} from 'lucide-react';
import { StepConfigModal } from './step-config-modal';
import type { WorkflowStep } from '@/types/workflows';
import { cn } from '@/lib/utils/cn';

interface StepEditorPanelProps {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
}

export function StepEditorPanel({ steps, onChange }: StepEditorPanelProps) {
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleAddStep = (type: 'sms' | 'voice_drop') => {
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      type,
      delay_days: steps.length === 0 ? 0 : 3,
      delay_hours: 0,
      template: type === 'sms'
        ? 'Hi {{first_name}}, this is {{business_name}}. '
        : 'Hi {{first_name}}, this is {{business_name}} calling to check in with you.',
    };

    setEditingStep(newStep);
    setEditingIndex(steps.length);
    setShowAddDialog(false);
  };

  const handleSaveStep = (step: WorkflowStep) => {
    const newSteps = [...steps];
    if (editingIndex !== null && editingIndex < steps.length) {
      newSteps[editingIndex] = step;
    } else {
      newSteps.push(step);
    }
    onChange(newSteps);
    setEditingStep(null);
    setEditingIndex(null);
  };

  const handleEditStep = (index: number) => {
    setEditingStep(steps[index]);
    setEditingIndex(index);
  };

  const handleDeleteStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    onChange(newSteps);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSteps = [...steps];
    const draggedStep = newSteps[draggedIndex];
    newSteps.splice(draggedIndex, 1);
    newSteps.splice(index, 0, draggedStep);
    onChange(newSteps);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <Card className="bg-white/80 border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-gray-900">Workflow Steps</CardTitle>
        <Button onClick={() => setShowAddDialog(true)} className="bg-brand-600 hover:bg-brand-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Step
        </Button>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
            <MessageSquare className="h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">
              No steps yet. Add your first message to get started.
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="bg-brand-600 hover:bg-brand-700">
              <Plus className="h-4 w-4 mr-2" />
              Add First Step
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.id}>
                {index > 0 && (
                  <div className="flex items-center justify-center py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      Wait {step.delay_days} day{step.delay_days !== 1 ? 's' : ''}
                      {step.delay_hours > 0 && ` ${step.delay_hours} hour${step.delay_hours !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                )}
                <div
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'flex items-start gap-3 p-4 border border-gray-200 rounded-lg bg-gray-50 transition-all hover:border-gray-300',
                    draggedIndex === index && 'opacity-50 scale-95'
                  )}
                >
                  <div className="cursor-move text-gray-500 hover:text-gray-300">
                    <GripVertical className="h-5 w-5" />
                  </div>

                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      step.type === 'sms'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    )}
                  >
                    {step.type === 'sms' ? (
                      <MessageSquare className="h-5 w-5" />
                    ) : (
                      <Phone className="h-5 w-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs border-gray-300 text-gray-400">
                        Step {index + 1}
                      </Badge>
                      <span className="text-sm font-medium text-gray-900">
                        {step.type === 'sms' ? 'SMS Message' : 'Voice Drop'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 line-clamp-2">
                      {step.template}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditStep(index)}
                      className="text-gray-400 hover:text-gray-900"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteStep(index)}
                      className="text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Step Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Add Step</DialogTitle>
              <DialogDescription className="text-gray-400">
                Choose the type of message to add
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <Card
                className="bg-gray-50 border-gray-200 cursor-pointer hover:border-blue-500/50 transition-colors"
                onClick={() => handleAddStep('sms')}
              >
                <CardContent className="flex flex-col items-center justify-center py-6">
                  <div className="p-3 rounded-lg bg-blue-500/20 mb-3">
                    <MessageSquare className="h-6 w-6 text-blue-400" />
                  </div>
                  <p className="font-medium text-gray-900">SMS Message</p>
                  <p className="text-xs text-gray-400">$0.015 per message</p>
                </CardContent>
              </Card>
              <Card
                className="bg-gray-50 border-gray-200 cursor-pointer hover:border-purple-500/50 transition-colors"
                onClick={() => handleAddStep('voice_drop')}
              >
                <CardContent className="flex flex-col items-center justify-center py-6">
                  <div className="p-3 rounded-lg bg-purple-500/20 mb-3">
                    <Phone className="h-6 w-6 text-purple-400" />
                  </div>
                  <p className="font-medium text-gray-900">Voice Drop</p>
                  <p className="text-xs text-gray-400">$0.05 per drop</p>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>

        {/* Step Config Modal */}
        {editingStep && (
          <StepConfigModal
            step={editingStep}
            isFirst={editingIndex === 0}
            onSave={handleSaveStep}
            onCancel={() => {
              setEditingStep(null);
              setEditingIndex(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
