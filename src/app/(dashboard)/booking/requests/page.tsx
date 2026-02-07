// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { BookingRequestsList } from '@/components/booking/booking-requests-list';

export const metadata: Metadata = { title: 'Booking Requests | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function BookingRequestsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const admin = getSupabaseAdminClient();
  const { data: requests } = await admin.from('booking_requests').select('*, booking_pages(name, slug)').eq('organization_id', context.organization.id).order('created_at', { ascending: false });
  return (
    <div className="space-y-6 dashboard-page">
      <div><h1 className="text-2xl font-bold tracking-tight">Booking Requests</h1><p className="text-gray-500 text-sm mt-1">Manage incoming booking requests from your customers</p></div>
      <BookingRequestsList requests={requests || []} />
    </div>
  );
}
