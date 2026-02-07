'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Loader2, Eye, EyeOff, Monitor, Smartphone, Palette, Settings, FileText, Code, Copy, Check, ExternalLink, Type, Layout, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import { BookingPagePreview } from './booking-page-preview';
import { EmbedCodeGenerator } from './embed-code-generator';

const PRESET_COLORS = ['#5347d1', '#2563eb', '#7c3aed', '#059669', '#dc2626', '#ea580c', '#db2777', '#0d9488'];

export function BookingPageEditor({ bookingPage, pricingMatrices, organization }: { bookingPage: any; pricingMatrices: any[]; organization: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [copiedLink, setCopiedLink] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [fd, setFd] = useState({
    name: bookingPage.name || '', slug: bookingPage.slug || '', pricingMatrixId: bookingPage.pricing_matrix_id || '', active: bookingPage.active ?? true,
    settings: { requirePhone: bookingPage.settings?.requirePhone ?? true, requireEmail: bookingPage.settings?.requireEmail ?? false, requireAddress: bookingPage.settings?.requireAddress ?? false, showPricing: bookingPage.settings?.showPricing ?? true, showEstimate: bookingPage.settings?.showEstimate ?? true, allowDateSelection: bookingPage.settings?.allowDateSelection ?? true, allowTimeSelection: bookingPage.settings?.allowTimeSelection ?? false, notificationEmail: bookingPage.settings?.notificationEmail || '', notificationSms: bookingPage.settings?.notificationSms ?? true, confirmationMessage: bookingPage.settings?.confirmationMessage || "Thanks! We'll be in touch shortly." },
    customization: { logo: bookingPage.customization?.logo || '', primaryColor: bookingPage.customization?.primaryColor || '#5347d1', headline: bookingPage.customization?.headline || `Book with ${organization.name}`, subheadline: bookingPage.customization?.subheadline || 'Get an instant quote and schedule your service', ctaText: bookingPage.customization?.ctaText || 'Request Booking', thankYouTitle: bookingPage.customization?.thankYouTitle || 'Booking Request Received!', thankYouMessage: bookingPage.customization?.thankYouMessage || "You're all set! We'll contact you within 24 hours.", showPoweredBy: bookingPage.customization?.showPoweredBy ?? true, showTestimonial: bookingPage.customization?.showTestimonial ?? false, testimonialText: bookingPage.customization?.testimonialText || '', testimonialAuthor: bookingPage.customization?.testimonialAuthor || '' },
    seo: { metaTitle: bookingPage.seo?.metaTitle || '', metaDescription: bookingPage.seo?.metaDescription || '' },
  });

  const set = (path: string, value: any) => { setHasChanges(true); setFd(prev => { const n = JSON.parse(JSON.stringify(prev)); const k = path.split('.'); let c: any = n; for (let i = 0; i < k.length - 1; i++) c = c[k[i]]; c[k[k.length - 1]] = value; return n; }); };

  const handleSave = async () => {
    if (!fd.name || !fd.slug) { toast({ title: 'Name and URL required', variant: 'destructive' }); return; }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/booking/pages/${bookingPage.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fd.name, slug: fd.slug, pricingMatrixId: fd.pricingMatrixId, active: fd.active, settings: fd.settings, customization: fd.customization, seo: fd.seo }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setHasChanges(false); toast({ title: 'Saved!' }); router.refresh();
    } catch (e) { toast({ title: e instanceof Error ? e.message : 'Failed', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const url = `https://vistrial.io/book/${fd.slug}`;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-4 md:-m-8 lg:-mt-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/booking"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div><div className="flex items-center gap-2"><h1 className="font-semibold text-sm">{fd.name || 'Untitled'}</h1>{hasChanges && <Badge variant="outline" className="text-[10px]">Unsaved</Badge>}</div><p className="text-[11px] text-gray-400">vistrial.io/book/{fd.slug}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5">
            <Button variant={previewDevice === 'desktop' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setPreviewDevice('desktop')}><Monitor className="h-3.5 w-3.5" /></Button>
            <Button variant={previewDevice === 'mobile' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setPreviewDevice('mobile')}><Smartphone className="h-3.5 w-3.5" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>{showPreview ? <><EyeOff className="h-3.5 w-3.5 mr-1" />Hide</> : <><Eye className="h-3.5 w-3.5 mr-1" />Preview</>}</Button>
          <a href={url} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1" />Live</Button></a>
          <Button onClick={handleSave} disabled={isSaving} size="sm" variant="gradient">{isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save</Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={cn('border-r bg-white overflow-y-auto', showPreview ? 'w-[380px] shrink-0' : 'flex-1 max-w-2xl mx-auto')}>
          <Tabs defaultValue="content" className="h-full">
            <div className="sticky top-0 bg-white border-b z-10">
              <TabsList className="w-full justify-start rounded-none h-11 px-2">
                <TabsTrigger value="content" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Content</TabsTrigger>
                <TabsTrigger value="design" className="gap-1.5 text-xs"><Palette className="h-3.5 w-3.5" />Design</TabsTrigger>
                <TabsTrigger value="form" className="gap-1.5 text-xs"><Layout className="h-3.5 w-3.5" />Form</TabsTrigger>
                <TabsTrigger value="seo" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" />SEO</TabsTrigger>
                <TabsTrigger value="embed" className="gap-1.5 text-xs"><Code className="h-3.5 w-3.5" />Embed</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="content" className="p-4 space-y-5 mt-0">
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Page Info</Label>
                <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={fd.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">URL Slug</Label><div className="flex"><span className="inline-flex items-center px-2.5 rounded-l-xl border border-r-0 bg-gray-50 text-xs text-gray-400">/book/</span><Input value={fd.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="rounded-l-none" /></div></div>
                <div className="space-y-1.5"><Label className="text-xs">Pricing Matrix</Label><Select value={fd.pricingMatrixId} onValueChange={(v) => set('pricingMatrixId', v)}><SelectTrigger className="text-xs"><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{pricingMatrices.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex items-center justify-between"><div><p className="text-xs font-medium">Active</p></div><Switch checked={fd.active} onCheckedChange={(v) => set('active', v)} /></div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Header</Label>
                <div className="space-y-1.5"><Label className="text-xs">Logo URL</Label><Input value={fd.customization.logo} onChange={(e) => set('customization.logo', e.target.value)} placeholder="https://..." /></div>
                <div className="space-y-1.5"><Label className="text-xs">Headline</Label><Input value={fd.customization.headline} onChange={(e) => set('customization.headline', e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Subheadline</Label><Input value={fd.customization.subheadline} onChange={(e) => set('customization.subheadline', e.target.value)} /></div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Button & Thank You</Label>
                <div className="space-y-1.5"><Label className="text-xs">Button Text</Label><Input value={fd.customization.ctaText} onChange={(e) => set('customization.ctaText', e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Thank You Title</Label><Input value={fd.customization.thankYouTitle} onChange={(e) => set('customization.thankYouTitle', e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Thank You Message</Label><Textarea value={fd.customization.thankYouMessage} onChange={(e) => set('customization.thankYouMessage', e.target.value)} rows={2} /></div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="space-y-3"><div className="flex items-center justify-between"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Testimonial</Label><Switch checked={fd.customization.showTestimonial} onCheckedChange={(v) => set('customization.showTestimonial', v)} /></div>
                {fd.customization.showTestimonial && <><div className="space-y-1.5"><Label className="text-xs">Quote</Label><Textarea value={fd.customization.testimonialText} onChange={(e) => set('customization.testimonialText', e.target.value)} rows={2} /></div><div className="space-y-1.5"><Label className="text-xs">Author</Label><Input value={fd.customization.testimonialAuthor} onChange={(e) => set('customization.testimonialAuthor', e.target.value)} /></div></>}
              </div>
            </TabsContent>

            <TabsContent value="design" className="p-4 space-y-5 mt-0">
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Brand Color</Label>
                <div className="flex gap-2"><Input type="color" value={fd.customization.primaryColor} onChange={(e) => set('customization.primaryColor', e.target.value)} className="w-12 h-10 p-1 cursor-pointer rounded-xl" /><Input value={fd.customization.primaryColor} onChange={(e) => set('customization.primaryColor', e.target.value)} className="flex-1 font-mono text-xs" /></div>
                <div className="flex gap-1.5">{PRESET_COLORS.map(c => <button key={c} className={cn('w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110', fd.customization.primaryColor === c ? 'border-gray-900 scale-110' : 'border-transparent')} style={{ backgroundColor: c }} onClick={() => set('customization.primaryColor', c)} />)}</div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Footer</Label>
                <div className="flex items-center justify-between"><p className="text-xs">Show Powered by Vistrial</p><Switch checked={fd.customization.showPoweredBy} onCheckedChange={(v) => set('customization.showPoweredBy', v)} /></div>
              </div>
            </TabsContent>

            <TabsContent value="form" className="p-4 space-y-5 mt-0">
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Required Fields</Label>
                {[{ k: 'requirePhone', l: 'Phone Number' }, { k: 'requireEmail', l: 'Email' }, { k: 'requireAddress', l: 'Service Address' }].map(f => (
                  <div key={f.k} className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80"><p className="text-sm font-medium">{f.l}</p><Switch checked={(fd.settings as any)[f.k]} onCheckedChange={(v) => set(`settings.${f.k}`, v)} /></div>
                ))}
              </div>
              <div className="h-px bg-gray-100" />
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Display</Label>
                {[{ k: 'showPricing', l: 'Show Pricing' }, { k: 'showEstimate', l: 'Label as Estimate' }, { k: 'allowDateSelection', l: 'Date Selection' }, { k: 'allowTimeSelection', l: 'Time Selection' }].map(f => (
                  <div key={f.k} className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80"><p className="text-sm font-medium">{f.l}</p><Switch checked={(fd.settings as any)[f.k]} onCheckedChange={(v) => set(`settings.${f.k}`, v)} /></div>
                ))}
              </div>
              <div className="h-px bg-gray-100" />
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notifications</Label>
                <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={fd.settings.notificationEmail} onChange={(e) => set('settings.notificationEmail', e.target.value)} placeholder="you@example.com" /></div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80"><p className="text-sm font-medium">SMS Alerts</p><Switch checked={fd.settings.notificationSms} onCheckedChange={(v) => set('settings.notificationSms', v)} /></div>
              </div>
            </TabsContent>

            <TabsContent value="seo" className="p-4 space-y-5 mt-0">
              <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SEO</Label>
                <div className="space-y-1.5"><Label className="text-xs">Meta Title</Label><Input value={fd.seo.metaTitle} onChange={(e) => set('seo.metaTitle', e.target.value)} placeholder={`Book with ${organization.name}`} /><p className="text-[11px] text-gray-400">{fd.seo.metaTitle?.length || 0}/60</p></div>
                <div className="space-y-1.5"><Label className="text-xs">Meta Description</Label><Textarea value={fd.seo.metaDescription} onChange={(e) => set('seo.metaDescription', e.target.value)} rows={2} /><p className="text-[11px] text-gray-400">{fd.seo.metaDescription?.length || 0}/160</p></div>
              </div>
            </TabsContent>

            <TabsContent value="embed" className="p-4 mt-0"><EmbedCodeGenerator bookingUrl={url} slug={fd.slug} primaryColor={fd.customization.primaryColor} /></TabsContent>
          </Tabs>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="flex-1 bg-gray-100/50 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0"><div className="flex items-center gap-2"><Eye className="h-3.5 w-3.5 text-gray-400" /><span className="text-xs font-medium text-gray-500">Preview</span></div></div>
            <div className="flex-1 overflow-auto p-4 flex justify-center">
              <div className={cn('bg-white rounded-2xl shadow-soft-lg overflow-hidden transition-all duration-300 border border-gray-200/60', previewDevice === 'mobile' ? 'w-[375px]' : 'w-full max-w-3xl')} style={{ minHeight: previewDevice === 'mobile' ? '667px' : '500px' }}>
                <BookingPagePreview customization={fd.customization} settings={fd.settings} pricingMatrix={pricingMatrices.find(p => p.id === fd.pricingMatrixId)} organization={organization} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
