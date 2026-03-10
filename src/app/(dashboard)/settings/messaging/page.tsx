import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RiMessageLine, RiMailLine, RiExternalLinkLine } from '@remixicon/react';

export const metadata: Metadata = { title: 'Messaging Settings' };
export const dynamic = 'force-dynamic';

export default async function MessagingSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const org = context.organization as Record<string, any>;
  const settings = (org.settings || {}) as Record<string, any>;
  const conversionSettings = settings.conversion_settings || {};

  const admin = getSupabaseAdminClient();
  const { data: registration } = await admin
    .from('messaging_registrations')
    .select('overall_status, telnyx_phone_number, telnyx_messaging_profile_id')
    .eq('org_id', org.id)
    .maybeSingle();

  const sendingHoursStart = conversionSettings.working_hours?.start || settings.business_hours?.start || '09:00';
  const sendingHoursEnd = conversionSettings.working_hours?.end || settings.business_hours?.end || '20:00';
  const workingDays = conversionSettings.working_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const maxPerDay = conversionSettings.max_messages_per_day_per_contact || 2;

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h12}:${m} ${ampm}`;
  };

  const phoneNumber = registration?.telnyx_phone_number || org.telnyx_phone_number;
  const profileId = registration?.telnyx_messaging_profile_id || org.telnyx_messaging_profile_id;
  const messagingStatus = registration?.overall_status || 'not_configured';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messaging Settings</h1>
          <p className="text-gray-500 mt-1">Configure SMS and email messaging defaults</p>
        </div>
        {messagingStatus !== 'active' && (
          <Link
            href="/messaging/setup"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Activate Messaging
            <RiExternalLinkLine className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><RiMessageLine className="h-4 w-4" /> SMS Configuration</CardTitle>
          <CardDescription>Your SMS sender number and messaging profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div><p className="font-medium text-sm">Status</p><p className="text-xs text-gray-500">A2P registration status</p></div>
            <span className={`px-2.5 py-1 text-xs font-medium rounded-lg ${
              messagingStatus === 'active' ? 'bg-emerald-50 text-emerald-700' :
              messagingStatus === 'pending_approval' ? 'bg-blue-50 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {messagingStatus === 'active' ? 'Active' :
               messagingStatus === 'pending_approval' ? 'Pending Approval' :
               'Not Configured'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div><p className="font-medium text-sm">Sender Number</p><p className="text-xs text-gray-500">Phone number for outbound SMS</p></div>
            <p className="text-sm text-gray-600 font-mono">{phoneNumber || 'Not configured'}</p>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div><p className="font-medium text-sm">Sending Hours</p><p className="text-xs text-gray-500">Messages only send during these hours</p></div>
            <p className="text-sm text-gray-600">{formatTime(sendingHoursStart)} - {formatTime(sendingHoursEnd)}</p>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div><p className="font-medium text-sm">Active Days</p><p className="text-xs text-gray-500">Days when messages are sent</p></div>
            <p className="text-sm text-gray-600 capitalize">{workingDays.length} days/week</p>
          </div>
          <div className="flex items-center justify-between py-3">
            <div><p className="font-medium text-sm">Max Per Contact</p><p className="text-xs text-gray-500">Maximum messages per contact per day</p></div>
            <p className="text-sm text-gray-600">{maxPerDay} messages/day</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><RiMailLine className="h-4 w-4" /> Email Configuration</CardTitle>
          <CardDescription>Email sending powered by Resend</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3">
            <div><p className="font-medium text-sm">From Address</p><p className="text-xs text-gray-500">Emails are sent from this address</p></div>
            <p className="text-sm text-gray-600 font-mono">noreply@mail.vistrial.io</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
