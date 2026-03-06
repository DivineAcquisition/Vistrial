'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BusinessProfileStep } from './steps/business-profile-step';
import { ServicesStep } from './steps/services-step';
import { OffersStep } from './steps/offers-step';
import { JobSourceStep } from './steps/job-source-step';
import { MessagingStep } from './steps/messaging-step';

const STEPS = [
  { id: 'business_profile', label: 'Business Profile', num: 0 },
  { id: 'services', label: 'Services', num: 1 },
  { id: 'offers', label: 'Offers', num: 2 },
  { id: 'job_source', label: 'Job Source', num: 3 },
  { id: 'messaging', label: 'Messaging', num: 4 },
];

export function OnboardingWizard({ organization, user, currentStep }: { organization: any; user: any; currentStep: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(Math.min(currentStep, 4));
  const [onboardingData, setOnboardingData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/onboarding').then(r => r.json()).then(d => { setOnboardingData(d); setIsLoading(false); }).catch(() => setIsLoading(false));
  }, [step]);

  const submitStep = async (stepId: string, data: any) => {
    try {
      const res = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: stepId, data }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed');

      if (result.completed || stepId === 'messaging' || stepId === 'complete') {
        toast({ title: 'Welcome to Vistrial!', description: 'Your conversion engine is ready.' });
        window.location.href = '/dashboard';
        return;
      }

      setStep(result.step);
      return result;
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Set up your conversion engine</h1>
        <p className="text-gray-500 text-sm mt-1">5 quick steps to start converting one-time clients to recurring revenue</p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between max-w-xl mx-auto">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-gray-200 text-gray-500'
              )}>
                {i < step ? <CheckCircle className="h-5 w-5" /> : i + 1}
              </div>
              <span className={cn('text-[10px] mt-1.5 font-medium', i === step ? 'text-brand-600' : i < step ? 'text-emerald-600' : 'text-gray-400')}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={cn('w-8 md:w-16 h-px mx-1', i < step ? 'bg-emerald-300' : 'bg-gray-200')} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="animate-fade-in">
        {step === 0 && <BusinessProfileStep organization={organization} user={user} onSubmit={(data) => submitStep('business_profile', data)} />}
        {step === 1 && <ServicesStep services={onboardingData?.services || []} onSubmit={(data) => submitStep('services', data)} onBack={() => setStep(0)} />}
        {step === 2 && <OffersStep offers={onboardingData?.offers || []} services={onboardingData?.services || []} onSubmit={(data) => submitStep('offers', data)} onBack={() => setStep(1)} />}
        {step === 3 && <JobSourceStep organization={organization} onSubmit={(data) => submitStep('job_source', data)} onBack={() => setStep(2)} />}
        {step === 4 && <MessagingStep organization={organization} messaging={onboardingData?.messaging} onSubmit={(data) => submitStep('messaging', data)} onSkip={() => submitStep('messaging', { skip: true })} onBack={() => setStep(3)} />}
      </div>
    </div>
  );
}
