// @ts-nocheck
'use client';

// ============================================
// WORKFLOW CREATOR
// Main workflow creation interface
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
} from 'lucide-react';
import { TemplateSelector } from './template-selector';
import { StepEditorPanel } from './step-editor-panel';
import { WorkflowSettingsPanel } from './workflow-settings-panel';
import { EnrollmentCriteriaPanel } from './enrollment-criteria-panel';
import { WorkflowPreviewPanel } from './workflow-preview-panel';
import { DEFAULT_WORKFLOW_SETTINGS, DEFAULT_ENROLLMENT_CRITERIA } from '@/types/workflows';
import type { WorkflowStep, WorkflowSettings, EnrollmentCriteria, WorkflowTemplate } from '@/types/workflows';

interface WorkflowCreatorProps {
  organizationId: string;
  templates: WorkflowTemplate[];
  initialTemplate?: WorkflowTemplate | null;
}

export function WorkflowCreator({
  organizationId,
  templates,
  initialTemplate,
}: WorkflowCreatorProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<'template' | 'build'>(
    initialTemplate ? 'build' : 'template'
  );
  const [isSaving, setIsSaving] = useState(false);

  // Workflow state
  const [name, setName] = useState(initialTemplate?.name || '');
  const [description, setDescription] = useState(initialTemplate?.description || '');
  const [category, setCategory] = useState(initialTemplate?.category || 'reactivation');
  const [steps, setSteps] = useState<WorkflowStep[]>(
    (initialTemplate?.steps as WorkflowStep[]) || []
  );
  const [settings, setSettings] = useState<WorkflowSettings>(
    (initialTemplate?.default_settings as WorkflowSettings) || DEFAULT_WORKFLOW_SETTINGS
  );
  const [criteria, setCriteria] = useState<EnrollmentCriteria>(DEFAULT_ENROLLMENT_CRITERIA);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplate?.id || null
  );

  const handleSelectTemplate = (template: WorkflowTemplate) => {
    setName(template.name);
    setDescription(template.description || '');
    setCategory(template.category);
    setSteps((template.steps as WorkflowStep[]) || []);
    setSettings(
      (template.default_settings as WorkflowSettings) || DEFAULT_WORKFLOW_SETTINGS
    );
    setSelectedTemplateId(template.id);
    setStep('build');
  };

  const handleStartFromScratch = () => {
    setName('');
    setDescription('');
    setCategory('reactivation');
    setSteps([]);
    setSettings(DEFAULT_WORKFLOW_SETTINGS);
    setSelectedTemplateId(null);
    setStep('build');
  };

  const handleSave = async (activate: boolean = false) => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a workflow name',
        variant: 'destructive',
      });
      return;
    }

    if (steps.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one step',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      // Create workflow
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          name,
          description,
          category,
          steps,
          settings,
          enrollment_criteria: criteria,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create workflow');
      }

      // Activate if requested
      if (activate) {
        const activateResponse = await fetch(`/api/workflows/${data.workflow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activate' }),
        });

        if (!activateResponse.ok) {
          toast({
            title: 'Warning',
            description: 'Workflow created but could not be activated',
          });
        }
      }

      toast({
        title: 'Success',
        description: activate
          ? 'Workflow created and activated!'
          : 'Workflow saved as draft',
      });

      router.push(`/workflows/${data.workflow.id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save workflow',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'template') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()} className="text-gray-400 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Workflow</h1>
            <p className="text-gray-400">
              Start with a template or build from scratch
            </p>
          </div>
        </div>

        <TemplateSelector
          templates={templates}
          onSelect={handleSelectTemplate}
          onStartFromScratch={handleStartFromScratch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setStep('template')} className="text-gray-400 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {name || 'New Workflow'}
            </h1>
            <p className="text-gray-400">
              Configure your workflow steps and settings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => handleSave(false)} 
            disabled={isSaving}
            className="border-gray-200 text-gray-900 hover:bg-gray-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </>
            )}
          </Button>
          <Button 
            onClick={() => handleSave(true)} 
            disabled={isSaving}
            className="bg-brand-600 hover:bg-brand-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Save & Activate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Builder Tabs */}
      <Tabs defaultValue="steps" className="space-y-6">
        <TabsList className="bg-gray-50 border border-gray-200">
          <TabsTrigger value="steps" className="data-[state=active]:bg-brand-600">Steps</TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-brand-600">Settings</TabsTrigger>
          <TabsTrigger value="criteria" className="data-[state=active]:bg-brand-600">Enrollment</TabsTrigger>
          <TabsTrigger value="preview" className="data-[state=active]:bg-brand-600">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="space-y-6">
          {/* Basic Info */}
          <Card className="bg-white/80 border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Workflow Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-300">Workflow Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., 90-Day Reactivation"
                    className="bg-white border-gray-200 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-gray-300">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      <SelectItem value="reactivation">Reactivation</SelectItem>
                      <SelectItem value="retention">Retention</SelectItem>
                      <SelectItem value="seasonal">Seasonal</SelectItem>
                      <SelectItem value="review_request">Review Request</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="win_back">Win Back</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-300">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this workflow does..."
                  rows={2}
                  className="bg-white border-gray-200 text-gray-900"
                />
              </div>
            </CardContent>
          </Card>

          {/* Step Editor */}
          <StepEditorPanel steps={steps} onChange={setSteps} />
        </TabsContent>

        <TabsContent value="settings">
          <WorkflowSettingsPanel settings={settings} onChange={setSettings} />
        </TabsContent>

        <TabsContent value="criteria">
          <EnrollmentCriteriaPanel criteria={criteria} onChange={setCriteria} />
        </TabsContent>

        <TabsContent value="preview">
          <WorkflowPreviewPanel
            name={name}
            description={description}
            steps={steps}
            settings={settings}
            criteria={criteria}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
