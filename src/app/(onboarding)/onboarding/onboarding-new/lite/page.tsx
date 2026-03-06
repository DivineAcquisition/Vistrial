// ============================================
// LITE ONBOARDING PAGE
// Self-serve onboarding wizard
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { LiteOnboardingWizard } from '@/components/lite/lite-onboarding-wizard';

export const metadata: Metadata = {
  title: 'Get Started',
};

export default async function LiteOnboardingPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <LiteOnboardingWizard
        organizationId={context.organization.id}
        organizationName={context.organization.name}
      />
    </div>
  );
}
