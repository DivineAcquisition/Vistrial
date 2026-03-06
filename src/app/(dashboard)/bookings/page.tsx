import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import {
  RiCalendarLine,
  RiArrowRightLine,
  RiExternalLinkLine,
} from '@remixicon/react';

export const metadata: Metadata = {
  title: 'Bookings',
};

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const context = await getAuthenticatedContext();

  if (!context?.organization) {
    redirect('/login');
  }

  const { organization } = context;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-500">
            Customer booking page and scheduling
          </p>
        </div>
        <Link
          href={`/book/${organization.slug}`}
          target="_blank"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-all"
        >
          <RiExternalLinkLine className="w-5 h-5" />
          View Booking Page
        </Link>
      </div>

      {/* Booking Page Info */}
      <div className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
        <div className="p-8">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-20 h-20 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-brand-500/20">
              <RiCalendarLine className="w-10 h-10 text-brand-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Your Booking Page
            </h2>
            <p className="text-gray-500 mb-6">
              Share your booking page with customers to let them schedule services directly.
            </p>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-6">
              <p className="text-sm text-gray-500 mb-2">Your booking URL:</p>
              <p className="text-brand-400 font-mono text-sm break-all">
                {typeof window !== 'undefined' 
                  ? `${window.location.origin}/book/${organization.slug}`
                  : `/book/${organization.slug}`
                }
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={`/book/${organization.slug}`}
                target="_blank"
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-all"
              >
                <RiExternalLinkLine className="w-5 h-5" />
                Open Booking Page
              </Link>
              <Link
                href="/settings/organization"
                className="flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-900 rounded-xl font-medium hover:bg-gray-50 transition-all"
              >
                Configure Settings
                <RiArrowRightLine className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Features */}
      <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Coming Soon</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="font-medium text-gray-900 mb-1">Calendar Sync</p>
            <p className="text-sm text-gray-500">
              Sync with Google Calendar and Outlook
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="font-medium text-gray-900 mb-1">Service Packages</p>
            <p className="text-sm text-gray-500">
              Create and manage service offerings
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="font-medium text-gray-900 mb-1">Team Scheduling</p>
            <p className="text-sm text-gray-500">
              Assign bookings to team members
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
