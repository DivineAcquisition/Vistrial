// @ts-nocheck
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const org = context.organization as Record<string, any>;
  if (org.onboarding_completed) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-[20%] w-[600px] h-[600px] rounded-full bg-brand-400/[0.03] blur-3xl" />
        <div className="absolute bottom-0 left-[10%] w-[500px] h-[500px] rounded-full bg-brand-600/[0.02] blur-3xl" />
      </div>
      <div className="relative container max-w-3xl py-8 md:py-12 px-4">
        <OnboardingWizard organization={context.organization} user={context.user} currentStep={org.onboarding_step || 0} />
      </div>
    </div>
  );
}
