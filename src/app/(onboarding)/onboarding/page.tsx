import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const context = await getAuthenticatedContext();

  if (!context?.user) {
    redirect('/login');
  }

  const org = context.organization as Record<string, any> | null;

  if (org?.onboarding_completed === true) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container max-w-3xl py-12">
        <OnboardingWizard
          organization={org}
          user={context.user}
          currentStep={org?.onboarding_step || 0}
        />
      </div>
    </div>
  );
}
