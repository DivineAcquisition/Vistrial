// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { BookingPageBuilder } from '@/components/booking/booking-page-builder';

export const metadata: Metadata = { title: 'New Booking Page | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function NewBookingPagePage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const { data: pricingMatrices } = await admin.from('pricing_matrices').select('id, name, business_type, services').eq('organization_id', context.organization.id).order('created_at', { ascending: false });
  return <div className="space-y-6 dashboard-page"><BookingPageBuilder organization={context.organization} pricingMatrices={pricingMatrices || []} /></div>;
}
