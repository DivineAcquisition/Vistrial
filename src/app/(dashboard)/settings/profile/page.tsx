// ============================================
// PROFILE SETTINGS PAGE - Server Component
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ProfileSettingsForm } from '@/components/settings/profile-settings-form';

export const metadata: Metadata = {
  title: 'Profile Settings | Vistrial',
};

export const dynamic = 'force-dynamic';

export default async function ProfileSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.user) redirect('/login');

  const admin = getSupabaseAdminClient();

  // Fetch user data from auth + custom table
  const userMeta = context.user.user_metadata || {};

  // Try to get extended user data from users table
  const { data: userData } = await admin
    .from('users')
    .select('*')
    .eq('id', context.user.id)
    .maybeSingle();

  const user = {
    id: context.user.id,
    email: context.user.email || '',
    firstName: userData?.first_name || userMeta.first_name || userMeta.full_name?.split(' ')[0] || '',
    lastName: userData?.last_name || userMeta.last_name || userMeta.full_name?.split(' ').slice(1).join(' ') || '',
    phone: userData?.phone || '',
    avatarUrl: userData?.avatar_url || '',
    timezone: userData?.timezone || 'America/New_York',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-500 mt-1">Manage your personal information and preferences</p>
      </div>
      <ProfileSettingsForm user={user} />
    </div>
  );
}
