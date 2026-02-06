'use client';

// ============================================
// WORKFLOW PREVIEW
// Visual preview of the workflow with email support
// ============================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  RiMessage2Line,
  RiMailLine,
  RiPhoneLine,
  RiTimeLine,
  RiCheckLine,
  RiCalendarLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';
import type { WorkflowStep, WorkflowSettings, EnrollmentCriteria } from '@/types/workflows';

interface WorkflowPreviewProps {
  steps: WorkflowStep[];
  settings: WorkflowSettings;
  criteria: EnrollmentCriteria;
}

export function WorkflowPreview({
  steps,
  settings,
  criteria,
}: WorkflowPreviewProps) {
  // Calculate totals
  const totalDays = steps.reduce((acc, step, index) => {
    if (index === 0) return 0;
    return acc + step.delay_days + step.delay_hours / 24;
  }, 0);

  const smsCount = steps.filter((s) => s.type === 'sms').length;
  const emailCount = steps.filter((s) => s.type === 'email').length;
  const voiceCount = steps.filter((s) => s.type === 'voice_drop').length;

  // Estimate cost per contact
  const smsCost = smsCount * 0.015;
  const emailCost = emailCount * 0.001;
  const voiceCost = voiceCount * 0.05;
  const totalCost = (smsCost + emailCost + voiceCost).toFixed(2);

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'sms':
        return RiMessage2Line;
      case 'email':
        return RiMailLine;
      case 'voice_drop':
        return RiPhoneLine;
      default:
        return RiMessage2Line;
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'sms':
        return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'email':
        return 'bg-purple-100 text-purple-600 border-purple-200';
      case 'voice_drop':
        return 'bg-green-100 text-green-600 border-green-200';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{steps.length}</p>
            <p className="text-sm text-muted-foreground">Total Steps</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{Math.ceil(totalDays)}</p>
            <p className="text-sm text-muted-foreground">Days Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="flex justify-center gap-1 mb-1 flex-wrap">
              {smsCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {smsCount} SMS
                </Badge>
              )}
              {emailCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {emailCount} Email
                </Badge>
              )}
              {voiceCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {voiceCount} Voice
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Channels</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">${totalCost}</p>
            <p className="text-sm text-muted-foreground">Est. Cost/Contact</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Workflow Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Add steps to see the timeline
              </p>
            ) : (
              steps.map((step, index) => {
                const Icon = getStepIcon(step.type);
                const isLast = index === steps.length - 1;

                return (
                  <div key={step.id} className="flex items-start gap-4 mb-6 last:mb-0">
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center border-2',
                          getStepColor(step.type)
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 h-12 bg-border mt-2" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          Day {index === 0 ? 0 : steps.slice(0, index + 1).reduce((acc, s, i) => i === 0 ? 0 : acc + s.delay_days, 0)}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {step.type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {step.type === 'sms' && (step.template?.slice(0, 80) || 'No message')}
                        {step.type === 'email' && (step.email_subject || 'No subject')}
                        {step.type === 'voice_drop' && (step.voice_script?.slice(0, 80) || 'No script')}
                        {((step.type === 'sms' && step.template && step.template.length > 80) ||
                          (step.type === 'voice_drop' && step.voice_script && step.voice_script.length > 80)) && '...'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <RiTimeLine className="h-4 w-4 text-muted-foreground" />
            <span>
              Send between {settings.send_window_start} - {settings.send_window_end}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <RiCalendarLine className="h-4 w-4 text-muted-foreground" />
            <span>
              {settings.send_days.length === 7
                ? 'Every day'
                : settings.send_days.length === 5
                ? 'Weekdays only'
                : `${settings.send_days.length} days/week`}
            </span>
          </div>
          {settings.stop_on_response && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <RiCheckLine className="h-4 w-4" />
              <span>Stops when contact responds</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
