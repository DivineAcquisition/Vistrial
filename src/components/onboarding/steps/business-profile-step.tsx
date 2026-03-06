'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, Building2 } from 'lucide-react';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
];

const TOOLS = ['GoHighLevel', 'Jobber', 'Housecall Pro', 'BookingKoala', 'Google Calendar', 'Spreadsheet/Manual', 'Other'];

export function BusinessProfileStep({ organization, user, onSubmit }: { organization: any; user: any; onSubmit: (data: any) => Promise<any> }) {
  const org = organization as Record<string, any>;
  const settings = (org.settings || {}) as Record<string, any>;
  const [saving, setSaving] = useState(false);
  const [fd, setFd] = useState({
    business_name: org.name || '',
    phone: org.phone || '',
    email: org.email || user?.email || '',
    service_areas: (settings.service_areas || []).join(', '),
    timezone: org.timezone || 'America/New_York',
    monthly_cleans: settings.monthly_cleans || '1-10',
    job_tracking_tools: settings.job_tracking_tools || [],
  });

  const toggleTool = (tool: string) => {
    setFd(p => ({ ...p, job_tracking_tools: p.job_tracking_tools.includes(tool) ? p.job_tracking_tools.filter((t: string) => t !== tool) : [...p.job_tracking_tools, tool] }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ ...fd, service_areas: fd.service_areas.split(',').map((s: string) => s.trim()).filter(Boolean) });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-600" />Business Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label className="text-xs">Business Name</Label><Input value={fd.business_name} onChange={e => setFd(p => ({ ...p, business_name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Business Phone</Label><Input type="tel" value={fd.phone} onChange={e => setFd(p => ({ ...p, phone: e.target.value }))} /></div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Business Email</Label><Input type="email" value={fd.email} onChange={e => setFd(p => ({ ...p, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Service Areas</Label><Input value={fd.service_areas} onChange={e => setFd(p => ({ ...p, service_areas: e.target.value }))} placeholder="Silver Spring, Bethesda, Rockville" /><p className="text-[11px] text-gray-400">Comma-separated cities or ZIP codes</p></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label className="text-xs">Timezone</Label>
            <Select value={fd.timezone} onValueChange={v => setFd(p => ({ ...p, timezone: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Monthly One-Time Cleans</Label>
            <Select value={fd.monthly_cleans} onValueChange={v => setFd(p => ({ ...p, monthly_cleans: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['1-10', '10-25', '25-50', '50+'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <div className="space-y-2"><Label className="text-xs">How do you track jobs?</Label>
          <div className="flex flex-wrap gap-2">{TOOLS.map(t => (
            <button key={t} type="button" onClick={() => toggleTool(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${fd.job_tracking_tools.includes(t) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>{t}</button>
          ))}</div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSubmit} disabled={saving || !fd.business_name} variant="gradient" size="lg">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Continue<ArrowRight className="h-4 w-4 ml-2" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
