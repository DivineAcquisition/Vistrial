// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PricingMatrixList } from '@/components/booking/pricing-matrix-list';

export const metadata: Metadata = { title: 'Pricing | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const { data: pricingMatrices } = await admin.from('pricing_matrices').select('*').eq('organization_id', context.organization.id).order('created_at', { ascending: false });

  return (
    <div className="space-y-6 dashboard-page">
      <div><h1 className="text-2xl font-bold tracking-tight">Pricing</h1><p className="text-gray-500 text-sm mt-1">Upload your pricing sheet and let AI create your pricing matrix</p></div>
      <PricingMatrixList pricingMatrices={pricingMatrices || []} organizationId={context.organization.id} />
    </div>
  );
}
