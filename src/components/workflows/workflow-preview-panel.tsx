// @ts-nocheck
'use client';

// ============================================
// WORKFLOW PREVIEW PANEL
// Visual preview of the workflow
// ============================================

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  Phone,
  Clock,
  Users,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import type { WorkflowStep, WorkflowSettings, EnrollmentCriteria } from '@/types/workflows';
import { cn } from '@/lib/utils/cn';

interface WorkflowPreviewPanelProps {
  name: string;
  description: string;
  steps: WorkflowStep[];
  settings: WorkflowSettings;
  criteria: EnrollmentCriteria;
}

export function WorkflowPreviewPanel({
  name,
  description,
  steps,
  settings,
  criteria,
}: WorkflowPreviewPanelProps) {
  const totalDays = steps.reduce((acc, step) => acc + (step.delay_days || 0), 0);
  const smsCount = steps.filter((s) => s.type === 'sms').length;
  const voiceCount = steps.filter((s) => s.type === 'voice_drop').length;

  // Estimate cost
  const estimatedSmsCost = smsCount * 0.015;
  const estimatedVoiceCost = voiceCount * 0.05;
  const totalCostPerContact = estimatedSmsCost + estimatedVoiceCost;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="bg-white/80 border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Workflow Summary</CardTitle>
          <CardDescription className="text-gray-400">
            Review your workflow before saving
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{steps.length}</p>
              <p className="text-sm text-gray-400">Total Steps</p>
            </div>
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{totalDays}</p>
              <p className="text-sm text-gray-400">Days Duration</p>
            </div>
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{smsCount + voiceCount}</p>
              <p className="text-sm text-gray-400">Messages</p>
            </div>
            <div className="text-center p-4 bg-gray-800/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">${totalCostPerContact.toFixed(2)}</p>
              <p className="text-sm text-gray-400">Per Contact</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="bg-white/80 border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Message Timeline</CardTitle>
          <CardDescription className="text-gray-400">
            Visual representation of the workflow sequence
          </CardDescription>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No steps added yet
            </p>
          ) : (
            <div className="relative">
              {steps.map((step, index) => {
                let dayOffset = 0;
                for (let i = 0; i <= index; i++) {
                  if (i > 0) dayOffset += steps[i].delay_days || 0;
                }

                return (
                  <div key={step.id} className="flex gap-4 mb-6 last:mb-0">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
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
                      {index < steps.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-100 mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="border-gray-300 text-gray-400">Day {dayOffset}</Badge>
                        <span className="font-medium text-gray-900">
                          {step.type === 'sms' ? 'SMS Message' : 'Voice Drop'}
                        </span>
                      </div>
                      <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300">
                        {step.template
                          .replace('{{first_name}}', 'John')
                          .replace('{{last_name}}', 'Smith')
                          .replace('{{business_name}}', 'Your Business')
                          .replace('{{business_phone}}', '(555) 123-4567')
                          .replace('{{review_link}}', '[review link]')
                          .replace('{{booking_link}}', '[booking link]')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-white/80 border-gray-200">
          <CardHeader>
            <CardTitle className="text-base text-gray-900">Send Window</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Clock className="h-4 w-4 text-gray-500" />
              <span>
                {settings.send_window_start} - {settings.send_window_end}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="capitalize">{settings.send_days.join(', ')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.stop_on_response && (
                <Badge variant="secondary" className="bg-gray-800 text-gray-400">Stop on response</Badge>
              )}
              {settings.stop_on_booking && (
                <Badge variant="secondary" className="bg-gray-800 text-gray-400">Stop on booking</Badge>
              )}
              {settings.respect_timezone && (
                <Badge variant="secondary" className="bg-gray-800 text-gray-400">Respect timezone</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 border-gray-200">
          <CardHeader>
            <CardTitle className="text-base text-gray-900">Enrollment Criteria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="capitalize">
                {criteria.status?.join(', ') || 'All statuses'}
              </span>
            </div>
            {criteria.last_contacted_before_days && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="h-4 w-4 text-gray-500" />
                <span>Not contacted in {criteria.last_contacted_before_days} days</span>
              </div>
            )}
            {criteria.last_job_before_days && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="h-4 w-4 text-gray-500" />
                <span>No job in {criteria.last_job_before_days} days</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {criteria.has_phone && (
                <Badge variant="secondary" className="bg-gray-800 text-gray-400">Has phone</Badge>
              )}
              {criteria.has_email && (
                <Badge variant="secondary" className="bg-gray-800 text-gray-400">Has email</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
