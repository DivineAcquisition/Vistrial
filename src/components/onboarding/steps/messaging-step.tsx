'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, MessageSquare, Shield, Rocket, AlertCircle, CheckCircle } from 'lucide-react';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export function MessagingStep({ organization, messaging, onSubmit, onSkip, onBack }: { organization: any; messaging: any; onSubmit: (data: any) => Promise<any>; onSkip: () => void; onBack: () => void }) {
  const org = (organization || {}) as Record<string, any>;
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [fd, setFd] = useState({
    legal_business_name: messaging?.legal_business_name || org.name || '',
    ein: messaging?.ein || '',
    business_phone: messaging?.business_phone || org.phone || '',
    business_email: messaging?.business_email || org.email || '',
    street: messaging?.street || '',
    city: messaging?.city || org.city || '',
    state: messaging?.state || org.state || '',
    postal_code: messaging?.postal_code || '',
  });

  const formatEin = (val: string) => { const d = val.replace(/\D/g, '').slice(0, 9); return d.length > 2 ? d.slice(0, 2) + '-' + d.slice(2) : d; };

  const handleSubmit = async () => {
    setSaving(true);
    try { await onSubmit(fd); } finally { setSaving(false); }
  };

  const handleSkip = async () => {
    setSkipping(true);
    try { await onSkip(); } finally { setSkipping(false); }
  };

  // If already registered, show status
  if (messaging?.brand_status === 'pending' || messaging?.overall_status === 'active') {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto"><CheckCircle className="h-7 w-7 text-emerald-600" /></div>
          <h3 className="font-semibold text-lg">Messaging {messaging.overall_status === 'active' ? 'Active' : 'Registration Submitted'}!</h3>
          <p className="text-sm text-gray-500">{messaging.overall_status === 'active' ? 'Your SMS campaigns are ready to send.' : 'Verification typically takes 3-7 business days. We\'ll notify you when it\'s active.'}</p>
          <Button onClick={handleSubmit} variant="gradient" size="lg"><Rocket className="h-4 w-4 mr-2" />Go to Dashboard</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-brand-600" />Last step — activate SMS messaging</CardTitle>
        <p className="text-sm text-gray-500">Your conversion sequences are sent via SMS. We need to register your business for compliant messaging.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">Your legal business name must match your IRS records exactly (EIN letter / Form CP-575). Messaging approval takes 3-7 business days.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Legal Business Name <span className="text-red-500">*</span></Label><Input value={fd.legal_business_name} onChange={e => setFd(p => ({ ...p, legal_business_name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">EIN <span className="text-red-500">*</span></Label><Input value={fd.ein} onChange={e => setFd(p => ({ ...p, ein: formatEin(e.target.value) }))} placeholder="XX-XXXXXXX" maxLength={10} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Business Phone <span className="text-red-500">*</span></Label><Input type="tel" value={fd.business_phone} onChange={e => setFd(p => ({ ...p, business_phone: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Business Email <span className="text-red-500">*</span></Label><Input type="email" value={fd.business_email} onChange={e => setFd(p => ({ ...p, business_email: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Street Address <span className="text-red-500">*</span></Label><Input value={fd.street} onChange={e => setFd(p => ({ ...p, street: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">City <span className="text-red-500">*</span></Label><Input value={fd.city} onChange={e => setFd(p => ({ ...p, city: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">State <span className="text-red-500">*</span></Label>
              <Select value={fd.state} onValueChange={v => setFd(p => ({ ...p, state: v }))}><SelectTrigger><SelectValue placeholder="State" /></SelectTrigger><SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">ZIP <span className="text-red-500">*</span></Label><Input value={fd.postal_code} onChange={e => setFd(p => ({ ...p, postal_code: e.target.value }))} maxLength={10} /></div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleSkip} disabled={skipping}>{skipping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Skip for now</Button>
            <Button onClick={handleSubmit} disabled={saving || !fd.legal_business_name || !fd.ein} variant="gradient" size="lg">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}Activate Messaging</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
