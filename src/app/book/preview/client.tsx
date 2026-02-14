'use client';

// ============================================
// BOOKING FORM PREVIEW — Client Component
// Renders the booking form with hardcoded demo data
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import {
  Loader2,
  CheckCircle,
  DollarSign,
  ArrowLeft,
} from 'lucide-react';

// Demo services
const DEMO_SERVICES = [
  {
    id: 'deep-clean',
    name: 'Deep Cleaning',
    description: 'Full deep clean of your entire home including baseboards, cabinets, and appliances',
    basePrice: 249,
    priceType: 'starting_at' as const,
    active: true,
  },
  {
    id: 'standard-clean',
    name: 'Standard Cleaning',
    description: 'Regular maintenance cleaning — dusting, vacuuming, mopping, bathrooms, kitchen',
    basePrice: 149,
    priceType: 'fixed' as const,
    active: true,
  },
  {
    id: 'move-out',
    name: 'Move-Out Cleaning',
    description: 'Complete top-to-bottom cleaning to get your deposit back',
    basePrice: 299,
    maxPrice: 499,
    priceType: 'range' as const,
    active: true,
  },
  {
    id: 'custom',
    name: 'Custom Service',
    description: 'Tell us what you need and we\'ll provide a personalized quote',
    basePrice: 0,
    priceType: 'quote' as const,
    active: true,
  },
];

const DEMO_ORG = {
  name: 'Sparkle Cleaning Co.',
  phone: '(410) 555-0123',
  email: 'hello@sparklecleaningco.com',
};

export function BookingFormPreviewClient() {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>('standard-clean');
  const [preferredDate, setPreferredDate] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectedService = DEMO_SERVICES.find((s) => s.id === selectedServiceId);

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Booking Request Received!</h2>
            <p className="text-gray-500 mb-6">We&apos;ll be in touch shortly to confirm your appointment.</p>
            <p className="text-xs text-gray-400 mb-4">(This is a preview — no data was submitted)</p>
            <Button variant="outline" onClick={() => setSubmitted(false)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to form
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/vsds.png" alt="Vistrial" width={120} height={60} className="h-8 w-auto object-contain" />
            <Badge variant="secondary" className="text-xs">Preview Mode</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Book with {DEMO_ORG.name}</h1>
          <p className="text-gray-500">Select a service and fill in your details to request an appointment</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Service Selection */}
            <Card>
              <CardHeader><CardTitle className="text-lg">1. Select Service</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {DEMO_SERVICES.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => setSelectedServiceId(service.id)}
                    className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${
                      selectedServiceId === service.id
                        ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{service.name}</p>
                        <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
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

            {/* Contact Info */}
            {selectedService && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Your Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Preferred Date</Label>
                    <Input
                      type="date"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Name <span className="text-red-500">*</span></Label>
                    <Input
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Your full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone <span className="text-red-500">*</span></Label>
                    <Input
                      type="tel"
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={customerInfo.email}
                      onChange={(e) => setCustomerInfo((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Service Address <span className="text-red-500">*</span></Label>
                    <Input
                      value={customerInfo.address}
                      onChange={(e) => setCustomerInfo((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="123 Main St, City, State ZIP"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={customerInfo.notes}
                      onChange={(e) => setCustomerInfo((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Anything else we should know?"
                      rows={3}
                    />
                  </div>

                  {/* SMS Consent (TCPA compliance) */}
                  <div className="flex items-start gap-3 mt-4">
                    <Checkbox
                      id="smsConsent"
                      checked={smsConsent}
                      onCheckedChange={(checked) => setSmsConsent(checked === true)}
                    />
                    <label
                      htmlFor="smsConsent"
                      className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
                    >
                      I agree to receive SMS messages from {DEMO_ORG.name} including
                      appointment reminders and promotional offers. Message frequency
                      varies. Msg &amp; data rates may apply. Reply STOP to unsubscribe.
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Price Summary Sidebar */}
          <div className="md:col-span-1">
            <div className="sticky top-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Your Estimate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedService ? (
                    <p className="text-gray-400 text-sm">Select a service to see pricing</p>
                  ) : selectedService.priceType === 'quote' ? (
                    <div className="text-center py-4">
                      <Badge variant="secondary" className="text-base px-4 py-2">Quote Required</Badge>
                      <p className="text-sm text-gray-500 mt-2">We&apos;ll provide a custom quote</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>{selectedService.name}</span>
                        <span>
                          {selectedService.priceType === 'starting_at' && 'From '}
                          ${selectedService.basePrice}
                        </span>
                      </div>
                      <div className="border-t pt-3">
                        <div className="flex justify-between font-semibold">
                          <span>Estimated Total</span>
                          <span className="text-lg">${selectedService.basePrice}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedService && (
                    <Button
                      onClick={() => setSubmitted(true)}
                      disabled={!customerInfo.name || !customerInfo.phone || !smsConsent}
                      className="w-full mt-4"
                    >
                      Request Booking
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm font-medium mb-2">{DEMO_ORG.name}</p>
                  <p className="text-sm text-gray-500">Phone: {DEMO_ORG.phone}</p>
                  <p className="text-sm text-gray-500">Email: {DEMO_ORG.email}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <p className="text-xs text-gray-400">
            Powered by <a href="https://vistrial.io" className="underline">Vistrial</a>
          </p>
        </div>
      </div>
    </div>
  );
}
