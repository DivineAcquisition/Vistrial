// @ts-nocheck
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { MessagingSetupForm } from '@/components/messaging/messaging-setup-form';

export const metadata: Metadata = { title: 'Activate Messaging | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function MessagingSetupPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from('messaging_registrations').select('*').eq('org_id', context.organization.id).maybeSingle();

  // If already submitted, redirect to status page
  if (existing && existing.brand_status !== 'failed') {
    redirect('/messaging/status');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 dashboard-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activate Messaging</h1>
        <p className="text-gray-500 text-sm mt-1">Set up compliant SMS messaging for your business. This is a one-time setup that takes about 2 minutes.</p>
      </div>
      <MessagingSetupForm organization={context.organization} existingRegistration={existing} />
    </div>
  );
}
