'use client';

// ============================================
// BOOKING FORM COMPONENT
// Dynamic form with real-time price calculation
// ============================================

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, DollarSign } from 'lucide-react';
import { calculatePrice } from '@/lib/booking/calculate-price';
import type { Service } from '@/types/booking';

interface BookingFormProps {
  bookingPage: any;
  pricingMatrix: any;
  organization: any;
  attribution: { source: 'direct' | 'embed' | 'campaign'; campaignId?: string; workflowId?: string };
  isEmbed?: boolean;
}

export function BookingForm({ bookingPage, pricingMatrix, organization, attribution, isEmbed = false }: BookingFormProps) {
  const [step, setStep] = useState<'service' | 'success'>('service');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [preferredDate, setPreferredDate] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', address: '', notes: '' });

  const settings = bookingPage.settings || {};
  const customization = bookingPage.customization || {};
  const services: Service[] = pricingMatrix?.services || [];
  const selectedService = useMemo(() => services.find((s) => s.id === selectedServiceId), [services, selectedServiceId]);
  const priceCalculation = useMemo(() => {
    if (!selectedService) return null;
    return calculatePrice(selectedService, selectedOptions, selectedAddOns);
  }, [selectedService, selectedOptions, selectedAddOns]);

  const handleSubmit = async () => {
    if (!selectedService || !customerInfo.name || !customerInfo.phone) return;
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/public/booking-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingPageId: bookingPage.id,
          organizationId: organization.id,
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          selectedOptions, selectedAddOns,
          estimatedPrice: priceCalculation?.total || 0,
          priceType: priceCalculation?.priceType || 'estimate',
          preferredDate: preferredDate || null,
          customerName: customerInfo.name,
          customerPhone: customerInfo.phone,
          customerEmail: customerInfo.email || null,
          customerAddress: customerInfo.address || null,
          customerNotes: customerInfo.notes || null,
          source: attribution.source,
          campaignId: attribution.campaignId,
          workflowId: attribution.workflowId,
        }),
      });
      if (!response.ok) throw new Error('Failed to submit booking');
      setStep('success');
    } catch (err) {
      setError('Failed to submit. Please try again or contact us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'success') {
    return (
      <Card className={isEmbed ? '' : 'max-w-lg mx-auto mt-12'}>
        <CardContent className="pt-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Booking Request Received!</h2>
          <p className="text-gray-500 mb-4">{customization.thankYouMessage || "We'll be in touch shortly."}</p>
          {priceCalculation && priceCalculation.priceType !== 'quote' && (
            <div className="bg-gray-50 rounded-xl p-4 inline-block">
              <p className="text-sm text-gray-500">Estimated Total</p>
              <p className="text-2xl font-bold text-gray-900">${priceCalculation.total}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={isEmbed ? '' : 'max-w-2xl mx-auto py-8 px-4'}>
      {!isEmbed && (
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">{customization.headline || `Book with ${organization?.name}`}</h1>
          {customization.subheadline && <p className="text-gray-500">{customization.subheadline}</p>}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Service Selection */}
          <Card>
            <CardHeader><CardTitle className="text-lg">1. Select Service</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {services.filter(s => s.active !== false).map((service) => (
                <button
                  key={service.id}
                  onClick={() => { setSelectedServiceId(service.id); setSelectedOptions({}); setSelectedAddOns([]); }}
                  className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${
                    selectedServiceId === service.id ? 'border-brand-500 bg-brand-50/50 shadow-glow-sm' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">{service.name}</p>
                      {service.description && <p className="text-sm text-gray-500 mt-1">{service.description}</p>}
                    </div>
                    <div className="text-right">
                      {service.priceType === 'quote' ? (
                        <Badge variant="secondary">Get Quote</Badge>
                      ) : service.priceType === 'starting_at' ? (
                        <p className="font-semibold text-gray-900">From ${service.basePrice}</p>
                      ) : service.priceType === 'range' ? (
                        <p className="font-semibold text-gray-900">${service.basePrice} - ${service.maxPrice}</p>
                      ) : (
                        <p className="font-semibold text-gray-900">${service.basePrice}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Service Details */}
          {selectedService && selectedService.variables?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">2. Service Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {selectedService.variables.map((variable) => (
                  <div key={variable.id} className="space-y-2">
                    <Label>{variable.name}{variable.required && <span className="text-red-500 ml-1">*</span>}</Label>
                    {variable.type === 'select' && variable.options && (
                      <select
                        className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm"
                        value={selectedOptions[variable.id] || ''}
                        onChange={(e) => setSelectedOptions(prev => ({ ...prev, [variable.id]: e.target.value }))}
                      >
                        <option value="">Select {variable.name.toLowerCase()}</option>
                        {variable.options.map((opt) => (
                          <option key={opt.id} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {variable.type === 'number' && (
                      <Input
                        type="number"
                        min={variable.min} max={variable.max} step={variable.step || 1}
                        value={selectedOptions[variable.id] || ''}
                        onChange={(e) => setSelectedOptions(prev => ({ ...prev, [variable.id]: parseInt(e.target.value) }))}
                        placeholder={variable.unit ? `Enter ${variable.unit}` : ''}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Add-ons */}
          {selectedService && selectedService.addOns?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Add-ons (Optional)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {selectedService.addOns.map((addOn) => (
                  <label
                    key={addOn.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedAddOns.includes(addOn.id) ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedAddOns.includes(addOn.id)}
                        onChange={() => setSelectedAddOns(prev => prev.includes(addOn.id) ? prev.filter(id => id !== addOn.id) : [...prev, addOn.id])}
                        className="rounded border-gray-300"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{addOn.name}</p>
                        {addOn.description && <p className="text-sm text-gray-500">{addOn.description}</p>}
                      </div>
                    </div>
                    <p className="font-medium">+${addOn.price}{addOn.priceType === 'percentage' ? '%' : ''}</p>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Date + Contact */}
          {selectedService && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Your Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {settings.allowDateSelection && (
                  <div className="space-y-2">
                    <Label>Preferred Date</Label>
                    <Input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Name <span className="text-red-500">*</span></Label>
                  <Input value={customerInfo.name} onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))} placeholder="Your full name" required />
                </div>
                <div className="space-y-2">
                  <Label>Phone <span className="text-red-500">*</span></Label>
                  <Input type="tel" value={customerInfo.phone} onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))} placeholder="(555) 123-4567" required />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={customerInfo.email} onChange={(e) => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))} placeholder="you@example.com" />
                </div>
                {settings.requireAddress && (
                  <div className="space-y-2">
                    <Label>Service Address <span className="text-red-500">*</span></Label>
                    <Input value={customerInfo.address} onChange={(e) => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))} placeholder="123 Main St, City, State ZIP" required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={customerInfo.notes} onChange={(e) => setCustomerInfo(prev => ({ ...prev, notes: e.target.value }))} placeholder="Anything else we should know?" rows={3} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Price Summary */}
        <div className="md:col-span-1">
          <div className="sticky top-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  {settings.showEstimate ? 'Your Estimate' : 'Summary'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedService ? (
                  <p className="text-gray-400 text-sm">Select a service to see pricing</p>
                ) : priceCalculation?.priceType === 'quote' ? (
                  <div className="text-center py-4">
                    <Badge variant="secondary" className="text-base px-4 py-2">Quote Required</Badge>
                    <p className="text-sm text-gray-500 mt-2">We&apos;ll provide a custom quote</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm"><span>{selectedService.name}</span><span>${priceCalculation?.basePrice}</span></div>
                    {priceCalculation?.adjustments.map((adj, i) => (
                      <div key={i} className="flex justify-between text-sm text-gray-500">
                        <span>{adj.name}</span><span>{adj.amount >= 0 ? '+' : ''}${adj.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {priceCalculation?.addOns.map((addOn, i) => (
                      <div key={i} className="flex justify-between text-sm text-gray-500">
                        <span>{addOn.name}</span><span>+${addOn.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-3">
                      <div className="flex justify-between font-semibold">
                        <span>{priceCalculation?.priceType === 'estimate' ? 'Estimated Total' : 'Total'}</span>
                        <span className="text-lg">${priceCalculation?.total}</span>
                      </div>
                    </div>
                  </div>
                )}
                {selectedService && (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !customerInfo.name || !customerInfo.phone}
                    className="w-full mt-4"
                    variant="gradient"
                  >
                    {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>) : (customization.ctaText || 'Request Booking')}
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">{organization?.name}</p>
                {organization?.phone && <p className="text-sm text-gray-500">Phone: {organization.phone}</p>}
                {organization?.email && <p className="text-sm text-gray-500">Email: {organization.email}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {!isEmbed && (
        <div className="text-center mt-8">
          <p className="text-xs text-gray-400">Powered by <a href="https://vistrial.io" className="underline">Vistrial</a></p>
        </div>
      )}
    </div>
  );
}
