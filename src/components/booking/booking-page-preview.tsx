'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, DollarSign } from 'lucide-react';

export function BookingPagePreview({ customization, settings, pricingMatrix, organization }: { customization: any; settings: any; pricingMatrix: any; organization: any }) {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const services = pricingMatrix?.services || [];
  const service = services.find((s: any) => s.id === selectedService);

  if (showSuccess) {
    return (
      <div className="h-full flex items-center justify-center p-8" style={{ fontFamily: customization.fontFamily || 'system-ui' }}>
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${customization.primaryColor}15` }}><CheckCircle className="h-7 w-7" style={{ color: customization.primaryColor }} /></div>
          <h2 className="text-xl font-bold mb-2">{customization.thankYouTitle || 'Thank you!'}</h2>
          <p className="text-gray-500 text-sm">{customization.thankYouMessage}</p>
          <Button className="mt-6" variant="outline" size="sm" onClick={() => setShowSuccess(false)}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ fontFamily: customization.fontFamily || 'system-ui' }}>
      <div className="max-w-xl mx-auto p-6">
        <div className="text-center mb-6">
          {customization.logo && <img src={customization.logo} alt="" className="h-8 mx-auto mb-3 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
          <h1 className="text-xl font-bold mb-1">{customization.headline}</h1>
          {customization.subheadline && <p className="text-gray-500 text-sm">{customization.subheadline}</p>}
        </div>

        {customization.showTestimonial && customization.testimonialText && (
          <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm italic text-gray-600">
            &ldquo;{customization.testimonialText}&rdquo;
            {customization.testimonialAuthor && <p className="font-medium mt-2 not-italic text-gray-900">— {customization.testimonialAuthor}</p>}
          </div>
        )}

        <div className="mb-5"><Label className="text-sm font-semibold mb-2 block">Select Service</Label>
          <div className="space-y-2">
            {services.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No services configured</p> : services.slice(0, 3).map((svc: any) => (
              <button key={svc.id} onClick={() => setSelectedService(svc.id)} className={`w-full p-3 rounded-xl border text-left transition-all text-sm ${selectedService === svc.id ? 'border-2' : 'hover:border-gray-300'}`} style={{ borderColor: selectedService === svc.id ? customization.primaryColor : undefined, backgroundColor: selectedService === svc.id ? `${customization.primaryColor}08` : undefined }}>
                <div className="flex justify-between items-center"><span className="font-medium">{svc.name}</span>{settings.showPricing && <span className="text-xs">{svc.priceType === 'quote' ? <Badge variant="secondary" className="text-[10px]">Quote</Badge> : `$${svc.basePrice}`}</span>}</div>
              </button>
            ))}
          </div>
        </div>

        {settings.allowDateSelection && <div className="mb-5"><Label className="text-sm font-semibold mb-2 block">Preferred Date</Label><Input type="date" className="text-sm" /></div>}

        <div className="mb-5 space-y-3"><Label className="text-sm font-semibold mb-2 block">Your Information</Label>
          <div className="space-y-1.5"><Label className="text-xs">Name *</Label><Input placeholder="Your name" className="text-sm" /></div>
          {settings.requirePhone && <div className="space-y-1.5"><Label className="text-xs">Phone *</Label><Input placeholder="(555) 123-4567" className="text-sm" /></div>}
          {settings.requireEmail && <div className="space-y-1.5"><Label className="text-xs">Email *</Label><Input placeholder="you@example.com" className="text-sm" /></div>}
          {settings.requireAddress && <div className="space-y-1.5"><Label className="text-xs">Address *</Label><Input placeholder="123 Main St" className="text-sm" /></div>}
        </div>

        {settings.showPricing && service && (
          <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between"><div className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" /><span className="font-semibold text-sm">{settings.showEstimate ? 'Estimated Total' : 'Total'}</span></div><span className="text-lg font-bold">${service.basePrice || '—'}</span></div>
          </div>
        )}

        <Button className="w-full h-11 text-sm font-semibold" style={{ backgroundColor: customization.primaryColor }} onClick={() => setShowSuccess(true)}>{customization.ctaText}</Button>

        <div className="mt-6 text-center text-xs text-gray-400">
          {customization.showPoweredBy && <p>Powered by <span className="underline">Vistrial</span></p>}
        </div>
      </div>
    </div>
  );
}
