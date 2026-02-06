'use client';

// ============================================
// LITE ONBOARDING WIZARD
// 4-step self-serve onboarding
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  RiCheckLine,
  RiUpload2Line,
  RiFileTextLine,
  RiSendPlaneLine,
  RiSparklingLine,
} from '@remixicon/react';
import { LiteUploadStep } from './onboarding-steps/lite-upload-step';
import { LiteTemplateStep } from './onboarding-steps/lite-template-step';
import { LiteCustomizeStep } from './onboarding-steps/lite-customize-step';
import { LiteLaunchStep } from './onboarding-steps/lite-launch-step';
import { useToast } from '@/hooks/use-toast';

interface LiteOnboardingWizardProps {
  organizationId: string;
  organizationName: string;
}

export type OnboardingStep = 'upload' | 'template' | 'customize' | 'launch';

export interface OnboardingData {
  contactsUploaded: number;
  selectedTemplate: string | null;
  customizations: {
    businessName: string;
    bookingLink: string;
    reviewLink: string;
  };
  workflowId: string | null;
}

const STEPS = [
  { id: 'upload', label: 'Upload Contacts', icon: RiUpload2Line },
  { id: 'template', label: 'Pick Template', icon: RiFileTextLine },
  { id: 'customize', label: 'Customize', icon: RiSparklingLine },
  { id: 'launch', label: 'Launch', icon: RiSendPlaneLine },
];

export function LiteOnboardingWizard({
  organizationId,
  organizationName,
}: LiteOnboardingWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('upload');
  const [data, setData] = useState<OnboardingData>({
    contactsUploaded: 0,
    selectedTemplate: null,
    customizations: {
      businessName: organizationName,
      bookingLink: '',
      reviewLink: '',
    },
    workflowId: null,
  });

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id as OnboardingStep);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id as OnboardingStep);
    }
  };

  const handleComplete = () => {
    toast({
      title: '🎉 Campaign launched!',
      description: 'Your reactivation campaign is now running.',
    });
    router.push('/dashboard');
  };

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <Badge className="mb-4 bg-green-100 text-green-700 ring-green-600/20">
          Vistrial Lite Setup
        </Badge>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Let&apos;s get your first campaign running
        </h1>
        <p className="text-gray-600">
          This takes about 5 minutes. You can always change things later.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <Progress value={progress} className="h-2 mb-4" />
        <div className="flex justify-between">
          {STEPS.map((step, index) => {
            const isComplete = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const Icon = step.icon;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 ${
                  isCurrent
                    ? 'text-green-600'
                    : isComplete
                    ? 'text-green-600'
                    : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isComplete
                      ? 'bg-green-600 text-white'
                      : isCurrent
                      ? 'bg-green-100 text-green-600 border-2 border-green-600'
                      : 'bg-gray-100'
                  }`}
                >
                  {isComplete ? (
                    <RiCheckLine className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className="hidden sm:inline text-sm font-medium">
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="bg-white border-gray-200">
        <CardContent className="pt-6">
          {currentStep === 'upload' && (
            <LiteUploadStep
              organizationId={organizationId}
              onComplete={(count) => {
                updateData({ contactsUploaded: count });
                handleNext();
              }}
            />
          )}

          {currentStep === 'template' && (
            <LiteTemplateStep
              selectedTemplate={data.selectedTemplate}
              onSelect={(template) => {
                updateData({ selectedTemplate: template });
                handleNext();
              }}
              onBack={handleBack}
            />
          )}

          {currentStep === 'customize' && (
            <LiteCustomizeStep
              template={data.selectedTemplate!}
              customizations={data.customizations}
              onUpdate={(customizations) => updateData({ customizations })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 'launch' && (
            <LiteLaunchStep
              data={data}
              organizationId={organizationId}
              onLaunch={handleComplete}
              onBack={handleBack}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
