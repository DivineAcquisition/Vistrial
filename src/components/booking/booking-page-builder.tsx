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
import { ArrowLeft, Save, Loader2, ExternalLink, Palette, Settings, FileText, Copy, Check, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props { organization: any; pricingMatrices: any[]; existingPage?: any; }

export function BookingPageBuilder({ organization, pricingMatrices, existingPage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [fd, setFd] = useState({
    name: existingPage?.name || `${organization.name} Booking`,
    slug: existingPage?.slug || organization.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'booking',
    pricingMatrixId: existingPage?.pricing_matrix_id || '',
    settings: {
      requirePhone: existingPage?.settings?.requirePhone ?? true,
      requireEmail: existingPage?.settings?.requireEmail ?? false,
      requireAddress: existingPage?.settings?.requireAddress ?? false,
      showPricing: existingPage?.settings?.showPricing ?? true,
      showEstimate: existingPage?.settings?.showEstimate ?? true,
      allowDateSelection: existingPage?.settings?.allowDateSelection ?? true,
      allowTimeSelection: existingPage?.settings?.allowTimeSelection ?? false,
      notificationEmail: existingPage?.settings?.notificationEmail || '',
      notificationSms: existingPage?.settings?.notificationSms ?? true,
      confirmationMessage: existingPage?.settings?.confirmationMessage || "Thanks! We'll be in touch shortly.",
    },
    customization: {
      primaryColor: existingPage?.customization?.primaryColor || '#5347d1',
      headline: existingPage?.customization?.headline || `Book with ${organization.name}`,
      subheadline: existingPage?.customization?.subheadline || 'Get an instant quote and schedule your service',
      ctaText: existingPage?.customization?.ctaText || 'Request Booking',
      thankYouMessage: existingPage?.customization?.thankYouMessage || "You're all set! We'll contact you within 24 hours.",
    },
  });

  const set = (path: string, value: any) => {
    setFd(prev => { const n = JSON.parse(JSON.stringify(prev)); const k = path.split('.'); let c: any = n; for (let i = 0; i < k.length - 1; i++) c = c[k[i]]; c[k[k.length - 1]] = value; return n; });
  };

  const handleSave = async () => {
    if (!fd.name || !fd.slug || !fd.pricingMatrixId) { toast({ title: 'Fill in name, URL, and pricing matrix', variant: 'destructive' }); return; }
    setIsSaving(true);
    try {
      const url = existingPage ? `/api/booking/pages/${existingPage.id}` : '/api/booking/pages';
      const res = await fetch(url, { method: existingPage ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fd.name, slug: fd.slug, pricingMatrixId: fd.pricingMatrixId, settings: fd.settings, customization: fd.customization }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast({ title: 'Booking page saved!' }); router.push('/booking');
    } catch (err) { toast({ title: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const bookingUrl = `https://book.vistrial.io/${fd.slug}`;
  const embedCode = `<iframe src="${bookingUrl}?embed=true" width="100%" height="800" frameborder="0"></iframe>`;
  const copyLink = () => { navigator.clipboard.writeText(bookingUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };
  const copyEmbed = () => { navigator.clipboard.writeText(embedCode); setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 2000); };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/booking"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div><h1 className="text-2xl font-bold tracking-tight">{existingPage ? 'Edit Booking Page' : 'New Booking Page'}</h1><p className="text-gray-500 text-sm">Create a booking form for your customers</p></div>
        </div>
        <div className="flex gap-2">
          {existingPage && <a href={bookingUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline"><Eye className="h-4 w-4 mr-2" />Preview</Button></a>}
          <Button onClick={handleSave} disabled={isSaving} variant="gradient">{isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="basics">
            <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="basics"><FileText className="h-4 w-4 mr-2" />Basics</TabsTrigger><TabsTrigger value="customization"><Palette className="h-4 w-4 mr-2" />Customization</TabsTrigger><TabsTrigger value="settings"><Settings className="h-4 w-4 mr-2" />Settings</TabsTrigger></TabsList>

            <TabsContent value="basics" className="space-y-4 mt-4">
              <Card><CardHeader><CardTitle className="text-base">Page Details</CardTitle></CardHeader><CardContent className="space-y-4">
                <div className="space-y-2"><Label>Page Name</Label><Input value={fd.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="space-y-2"><Label>Page URL</Label><div className="flex"><span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 bg-gray-50 text-sm text-gray-500">book.vistrial.io/</span><Input value={fd.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="rounded-l-none" /></div></div>
                <div className="space-y-2"><Label>Pricing Matrix</Label>
                  <Select value={fd.pricingMatrixId} onValueChange={(v) => set('pricingMatrixId', v)}><SelectTrigger><SelectValue placeholder="Select pricing..." /></SelectTrigger><SelectContent>{pricingMatrices.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.services?.length || 0} services)</SelectItem>)}</SelectContent></Select>
                  {pricingMatrices.length === 0 && <p className="text-sm text-gray-500">No pricing matrices. <Link href="/booking/pricing" className="text-brand-600 underline">Create one first</Link></p>}
                </div>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="customization" className="space-y-4 mt-4">
              <Card><CardHeader><CardTitle className="text-base">Branding</CardTitle></CardHeader><CardContent className="space-y-4">
                <div className="space-y-2"><Label>Primary Color</Label><div className="flex gap-2"><Input type="color" value={fd.customization.primaryColor} onChange={(e) => set('customization.primaryColor', e.target.value)} className="w-14 h-10 p-1 cursor-pointer rounded-xl" /><Input value={fd.customization.primaryColor} onChange={(e) => set('customization.primaryColor', e.target.value)} className="flex-1 font-mono" /></div></div>
                <div className="space-y-2"><Label>Headline</Label><Input value={fd.customization.headline} onChange={(e) => set('customization.headline', e.target.value)} /></div>
                <div className="space-y-2"><Label>Subheadline</Label><Input value={fd.customization.subheadline} onChange={(e) => set('customization.subheadline', e.target.value)} /></div>
                <div className="space-y-2"><Label>Button Text</Label><Input value={fd.customization.ctaText} onChange={(e) => set('customization.ctaText', e.target.value)} /></div>
                <div className="space-y-2"><Label>Thank You Message</Label><Textarea value={fd.customization.thankYouMessage} onChange={(e) => set('customization.thankYouMessage', e.target.value)} rows={3} /></div>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-4">
              <Card><CardHeader><CardTitle className="text-base">Form Fields</CardTitle></CardHeader><CardContent className="space-y-5">
                {[
                  { key: 'requirePhone', label: 'Require Phone', desc: 'Phone number is required' },
                  { key: 'requireEmail', label: 'Require Email', desc: 'Email address is required' },
                  { key: 'requireAddress', label: 'Require Address', desc: 'Service address is required' },
                  { key: 'showPricing', label: 'Show Pricing', desc: 'Display prices as customer selects options' },
                  { key: 'allowDateSelection', label: 'Allow Date Selection', desc: 'Let customers pick preferred date' },
                ].map(s => (
                  <div key={s.key} className="flex items-center justify-between">
                    <div><p className="font-medium text-sm">{s.label}</p><p className="text-xs text-gray-500">{s.desc}</p></div>
                    <Switch checked={(fd.settings as any)[s.key]} onCheckedChange={(v) => set(`settings.${s.key}`, v)} />
                  </div>
                ))}
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader><CardContent className="space-y-4">
                <div className="space-y-2"><Label>Notification Email</Label><Input type="email" value={fd.settings.notificationEmail} onChange={(e) => set('settings.notificationEmail', e.target.value)} placeholder="you@example.com" /></div>
                <div className="flex items-center justify-between"><div><p className="font-medium text-sm">SMS Notifications</p><p className="text-xs text-gray-500">Get SMS alerts for new bookings</p></div><Switch checked={fd.settings.notificationSms} onCheckedChange={(v) => set('settings.notificationSms', v)} /></div>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Your Booking Page</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-sm font-mono break-all text-gray-600">{bookingUrl}</p></div>
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={copyLink}>{copiedLink ? <><Check className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy Link</>}</Button><a href={bookingUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink className="h-4 w-4" /></Button></a></div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Embed on Your Website</CardTitle><CardDescription>Add this code to embed the booking form</CardDescription></CardHeader><CardContent className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl"><code className="text-[11px] break-all text-gray-600">{embedCode}</code></div>
            <Button variant="outline" className="w-full" onClick={copyEmbed}>{copiedEmbed ? <><Check className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy Embed Code</>}</Button>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Use in Campaigns</CardTitle><CardDescription>Add this link to SMS/email campaigns for attribution</CardDescription></CardHeader><CardContent>
            <div className="p-3 bg-gray-50 rounded-xl"><code className="text-[11px] break-all text-gray-600">{bookingUrl}?campaign={'{{workflow_id}}'}</code></div>
            <p className="text-[11px] text-gray-400 mt-2">Revenue from this link will be attributed to the campaign</p>
          </CardContent></Card>
        </div>
      </div>
    </>
  );
}
