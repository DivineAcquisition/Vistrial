'use client';

// ============================================
// STEP EDITOR
// Drag-and-drop step editor with email support
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  RiMessage2Line,
  RiPhoneLine,
  RiMailLine,
  RiAddLine,
  RiDraggable,
  RiPencilLine,
  RiDeleteBinLine,
  RiTimeLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';
import { StepConfigModal } from './step-config-modal';
import type { WorkflowStep } from '@/types/workflows';

interface StepEditorProps {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
}

const STEP_TYPES = [
  {
    type: 'sms',
    label: 'SMS Message',
    icon: RiMessage2Line,
    color: 'bg-blue-100 text-blue-600',
    description: 'Send a text message',
  },
  {
    type: 'email',
    label: 'Email',
    icon: RiMailLine,
    color: 'bg-purple-100 text-purple-600',
    description: 'Send an email',
  },
  {
    type: 'voice_drop',
    label: 'Voice Drop',
    icon: RiPhoneLine,
    color: 'bg-green-100 text-green-600',
    description: 'Leave a voicemail',
  },
] as const;

export function StepEditor({ steps, onChange }: StepEditorProps) {
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleAddStep = (type: 'sms' | 'email' | 'voice_drop') => {
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      type,
      delay_days: steps.length === 0 ? 0 : 3,
      delay_hours: 0,
      template: type === 'sms' ? '' : undefined,
      email_subject: type === 'email' ? '' : undefined,
      email_body: type === 'email' ? '' : undefined,
      voice_script: type === 'voice_drop' ? '' : undefined,
    };

    setEditingStep(newStep);
    setEditingIndex(steps.length);
    setIsAddDialogOpen(false);
  };

  const handleSaveStep = (step: WorkflowStep) => {
    if (editingIndex !== null) {
      if (editingIndex >= steps.length) {
        // Adding new step
        onChange([...steps, step]);
      } else {
        // Editing existing step
        const newSteps = [...steps];
        newSteps[editingIndex] = step;
        onChange(newSteps);
      }
    }
    setEditingStep(null);
    setEditingIndex(null);
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
    const [draggedStep] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(index, 0, draggedStep);
    onChange(newSteps);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const getStepIcon = (type: string) => {
    const stepType = STEP_TYPES.find((t) => t.type === type);
    return stepType?.icon || RiMessage2Line;
  };

  const getStepColor = (type: string) => {
    const stepType = STEP_TYPES.find((t) => t.type === type);
    return stepType?.color || 'bg-gray-100 text-gray-600';
  };

  const getStepPreview = (step: WorkflowStep) => {
    switch (step.type) {
      case 'sms':
        return step.template?.slice(0, 60) + (step.template && step.template.length > 60 ? '...' : '') || 'No message set';
      case 'email':
        return step.email_subject || 'No subject set';
      case 'voice_drop':
        return step.voice_script?.slice(0, 60) + (step.voice_script && step.voice_script.length > 60 ? '...' : '') || 'No script set';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Steps List */}
      {steps.length > 0 ? (
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = getStepIcon(step.type);

            return (
              <div key={step.id}>
                {/* Delay indicator */}
                {index > 0 && (
                  <div className="flex items-center gap-2 py-2 pl-8">
                    <RiTimeLine className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Wait {step.delay_days} day{step.delay_days !== 1 ? 's' : ''}
                      {step.delay_hours > 0 && ` ${step.delay_hours} hour${step.delay_hours !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                )}

                {/* Step Card */}
                <Card
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'cursor-move transition-shadow hover:shadow-md',
                    draggedIndex === index && 'opacity-50'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="cursor-grab active:cursor-grabbing">
                        <RiDraggable className="h-5 w-5 text-muted-foreground" />
                      </div>

                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', getStepColor(step.type))}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs">
                            Step {index + 1}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {step.type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {getStepPreview(step)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingStep(step);
                            setEditingIndex(index);
                          }}
                        >
                          <RiPencilLine className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteStep(index)}
                        >
                          <RiDeleteBinLine className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No steps added yet. Add your first step to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Step Button */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full">
            <RiAddLine className="h-4 w-4 mr-2" />
            Add Step
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a step</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {STEP_TYPES.map((stepType) => (
              <button
                key={stepType.type}
                onClick={() => handleAddStep(stepType.type)}
                className="flex items-center gap-4 p-4 rounded-lg border hover:border-primary hover:bg-muted/50 transition-colors text-left"
              >
                <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', stepType.color)}>
                  <stepType.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium">{stepType.label}</p>
                  <p className="text-sm text-muted-foreground">{stepType.description}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Step Config Modal */}
      {editingStep && (
        <StepConfigModal
          step={editingStep}
          isFirstStep={editingIndex === 0}
          onSave={handleSaveStep}
          onClose={() => {
            setEditingStep(null);
            setEditingIndex(null);
          }}
        />
      )}
    </div>
  );
}
