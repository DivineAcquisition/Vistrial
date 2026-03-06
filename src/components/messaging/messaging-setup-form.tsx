'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Shield, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export function MessagingSetupForm({ organization, existingRegistration }: { organization: any; existingRegistration: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fd, setFd] = useState({
    legal_business_name: existingRegistration?.legal_business_name || organization.name || '',
    ein: existingRegistration?.ein || '',
    business_phone: existingRegistration?.business_phone || organization.phone || '',
    business_email: existingRegistration?.business_email || organization.email || '',
    street: existingRegistration?.street || organization.address_line1 || '',
    city: existingRegistration?.city || organization.city || '',
    state: existingRegistration?.state || organization.state || '',
    postal_code: existingRegistration?.postal_code || organization.zip_code || '',
  });

  const set = (k: string, v: string) => setFd(p => ({ ...p, [k]: v }));

  const formatEin = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 9);
    if (digits.length > 2) return digits.slice(0, 2) + '-' + digits.slice(2);
    return digits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fd.legal_business_name || !fd.ein || !fd.business_phone || !fd.business_email || !fd.street || !fd.city || !fd.state || !fd.postal_code) {
      toast({ title: 'All fields are required', variant: 'destructive' }); return;
    }
    if (fd.ein.replace(/\D/g, '').length !== 9) {
      toast({ title: 'EIN must be 9 digits (XX-XXXXXXX)', variant: 'destructive' }); return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/messaging/a2p/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      toast({ title: 'Brand registration submitted!', description: 'Verification typically takes 1-3 business days.' });
      router.push('/messaging/status');
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Setup failed', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info banner */}
      <div className="flex gap-3 p-4 bg-brand-50 rounded-2xl border border-brand-100">
        <Info className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-brand-900">Why do we need this?</p>
          <p className="text-xs text-brand-700 mt-0.5">US carriers require business verification before sending SMS. This one-time setup ensures your messages are delivered reliably and aren&apos;t flagged as spam.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-brand-600" />Business Information</CardTitle>
          <CardDescription>Enter your business details exactly as they appear on your IRS EIN letter (Form CP-575)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Legal Business Name <span className="text-red-500">*</span></Label>
            <Input value={fd.legal_business_name} onChange={(e) => set('legal_business_name', e.target.value)} placeholder="Exact name on IRS records" required />
            <p className="text-[11px] text-amber-600">Must match your IRS records exactly. This is the #1 reason for rejection.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">EIN (Federal Tax ID) <span className="text-red-500">*</span></Label>
            <Input value={fd.ein} onChange={(e) => set('ein', formatEin(e.target.value))} placeholder="XX-XXXXXXX" maxLength={10} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Business Phone <span className="text-red-500">*</span></Label>
              <Input type="tel" value={fd.business_phone} onChange={(e) => set('business_phone', e.target.value)} placeholder="+1 (555) 123-4567" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Business Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={fd.business_email} onChange={(e) => set('business_email', e.target.value)} placeholder="owner@business.com" required />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Business Address</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Street Address <span className="text-red-500">*</span></Label>
            <Input value={fd.street} onChange={(e) => set('street', e.target.value)} placeholder="123 Main St" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">City <span className="text-red-500">*</span></Label>
              <Input value={fd.city} onChange={(e) => set('city', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State <span className="text-red-500">*</span></Label>
              <Select value={fd.state} onValueChange={(v) => set('state', v)}>
                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ZIP Code <span className="text-red-500">*</span></Label>
              <Input value={fd.postal_code} onChange={(e) => set('postal_code', e.target.value)} maxLength={10} required />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost breakdown */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm"><span className="text-gray-500">Brand Registration (one-time)</span><span className="font-medium">$4</span></div>
          <div className="flex items-center justify-between text-sm mt-2"><span className="text-gray-500">Campaign Registration (quarterly)</span><span className="font-medium">$30</span></div>
          <div className="flex items-center justify-between text-sm mt-2"><span className="text-gray-500">Local Phone Number (monthly)</span><span className="font-medium">~$1-2/mo</span></div>
          <div className="h-px bg-gray-100 my-3" />
          <div className="flex items-center justify-between"><span className="text-sm font-medium">Setup Total</span><Badge variant="gradient">~$35 one-time</Badge></div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={isSubmitting} className="w-full" variant="gradient" size="lg">
        {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting Registration...</> : <><MessageSquare className="h-4 w-4 mr-2" />Activate Messaging</>}
      </Button>

      <p className="text-center text-[11px] text-gray-400">Verification typically takes 1-3 business days. Your campaigns will start automatically once approved.</p>
    </form>
  );
}
