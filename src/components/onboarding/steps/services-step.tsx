'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowRight, ArrowLeft, Plus, Sparkles } from 'lucide-react';

export function ServicesStep({ services: initial, onSubmit, onBack }: { services: any[]; onSubmit: (data: any) => Promise<any>; onBack: () => void }) {
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState(initial.length > 0 ? initial : []);

  const update = (i: number, field: string, value: any) => {
    const s = [...services]; s[i] = { ...s[i], [field]: value }; setServices(s);
  };

  const addService = () => {
    setServices([...services, { name: '', slug: '', min_price_cents: 15000, max_price_cents: 25000, avg_duration_minutes: 120, is_active: true, sort_order: services.length }]);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try { await onSubmit({ services }); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-600" />What cleaning services do you offer?</CardTitle>
        <p className="text-sm text-gray-500">We&apos;ll use this to match one-time clients with the right recurring offer.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {services.map((svc, i) => (
          <div key={svc.id || i} className={`p-4 rounded-xl border transition-all ${svc.is_active ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-gray-50/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <Input value={svc.name} onChange={e => update(i, 'name', e.target.value)} className="font-semibold text-sm max-w-xs bg-transparent border-0 px-0 focus:ring-0 shadow-none" placeholder="Service name" />
              <Switch checked={svc.is_active} onCheckedChange={v => update(i, 'is_active', v)} />
            </div>
            {svc.is_active && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">Min Price</Label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span><Input type="number" value={Math.round(svc.min_price_cents / 100)} onChange={e => update(i, 'min_price_cents', (parseInt(e.target.value) || 0) * 100)} className="pl-6 text-sm" /></div></div>
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">Max Price</Label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span><Input type="number" value={Math.round(svc.max_price_cents / 100)} onChange={e => update(i, 'max_price_cents', (parseInt(e.target.value) || 0) * 100)} className="pl-6 text-sm" /></div></div>
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">Duration (hrs)</Label><Input type="number" step="0.5" value={(svc.avg_duration_minutes || 120) / 60} onChange={e => update(i, 'avg_duration_minutes', Math.round((parseFloat(e.target.value) || 2) * 60))} className="text-sm" /></div>
              </div>
            )}
          </div>
        ))}
        <button onClick={addService} className="w-full p-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-all flex items-center justify-center gap-2"><Plus className="h-4 w-4" />Add Custom Service</button>
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <Button onClick={handleSubmit} disabled={saving} variant="gradient" size="lg">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Continue<ArrowRight className="h-4 w-4 ml-2" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
