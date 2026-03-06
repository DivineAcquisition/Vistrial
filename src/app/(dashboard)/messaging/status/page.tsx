// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { MessagingStatusTracker } from '@/components/messaging/messaging-status-tracker';

export const metadata: Metadata = { title: 'Messaging Status' };
export const dynamic = 'force-dynamic';

export default async function MessagingStatusPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const admin = getSupabaseAdminClient();
  const { data: registration } = await admin.from('messaging_registrations').select('*').eq('org_id', context.organization.id).maybeSingle();

  if (!registration) redirect('/messaging/setup');

  return (
    <div className="max-w-2xl mx-auto space-y-6 dashboard-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messaging Status</h1>
        <p className="text-gray-500 text-sm mt-1">Track the progress of your SMS messaging setup</p>
      </div>
      <MessagingStatusTracker registration={registration} />
    </div>
  );
}
