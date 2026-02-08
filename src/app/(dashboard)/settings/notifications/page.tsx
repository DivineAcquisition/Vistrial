// ============================================
// NOTIFICATION SETTINGS PAGE
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { NotificationSettingsForm } from '@/components/settings/notification-settings-form';

export const metadata: Metadata = { title: 'Notification Settings | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization || !context?.user) redirect('/login');

  const admin = getSupabaseAdminClient();
  const org = context.organization as Record<string, any>;

  const [{ data: userData }, { data: orgData }] = await Promise.all([
    admin.from('users').select('notification_preferences').eq('id', context.user.id).maybeSingle(),
    admin.from('organizations').select('notification_settings, email, phone').eq('id', org.id).single(),
  ]);

  const membership = context.membership as Record<string, any> | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="text-gray-500 mt-1">Control how and when you receive notifications</p>
      </div>
      <NotificationSettingsForm
        userPreferences={userData?.notification_preferences || {}}
        orgSettings={orgData?.notification_settings || {}}
        orgEmail={orgData?.email || ''}
        orgPhone={orgData?.phone || ''}
        isOwner={membership?.role === 'owner' || membership?.role === 'admin'}
      />
    </div>
  );
}
