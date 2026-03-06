// @ts-nocheck
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function MessagingPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('messaging_registrations').select('overall_status').eq('org_id', context.organization.id).maybeSingle();

  if (!data) redirect('/messaging/setup');
  if (data.overall_status === 'active') redirect('/messaging/status');
  redirect('/messaging/status');
}
