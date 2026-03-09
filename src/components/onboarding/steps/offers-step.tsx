'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, ArrowLeft, DollarSign, Gift } from 'lucide-react';

export function OffersStep({ offers: initial, services, onSubmit, onBack }: { offers: any[]; services: any[]; onSubmit: (data: any) => Promise<any>; onBack: () => void }) {
  const [saving, setSaving] = useState(false);
  const [offers, setOffers] = useState(initial);

  const update = (i: number, field: string, value: any) => {
    const o = [...offers]; o[i] = { ...o[i], [field]: value }; setOffers(o);
  };

  const getPreview = (offer: any) => {
    const freq = offer.frequency === 'weekly' ? 'weekly' : offer.frequency === 'biweekly' ? 'biweekly' : 'monthly';
    const price = Math.round(offer.price_per_visit_cents / 100);
    const discounted = Math.round(price * (1 - (offer.discount_percent || 15) / 100));
    const bonus = offer.bonus_description ? ` Includes ${offer.bonus_description}.` : '';
    return `Lock in ${freq} cleaning at $${discounted}/visit (${offer.discount_percent || 15}% off) for your first ${offer.discount_duration_months || 3} months. Priority scheduling included.${bonus}`;
  };

  const handleSubmit = async () => {
    setSaving(true);
    try { await onSubmit({ offers: offers.map(o => ({ ...o, sms_preview: getPreview(o) })) }); } finally { setSaving(false); }
  };

  const triggerService = (slug: string) => services.find((s: any) => s.slug === slug);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-brand-600" />Your Service Offers</CardTitle>
        <p className="text-sm text-gray-500">These offers are sent to clients automatically through your workflows. Customize anytime in Settings.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {offers.map((offer, i) => {
          const svc = triggerService(offer.trigger_service_slug);
          return (
            <div key={offer.id || i} className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧹</span>
                  <div>
                    <Input value={offer.name} onChange={e => update(i, 'name', e.target.value)} className="font-semibold text-sm bg-transparent border-0 px-0 shadow-none focus:ring-0 max-w-xs" />
                    {svc && <p className="text-[11px] text-gray-400">After a {svc.name}</p>}
                  </div>
                </div>
                <Switch checked={offer.is_active !== false} onCheckedChange={v => update(i, 'is_active', v)} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">Frequency</Label>
                  <Select value={offer.frequency} onValueChange={v => update(i, 'frequency', v)}><SelectTrigger className="text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="biweekly">Biweekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select>
                </div>
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">Price/visit</Label><div className="relative"><DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" /><Input type="number" value={Math.round(offer.price_per_visit_cents / 100)} onChange={e => update(i, 'price_per_visit_cents', (parseInt(e.target.value) || 0) * 100)} className="pl-6 text-xs" /></div></div>
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">Discount %</Label><Input type="number" value={offer.discount_percent} onChange={e => update(i, 'discount_percent', parseInt(e.target.value) || 0)} className="text-xs" /></div>
                <div className="space-y-1"><Label className="text-[10px] text-gray-400">For months</Label><Input type="number" value={offer.discount_duration_months} onChange={e => update(i, 'discount_duration_months', parseInt(e.target.value) || 3)} className="text-xs" /></div>
              </div>
              <div className="space-y-1"><Label className="text-[10px] text-gray-400">Bonus (optional)</Label><Input value={offer.bonus_description || ''} onChange={e => update(i, 'bonus_description', e.target.value)} placeholder="e.g., Free fridge clean" className="text-xs" /></div>
              <div className="p-3 bg-gray-50 rounded-lg"><p className="text-[11px] text-gray-400 mb-1">SMS Preview:</p><p className="text-xs text-gray-600 italic">{getPreview(offer)}</p></div>
            </div>
          );
        })}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <Button onClick={handleSubmit} disabled={saving} variant="gradient" size="lg">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Continue<ArrowRight className="h-4 w-4 ml-2" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
