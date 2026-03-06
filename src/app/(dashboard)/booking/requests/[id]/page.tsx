// @ts-nocheck
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { BookingRequestDetail } from '@/components/booking/booking-request-detail';

export const metadata: Metadata = { title: 'Booking Request | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function BookingRequestDetailPage({ params }: { params: { id: string } }) {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();

  const { data: request, error } = await admin.from('booking_requests').select('*, booking_pages(id, name, slug, customization), contacts(id, first_name, last_name, phone, email, status, created_at)').eq('id', params.id).eq('organization_id', context.organization.id).single();
  if (error || !request) notFound();

  const { data: activities } = await admin.from('booking_request_activities').select('*').eq('booking_request_id', params.id).order('created_at', { ascending: false });

  let pricingMatrix = null;
  if (request.booking_page_id) {
    const { data: bp } = await admin.from('booking_pages').select('pricing_matrices(*)').eq('id', request.booking_page_id).single();
    pricingMatrix = bp?.pricing_matrices;
  }

  return <BookingRequestDetail request={request} activities={activities || []} pricingMatrix={pricingMatrix} organizationId={context.organization.id} />;
}
