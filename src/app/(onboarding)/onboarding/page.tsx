// ============================================
// ONBOARDING PAGE - Server Component
// Flow: Signup → Email Confirm → Auth Callback (creates org) → HERE → Dashboard
// ============================================

import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const context = await getAuthenticatedContext();

  // Not authenticated → login
  if (!context?.user) {
    redirect('/login');
  }

  // Safely cast org
  const org = context.organization as Record<string, any> | null;

  // Already completed onboarding → go to dashboard
  if (org?.onboarding_completed === true) {
    redirect('/dashboard');
  }

  return (
    <div className="container max-w-3xl py-12">
      <OnboardingWizard
        organization={org}
        user={context.user}
        currentStep={org?.onboarding_step || 0}
      />
    </div>
  );
}
