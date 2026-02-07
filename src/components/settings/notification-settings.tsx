'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save, Bell, Mail, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props { settings: Record<string, any>; onSave: (s: any) => Promise<void>; }

export function NotificationSettings({ settings: init, onSave }: Props) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [s, setS] = useState(init);

  const handleSave = async () => { setIsSaving(true); try { await onSave(s); toast({ title: 'Saved!' }); } catch { toast({ title: 'Failed', variant: 'destructive' }); } finally { setIsSaving(false); } };

  return (
    <div className="space-y-6">
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" />Notification Contact</CardTitle><CardDescription>Where should we send your notifications?</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2"><Label>Email Address</Label><Input type="email" value={s.notificationEmail || ''} onChange={(e) => setS({ ...s, notificationEmail: e.target.value })} placeholder="you@example.com" /></div>
        <div className="space-y-2"><Label>Phone Number (for SMS)</Label><Input type="tel" value={s.notificationPhone || ''} onChange={(e) => setS({ ...s, notificationPhone: e.target.value })} placeholder="(555) 123-4567" /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Booking Notifications</CardTitle><CardDescription>Get notified when customers submit booking requests</CardDescription></CardHeader><CardContent className="space-y-4">
        {[{ key: 'bookingEmailEnabled', icon: Mail, label: 'Email Notifications', desc: 'Receive detailed booking info via email' }, { key: 'bookingSmsEnabled', icon: MessageSquare, label: 'SMS Notifications', desc: 'Get instant SMS alerts for new bookings' }].map(n => (
          <div key={n.key} className="flex items-center justify-between"><div className="flex items-center gap-3"><n.icon className="h-5 w-5 text-gray-400" /><div><p className="font-medium text-sm">{n.label}</p><p className="text-xs text-gray-500">{n.desc}</p></div></div><Switch checked={s[n.key] ?? true} onCheckedChange={(v) => setS({ ...s, [n.key]: v })} /></div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Campaign Response Notifications</CardTitle></CardHeader><CardContent className="space-y-4">
        {[{ key: 'responseEmailEnabled', icon: Mail, label: 'Email Notifications', desc: 'Receive response details via email' }, { key: 'responseSmsEnabled', icon: MessageSquare, label: 'SMS Notifications', desc: 'Get instant SMS alerts for responses' }].map(n => (
          <div key={n.key} className="flex items-center justify-between"><div className="flex items-center gap-3"><n.icon className="h-5 w-5 text-gray-400" /><div><p className="font-medium text-sm">{n.label}</p><p className="text-xs text-gray-500">{n.desc}</p></div></div><Switch checked={s[n.key] ?? true} onCheckedChange={(v) => setS({ ...s, [n.key]: v })} /></div>
        ))}
      </CardContent></Card>

      <div className="flex justify-end"><Button onClick={handleSave} disabled={isSaving} variant="gradient">{isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Settings</Button></div>
    </div>
  );
}
