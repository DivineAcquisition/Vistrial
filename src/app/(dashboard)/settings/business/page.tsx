// ============================================
// BUSINESS SETTINGS PAGE
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { BusinessSettingsForm } from '@/components/settings/business-settings-form';

export const metadata: Metadata = { title: 'Business Settings' };
export const dynamic = 'force-dynamic';

export default async function BusinessSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const admin = getSupabaseAdminClient();
  const org = context.organization as Record<string, any>;

  const { data: organization } = await admin
    .from('organizations')
    .select('*')
    .eq('id', org.id)
    .single();

  if (!organization) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Settings</h1>
        <p className="text-gray-500 mt-1">Manage your business information and branding</p>
      </div>
      <BusinessSettingsForm organization={organization} />
    </div>
  );
}
