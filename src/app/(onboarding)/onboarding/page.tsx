// ============================================
// ONBOARDING PAGE - Server Component
// ============================================

import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export default async function OnboardingPage() {
  const context = await getAuthenticatedContext();

  if (!context?.user) {
    redirect('/login');
  }

  if (context?.organization?.onboarding_completed) {
    redirect('/dashboard');
  }

  return (
    <div className="container max-w-3xl py-12">
      <OnboardingWizard
        organization={context.organization}
        user={context.user}
        currentStep={context.organization?.onboarding_step || 0}
      />
    </div>
  );
}
