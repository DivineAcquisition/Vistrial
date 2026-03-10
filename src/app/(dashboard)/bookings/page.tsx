import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import {
  RiCalendarLine,
  RiArrowRightLine,
  RiExternalLinkLine,
  RiTimeLine,
  RiCheckLine,
  RiCloseLine,
} from '@remixicon/react';

export const metadata: Metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const { organization } = context;
  const org = organization as Record<string, any>;
  const supabase = await getSupabaseServerClient();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.io';
  const bookingUrl = `${appUrl}/book/${org.slug}`;

  const { count: totalBookings } = await supabase
    .from('booking_requests')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  const { count: pendingBookings } = await supabase
    .from('booking_requests')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'new');

  const { count: confirmedBookings } = await supabase
    .from('booking_requests')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'confirmed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-500">Manage booking requests and scheduling</p>
        </div>
        <Link
          href={bookingUrl}
          target="_blank"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-all text-sm"
        >
          <RiExternalLinkLine className="w-4 h-4" />
          View Booking Page
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <RiCalendarLine className="w-4 h-4" />
            <span className="text-sm">Total Requests</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalBookings || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <RiTimeLine className="w-4 h-4" />
            <span className="text-sm">Pending</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{pendingBookings || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-2">
            <RiCheckLine className="w-4 h-4" />
            <span className="text-sm">Confirmed</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{confirmedBookings || 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="max-w-lg">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Your Booking URL</h2>
          <p className="text-gray-500 text-sm mb-4">Share this with clients so they can book directly.</p>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-brand-600 font-mono text-sm break-all">{bookingUrl}</p>
          </div>
        </div>
      </div>

      {(totalBookings || 0) > 0 && (
        <div className="flex justify-end">
          <Link
            href="/booking/requests"
            className="inline-flex items-center gap-2 text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
          >
            View all booking requests
            <RiArrowRightLine className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
