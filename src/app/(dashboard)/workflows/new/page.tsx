'use client';

// ============================================
// NEW WORKFLOW PAGE
// Create a new workflow from scratch or template
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RiArrowLeftLine, RiSaveLine, RiLoader4Line, RiSparklingLine } from '@remixicon/react';
import Link from 'next/link';
import { StepEditor } from '@/components/workflows/step-editor';
import { WorkflowSettings } from '@/components/workflows/workflow-settings';
import { WorkflowPreview } from '@/components/workflows/workflow-preview';
import { TemplatePicker } from '@/components/workflows/template-picker';
import { useToast } from '@/hooks/use-toast';
import type { WorkflowStep, WorkflowSettings as Settings, EnrollmentCriteria } from '@/types/workflows';
import { DEFAULT_WORKFLOW_SETTINGS, DEFAULT_ENROLLMENT_CRITERIA } from '@/types/workflows';
import type { WorkflowTemplate } from '@/lib/workflows/templates';

export default function NewWorkflowPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_WORKFLOW_SETTINGS);
  const [criteria, setCriteria] = useState<EnrollmentCriteria>(DEFAULT_ENROLLMENT_CRITERIA);

  const handleSelectTemplate = (template: WorkflowTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setSteps(template.steps);
    setSettings(template.settings);
    setCriteria(template.enrollment_criteria);
    setShowTemplatePicker(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a workflow name',
        variant: 'destructive',
      });
      return;
    }

    if (steps.length === 0) {
      toast({
        title: 'No steps',
        description: 'Add at least one step to your workflow',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          steps,
          settings,
          enrollment_criteria: criteria,
          status: 'draft',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create workflow');
      }

      toast({
        title: 'Workflow created!',
        description: 'Your workflow has been saved as a draft.',
      });

      router.push(`/workflows/${data.id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create workflow',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/workflows">
            <Button variant="ghost" size="icon">
              <RiArrowLeftLine className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">New Workflow</h1>
            <p className="text-muted-foreground">
              Create an automated multi-channel campaign
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowTemplatePicker(true)}
          >
            <RiSparklingLine className="h-4 w-4 mr-2" />
            Use Template
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <RiLoader4Line className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RiSaveLine className="h-4 w-4 mr-2" />
            )}
            Save Workflow
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workflow Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., 90-Day Reactivation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this workflow do?"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Steps</CardTitle>
              <CardDescription>
                Add SMS, email, and voice drop steps to your workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StepEditor steps={steps} onChange={setSteps} />
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowSettings
                settings={settings}
                criteria={criteria}
                onSettingsChange={setSettings}
                onCriteriaChange={setCriteria}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Preview */}
        <div className="space-y-6">
          <WorkflowPreview
            steps={steps}
            settings={settings}
            criteria={criteria}
          />
        </div>
      </div>

      {/* Template Picker Modal */}
      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={handleSelectTemplate}
      />
    </div>
  );
}
