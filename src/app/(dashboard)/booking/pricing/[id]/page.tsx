// @ts-nocheck
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PricingMatrixEditor } from '@/components/booking/pricing-matrix-editor';

export const metadata: Metadata = { title: 'Edit Pricing | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function EditPricingPage({ params }: { params: { id: string } }) {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const { data: pricingMatrix, error } = await admin.from('pricing_matrices').select('*').eq('id', params.id).eq('organization_id', context.organization.id).single();
  if (error || !pricingMatrix) notFound();
  return <div className="space-y-6 dashboard-page"><PricingMatrixEditor pricingMatrix={pricingMatrix} /></div>;
}
