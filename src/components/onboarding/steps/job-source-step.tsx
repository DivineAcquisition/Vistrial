'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, ArrowLeft, Webhook, Copy, Check, ExternalLink } from 'lucide-react';

const SOURCES = [
  { id: 'ghl', name: 'GoHighLevel', desc: 'Pipeline stage → webhook', color: 'blue' },
  { id: 'jobber', name: 'Jobber', desc: 'Job completed → webhook', color: 'green' },
  { id: 'housecall_pro', name: 'Housecall Pro', desc: 'Job status → webhook', color: 'purple' },
  { id: 'bookingkoala', name: 'BookingKoala', desc: 'Booking complete → webhook', color: 'amber' },
  { id: 'zapier', name: 'Zapier', desc: 'Connect any tool', color: 'orange' },
  { id: 'manual', name: 'Add Jobs Manually', desc: 'Enter from dashboard', color: 'gray' },
];

export function JobSourceStep({ organization, onSubmit, onBack }: { organization: any; onSubmit: (data: any) => Promise<any>; onBack: () => void }) {
  const org = organization as Record<string, any>;
  const settings = (org.settings || {}) as Record<string, any>;
  const tools = settings.job_tracking_tools || [];
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>(settings.job_sources || ['manual']);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://app.vistrial.io'}/api/webhooks/jobs?org=${org.id}`;

  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id]);
  const copyUrl = () => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleSubmit = async () => { setSaving(true); try { await onSubmit({ job_sources: selected }); } finally { setSaving(false); } };

  // Show relevant sources first based on Step 1 tool selection
  const relevantSources = SOURCES.filter(s => {
    if (s.id === 'manual' || s.id === 'zapier') return true;
    if (s.id === 'ghl' && tools.includes('GoHighLevel')) return true;
    if (s.id === 'jobber' && tools.includes('Jobber')) return true;
    if (s.id === 'housecall_pro' && tools.includes('Housecall Pro')) return true;
    if (s.id === 'bookingkoala' && tools.includes('BookingKoala')) return true;
    return !['ghl', 'jobber', 'housecall_pro', 'bookingkoala'].includes(s.id);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5 text-brand-600" />Connect your tools</CardTitle>
        <p className="text-sm text-gray-500">When a job is completed, Vistrial automatically triggers your follow-up workflows.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook URL */}
        <div className="p-4 bg-gray-50 rounded-xl space-y-2">
          <p className="text-xs font-medium text-gray-600">Your Webhook URL</p>
          <div className="flex gap-2">
            <code className="flex-1 text-[11px] bg-white p-2.5 rounded-lg border border-gray-200 font-mono break-all text-gray-600">{webhookUrl}</code>
            <Button variant="outline" size="sm" onClick={copyUrl}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
          </div>
          <p className="text-[11px] text-gray-400">Paste this URL in your booking tool&apos;s webhook settings</p>
        </div>

        {/* Source selection */}
        <div className="grid grid-cols-2 gap-3">
          {relevantSources.map(src => (
            <button key={src.id} onClick={() => toggle(src.id)} className={`p-4 rounded-xl border text-left transition-all ${selected.includes(src.id) ? 'border-brand-300 bg-brand-50/50 ring-1 ring-brand-200' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{src.name}</span>
                {selected.includes(src.id) && <Badge variant="gradient" className="text-[10px]">Selected</Badge>}
              </div>
              <p className="text-[11px] text-gray-500">{src.desc}</p>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center">You can connect multiple sources. Manual entry is always available from your dashboard.</p>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <Button onClick={handleSubmit} disabled={saving} variant="gradient" size="lg">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Continue<ArrowRight className="h-4 w-4 ml-2" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
