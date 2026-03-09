'use client';

// ============================================
// AI WORKFLOW GENERATOR PAGE
// Generate workflows with Claude based on business context
// ============================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RiArrowLeftLine,
  RiSparklingLine,
  RiLoader4Line,
  RiMessage2Line,
  RiMailLine,
  RiTimeLine,
  RiPencilLine,
  RiRefreshLine,
} from '@remixicon/react';
import type { WorkflowStep } from '@/types/workflows';
import { DEFAULT_WORKFLOW_SETTINGS, DEFAULT_ENROLLMENT_CRITERIA } from '@/types/workflows';
import type { WorkflowSettings, EnrollmentCriteria } from '@/types/workflows';

const WORKFLOW_GOALS = [
  'Follow up after service',
  'Reactivate dormant clients',
  'Request reviews',
  'Nurture new leads',
  'Win back cancelled clients',
  'Custom',
] as const;

const TONE_OPTIONS = ['Professional', 'Friendly', 'Casual', 'Urgent'] as const;

const STEP_COUNTS = [3, 5, 7, 10] as const;

const STORAGE_KEY = 'workflow_generated_data';

export default function GenerateWorkflowPage() {
  const router = useRouter();
  const [businessProfile, setBusinessProfile] = useState<Record<string, unknown> | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<WorkflowStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [workflowGoal, setWorkflowGoal] = useState<string>(WORKFLOW_GOALS[0]);
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState<string>(TONE_OPTIONS[0]);
  const [numSteps, setNumSteps] = useState<number>(5);
  const [channelSms, setChannelSms] = useState(true);
  const [channelEmail, setChannelEmail] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/settings/business');
        if (res.ok) {
          const data = await res.json();
          setBusinessProfile(data.organization || null);
        }
      } catch {
        setError('Failed to load business profile');
      } finally {
        setIsLoadingProfile(false);
      }
    }
    fetchProfile();
  }, []);

  const channels = [
    ...(channelSms ? ['SMS'] : []),
    ...(channelEmail ? ['Email'] : []),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGeneratedSteps(null);

    if (channels.length === 0) {
      setError('Select at least one channel (SMS or Email)');
      return;
    }

    if (!targetAudience.trim()) {
      setError('Please describe your target audience');
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_goal: workflowGoal,
          target_audience: targetAudience.trim(),
          tone,
          num_steps: numSteps,
          channels,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate workflow');
      }

      setGeneratedSteps(data.steps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workflow');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditAndSave = () => {
    if (!generatedSteps || generatedSteps.length === 0) return;

    const org = businessProfile as Record<string, unknown> | null;
    const name = (org?.name as string) || 'Generated Workflow';
    const workflowName = `${workflowGoal} - ${name}`;

    const payload = {
      name: workflowName,
      description: `AI-generated workflow for: ${targetAudience}`,
      steps: generatedSteps,
      settings: DEFAULT_WORKFLOW_SETTINGS as WorkflowSettings,
      enrollment_criteria: DEFAULT_ENROLLMENT_CRITERIA as EnrollmentCriteria,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      router.push('/workflows/new');
    } catch {
      setError('Failed to save workflow data');
    }
  };

  const handleRegenerate = () => {
    setGeneratedSteps(null);
    setError(null);
  };

  const getStepPreview = (step: WorkflowStep) => {
    switch (step.type) {
      case 'sms':
        return step.template?.slice(0, 80) + (step.template && step.template.length > 80 ? '...' : '') || 'No message';
      case 'email':
        return step.email_body?.slice(0, 100) + (step.email_body && step.email_body.length > 100 ? '...' : '') || 'No content';
      default:
        return '';
    }
  };

  const getStepIcon = (type: string) => {
    return type === 'sms' ? RiMessage2Line : RiMailLine;
  };

  const getStepColor = (type: string) => {
    return type === 'sms' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600';
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RiLoader4Line className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold text-gray-900">AI Workflow Generator</h1>
            <p className="text-muted-foreground">
              Describe what you want and let AI build your workflow
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      {!generatedSteps ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RiSparklingLine className="h-5 w-5 text-brand-600" />
              Workflow Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="goal">Workflow Goal</Label>
                  <Select value={workflowGoal} onValueChange={setWorkflowGoal}>
                    <SelectTrigger id="goal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKFLOW_GOALS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone">Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger id="tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">Target Audience</Label>
                <Input
                  id="audience"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., clients who haven't booked in 30 days"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="steps">Number of Steps</Label>
                  <Select
                    value={String(numSteps)}
                    onValueChange={(v) => setNumSteps(Number(v))}
                  >
                    <SelectTrigger id="steps">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STEP_COUNTS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} steps
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Channel Preference</Label>
                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={channelSms}
                        onCheckedChange={(c) => setChannelSms(!!c)}
                      />
                      <span className="text-sm">SMS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={channelEmail}
                        onCheckedChange={(c) => setChannelEmail(!!c)}
                      />
                      <span className="text-sm">Email</span>
                    </label>
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={isGenerating} className="w-full sm:w-auto">
                {isGenerating ? (
                  <>
                    <RiLoader4Line className="h-4 w-4 mr-2 animate-spin" />
                    AI is building your workflow...
                  </>
                ) : (
                  <>
                    <RiSparklingLine className="h-4 w-4 mr-2" />
                    Generate Workflow
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        /* Generated Workflow Preview */
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generated Workflow</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review the steps below. Edit and save to customize, or regenerate for a different result.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedSteps.map((step, index) => {
                const Icon = getStepIcon(step.type);
                return (
                  <div key={step.id}>
                    {index > 0 && (
                      <div className="flex items-center gap-2 py-2 pl-8">
                        <RiTimeLine className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Wait {step.delay_days} day{step.delay_days !== 1 ? 's' : ''}
                          {step.delay_hours > 0 &&
                            ` ${step.delay_hours} hour${step.delay_hours !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getStepColor(step.type)}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            Step {index + 1}
                          </span>
                          <span className="text-xs capitalize text-muted-foreground">
                            {step.type}
                          </span>
                        </div>
                        {step.type === 'email' && step.email_subject && (
                          <p className="text-sm font-medium text-gray-900 mb-1">
                            {step.email_subject}
                          </p>
                        )}
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {getStepPreview(step)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-3 pt-4">
                <Button onClick={handleEditAndSave}>
                  <RiPencilLine className="h-4 w-4 mr-2" />
                  Edit & Save
                </Button>
                <Button variant="outline" onClick={handleRegenerate}>
                  <RiRefreshLine className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Link href="/workflows">
                  <Button variant="ghost">Back to Workflows</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
