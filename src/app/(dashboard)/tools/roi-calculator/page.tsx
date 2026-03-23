// ============================================
// ROI CALCULATOR — Admin-only internal tool
// Route: /tools/roi-calculator
// Protected by dashboard layout (requires auth + onboarding)
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { ROICalculatorClient } from './client';

export const metadata: Metadata = {
  title: 'ROI Calculator | Vistrial Tools',
};

export const dynamic = 'force-dynamic';

export default async function ROICalculatorPage() {
  const context = await getAuthenticatedContext();

  if (!context?.user) {
    redirect('/login');
  }

  const membership = context.membership as Record<string, any> | null;
  if (membership?.role !== 'owner' && membership?.role !== 'admin') {
    redirect('/dashboard');
  }

  const org = context.organization as Record<string, any> | null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Operations Cost Calculator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Calculate the true cost of broken operations and see the ROI of fixing them
        </p>
      </div>
      <ROICalculatorClient businessName={org?.name || ''} />
    </div>
  );
}
