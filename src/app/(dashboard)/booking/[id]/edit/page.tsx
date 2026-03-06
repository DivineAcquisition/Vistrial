// @ts-nocheck
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { BookingPageEditor } from '@/components/booking/booking-page-editor';

export const metadata: Metadata = { title: 'Edit Booking Page | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function EditBookingPageEditorPage({ params }: { params: { id: string } }) {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const { data: bp, error } = await admin.from('booking_pages').select('*, pricing_matrices(*)').eq('id', params.id).eq('organization_id', context.organization.id).single();
  if (error || !bp) notFound();
  const { data: matrices } = await admin.from('pricing_matrices').select('id, name, business_type, services').eq('organization_id', context.organization.id).order('created_at', { ascending: false });
  return <BookingPageEditor bookingPage={bp} pricingMatrices={matrices || []} organization={context.organization} />;
}
