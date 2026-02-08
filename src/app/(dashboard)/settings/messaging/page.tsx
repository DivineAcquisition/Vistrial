import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export const metadata: Metadata = { title: 'Messaging Settings | Vistrial' };
export const dynamic = 'force-dynamic';

export default async function MessagingSettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');
  const org = context.organization as Record<string, any>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Messaging Settings</h1>
        <p className="text-gray-500 mt-1">Configure SMS and email messaging defaults</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> SMS Configuration</CardTitle>
          <CardDescription>Your SMS sender number and messaging profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div><p className="font-medium text-sm">Sender Number</p><p className="text-xs text-gray-500">Phone number for outbound SMS</p></div>
            <p className="text-sm text-gray-600 font-mono">{org.telnyx_phone_number || 'Not configured'}</p>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div><p className="font-medium text-sm">Messaging Profile</p><p className="text-xs text-gray-500">Telnyx messaging profile ID</p></div>
            <p className="text-sm text-gray-600 font-mono">{org.telnyx_messaging_profile_id ? '••••' + org.telnyx_messaging_profile_id.slice(-4) : 'Not configured'}</p>
          </div>
          <div className="flex items-center justify-between py-3">
            <div><p className="font-medium text-sm">Sending Hours</p><p className="text-xs text-gray-500">Only send during business hours</p></div>
            <p className="text-sm text-gray-600">9:00 AM - 8:00 PM</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Configuration</CardTitle>
          <CardDescription>Email sending is powered by Resend</CardDescription>
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
