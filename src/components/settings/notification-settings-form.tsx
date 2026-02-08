'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, MessageSquare, Bell, Calendar, TrendingUp } from 'lucide-react';

interface NotificationSettingsFormProps {
  userPreferences: any;
  orgSettings: any;
  orgEmail: string;
  orgPhone: string;
  isOwner: boolean;
}

export function NotificationSettingsForm({
  userPreferences, orgSettings, orgEmail, orgPhone, isOwner,
}: NotificationSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [personal, setPersonal] = useState({
    emailEnabled: userPreferences.email ?? true,
    smsEnabled: userPreferences.sms ?? false,
    pushEnabled: userPreferences.push ?? true,
  });

  const [business, setBusiness] = useState({
    bookingEmail: orgSettings.booking_email ?? true,
    bookingSms: orgSettings.booking_sms ?? true,
    responseEmail: orgSettings.response_email ?? true,
    responseSms: orgSettings.response_sms ?? false,
    weeklyDigest: orgSettings.weekly_digest ?? true,
    usageAlerts: orgSettings.usage_alerts ?? true,
  });

  const [contacts, setContacts] = useState({
    notificationEmail: orgEmail,
    notificationPhone: orgPhone,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personal,
          business: isOwner ? business : undefined,
          contacts: isOwner ? contacts : undefined,
        }),
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
      toast({ title: 'Notification settings saved!' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Failed to save', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Personal Notifications</CardTitle>
          <CardDescription>How you want to receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'emailEnabled', label: 'Email Notifications', desc: 'Receive notifications via email', icon: Mail },
            { key: 'smsEnabled', label: 'SMS Notifications', desc: 'Receive notifications via text message', icon: MessageSquare },
            { key: 'pushEnabled', label: 'Push Notifications', desc: 'Receive browser/app push notifications', icon: Bell },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
              <Switch checked={(personal as any)[item.key]} onCheckedChange={(v) => setPersonal((p) => ({ ...p, [item.key]: v }))} />
            </div>
          ))}
        </CardContent>
      </Card>

      {isOwner && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Booking Notifications</CardTitle>
              <CardDescription>Get notified when customers submit booking requests</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Notification Email</Label>
                  <Input type="email" value={contacts.notificationEmail} onChange={(e) => setContacts((p) => ({ ...p, notificationEmail: e.target.value }))} placeholder="bookings@yourbusiness.com" />
                </div>
                <div className="space-y-2">
                  <Label>Notification Phone</Label>
                  <Input type="tel" value={contacts.notificationPhone} onChange={(e) => setContacts((p) => ({ ...p, notificationPhone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                </div>
              </div>
              {[
                { key: 'bookingEmail', label: 'Email on New Booking', desc: 'Send email when a booking request is submitted' },
                { key: 'bookingSms', label: 'SMS on New Booking', desc: 'Send text message when a booking request is submitted' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div><p className="font-medium text-sm">{item.label}</p><p className="text-xs text-gray-500">{item.desc}</p></div>
                  <Switch checked={(business as any)[item.key]} onCheckedChange={(v) => setBusiness((p) => ({ ...p, [item.key]: v }))} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Response Notifications</CardTitle>
              <CardDescription>Get notified when customers respond to campaigns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'responseEmail', label: 'Email on Response', desc: 'Send email when a customer responds' },
                { key: 'responseSms', label: 'SMS on Response', desc: 'Send text message when a customer responds' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div><p className="font-medium text-sm">{item.label}</p><p className="text-xs text-gray-500">{item.desc}</p></div>
                  <Switch checked={(business as any)[item.key]} onCheckedChange={(v) => setBusiness((p) => ({ ...p, [item.key]: v }))} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Reports & Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Receive a weekly summary of campaign performance' },
                { key: 'usageAlerts', label: 'Usage Alerts', desc: 'Get notified when approaching plan limits' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div><p className="font-medium text-sm">{item.label}</p><p className="text-xs text-gray-500">{item.desc}</p></div>
                  <Switch checked={(business as any)[item.key]} onCheckedChange={(v) => setBusiness((p) => ({ ...p, [item.key]: v }))} />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading} variant="gradient" className="rounded-xl">
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}
