'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Save, Plus, Trash2, GripVertical, DollarSign, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Service, PricingVariable, AddOn } from '@/types/booking';

export function PricingMatrixEditor({ pricingMatrix }: { pricingMatrix: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(pricingMatrix.name);
  const [services, setServices] = useState<Service[]>(pricingMatrix.services || []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/booking/pricing-matrix/${pricingMatrix.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, services }) });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Pricing saved!' }); router.refresh();
    } catch { toast({ title: 'Save failed', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const addService = () => setServices([...services, { id: `svc_${Date.now()}`, name: 'New Service', description: '', basePrice: 100, priceType: 'fixed', variables: [], addOns: [], active: true }]);
  const updateService = (i: number, u: Partial<Service>) => { const s = [...services]; s[i] = { ...s[i], ...u }; setServices(s); };
  const deleteService = (i: number) => setServices(services.filter((_, idx) => idx !== i));
  const addVariable = (si: number) => { const s = [...services]; s[si].variables.push({ id: `var_${Date.now()}`, name: 'New Option', type: 'select', required: true, options: [{ id: `opt_${Date.now()}`, label: 'Option 1', value: 'option_1', priceModifier: { type: 'add', value: 0 } }] }); setServices(s); };
  const deleteVariable = (si: number, vi: number) => { const s = [...services]; s[si].variables.splice(vi, 1); setServices(s); };
  const addOption = (si: number, vi: number) => { const s = [...services]; s[si].variables[vi].options?.push({ id: `opt_${Date.now()}`, label: 'New', value: `opt_${Date.now()}`, priceModifier: { type: 'add', value: 0 } }); setServices(s); };
  const updateOption = (si: number, vi: number, oi: number, u: any) => { const s = [...services]; const opts = s[si].variables[vi].options; if (opts) opts[oi] = { ...opts[oi], ...u }; setServices(s); };
  const deleteOption = (si: number, vi: number, oi: number) => { const s = [...services]; s[si].variables[vi].options?.splice(oi, 1); setServices(s); };
  const addAddOn = (si: number) => { const s = [...services]; s[si].addOns.push({ id: `addon_${Date.now()}`, name: 'New Add-on', price: 25, priceType: 'fixed' }); setServices(s); };
  const updateAddOn = (si: number, ai: number, u: Partial<AddOn>) => { const s = [...services]; s[si].addOns[ai] = { ...s[si].addOns[ai], ...u }; setServices(s); };
  const deleteAddOn = (si: number, ai: number) => { const s = [...services]; s[si].addOns.splice(ai, 1); setServices(s); };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/booking/pricing"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{name}</h1>{pricingMatrix.source_document && <Badge variant="gradient"><Sparkles className="h-3 w-3 mr-1" />AI Generated</Badge>}</div>
            <p className="text-gray-500 text-sm">{services.length} services configured</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving} variant="gradient">{isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Changes</Button>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Basic Info</CardTitle></CardHeader><CardContent><div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div></CardContent></Card>

      <Card>
        <CardHeader><div className="flex items-center justify-between"><div><CardTitle>Services</CardTitle><CardDescription>Configure your services and pricing options</CardDescription></div><Button onClick={addService} variant="outline"><Plus className="h-4 w-4 mr-2" />Add Service</Button></div></CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-3">
            {services.map((service, si) => (
              <AccordionItem key={service.id} value={service.id} className="border rounded-xl px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-4 flex-1"><GripVertical className="h-4 w-4 text-gray-400" /><div className="flex-1 text-left"><p className="font-semibold text-sm">{service.name}</p><p className="text-xs text-gray-400">{service.priceType === 'quote' ? 'Quote required' : `$${service.basePrice}`} · {service.variables.length} options · {service.addOns.length} add-ons</p></div></div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Service Name</Label><Input value={service.name} onChange={(e) => updateService(si, { name: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Base Price</Label><div className="flex gap-2">
                      <Select value={service.priceType} onValueChange={(v) => updateService(si, { priceType: v as any })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="starting_at">From</SelectItem><SelectItem value="range">Range</SelectItem><SelectItem value="quote">Quote</SelectItem></SelectContent></Select>
                      {service.priceType !== 'quote' && <div className="relative flex-1"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input type="number" value={service.basePrice} onChange={(e) => updateService(si, { basePrice: parseFloat(e.target.value) || 0 })} className="pl-8" /></div>}
                    </div></div>
                  </div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={service.description || ''} onChange={(e) => updateService(si, { description: e.target.value })} rows={2} /></div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><Label>Pricing Options</Label><Button variant="outline" size="sm" onClick={() => addVariable(si)}><Plus className="h-3 w-3 mr-1" />Add Option</Button></div>
                    {service.variables.map((v, vi) => (
                      <Card key={v.id} className="p-4 bg-gray-50/50 border-gray-200/60">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between"><Input value={v.name} onChange={(e) => { const s = [...services]; s[si].variables[vi] = { ...v, name: e.target.value }; setServices(s); }} className="max-w-xs font-medium" /><Button variant="ghost" size="icon" onClick={() => deleteVariable(si, vi)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>
                          <div className="space-y-2 pl-4">
                            {v.options?.map((opt, oi) => (
                              <div key={opt.id} className="flex items-center gap-2">
                                <Input value={opt.label} onChange={(e) => updateOption(si, vi, oi, { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="flex-1" placeholder="Label" />
                                <Select value={opt.priceModifier.type} onValueChange={(t) => updateOption(si, vi, oi, { priceModifier: { ...opt.priceModifier, type: t } })}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add">+$</SelectItem><SelectItem value="fixed">= $</SelectItem><SelectItem value="percentage">%</SelectItem><SelectItem value="multiply">×</SelectItem></SelectContent></Select>
                                <Input type="number" value={opt.priceModifier.value} onChange={(e) => updateOption(si, vi, oi, { priceModifier: { ...opt.priceModifier, value: parseFloat(e.target.value) || 0 } })} className="w-20" />
                                <Button variant="ghost" size="icon" onClick={() => deleteOption(si, vi, oi)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                              </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={() => addOption(si, vi)} className="text-gray-400"><Plus className="h-3 w-3 mr-1" />Add choice</Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><Label>Add-ons</Label><Button variant="outline" size="sm" onClick={() => addAddOn(si)}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                    {service.addOns.map((a, ai) => (
                      <div key={a.id} className="flex items-center gap-2">
                        <Input value={a.name} onChange={(e) => updateAddOn(si, ai, { name: e.target.value })} className="flex-1" />
                        <div className="relative w-24"><DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" /><Input type="number" value={a.price} onChange={(e) => updateAddOn(si, ai, { price: parseFloat(e.target.value) || 0 })} className="pl-6" /></div>
                        <Button variant="ghost" size="icon" onClick={() => deleteAddOn(si, ai)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t"><Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteService(si)}><Trash2 className="h-4 w-4 mr-2" />Delete Service</Button></div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {services.length === 0 && <div className="text-center py-12"><p className="text-gray-400 mb-4">No services yet</p><Button onClick={addService} variant="gradient"><Plus className="h-4 w-4 mr-2" />Add Your First Service</Button></div>}
        </CardContent>
      </Card>
    </>
  );
}
