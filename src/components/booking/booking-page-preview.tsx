'use client';

// ============================================
// BOOKING PAGE PREVIEW
// Live preview of booking page with full styling support
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, DollarSign, Quote } from 'lucide-react';

interface BookingPagePreviewProps {
  customization: any;
  settings: any;
  pricingMatrix: any;
  organization: any;
}

export function BookingPagePreview({
  customization,
  settings,
  pricingMatrix,
  organization,
}: BookingPagePreviewProps) {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const services = pricingMatrix?.services || [];
  const service = services.find((s: any) => s.id === selectedService);

  const borderRadius = `${customization.borderRadius ?? 12}px`;

  if (showSuccess) {
    return (
      <div
        className="h-full flex items-center justify-center p-8"
        style={{
          fontFamily: customization.fontFamily || 'system-ui',
          backgroundColor: customization.backgroundColor || '#ffffff',
          color: customization.textColor || '#1a1a1a',
        }}
      >
        <div className="text-center max-w-md">
          <div
            className="w-14 h-14 flex items-center justify-center mx-auto mb-4"
            style={{
              backgroundColor: `${customization.primaryColor}15`,
              borderRadius,
            }}
          >
            <CheckCircle
              className="h-7 w-7"
              style={{ color: customization.primaryColor }}
            />
          </div>
          <h2 className="text-xl font-bold mb-2">
            {customization.thankYouTitle || 'Thank you!'}
          </h2>
          <p style={{ opacity: 0.6 }} className="text-sm">
            {customization.thankYouMessage}
          </p>
          <Button
            className="mt-6"
            variant="outline"
            size="sm"
            onClick={() => setShowSuccess(false)}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{
        fontFamily: customization.fontFamily || 'system-ui',
        backgroundColor: customization.backgroundColor || '#ffffff',
        color: customization.textColor || '#1a1a1a',
      }}
    >
      <div className="max-w-xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-6">
          {customization.logo && (
            <img
              src={customization.logo}
              alt=""
              className="h-8 mx-auto mb-3 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <h1 className="text-xl font-bold mb-1">{customization.headline}</h1>
          {customization.subheadline && (
            <p style={{ opacity: 0.5 }} className="text-sm">
              {customization.subheadline}
            </p>
          )}
        </div>

        {/* Testimonial */}
        {customization.showTestimonial && customization.testimonialText && (
          <div
            className="mb-5 p-4 border text-sm italic"
            style={{
              borderRadius,
              backgroundColor: `${customization.primaryColor}08`,
              borderColor: `${customization.primaryColor}20`,
            }}
          >
            <div className="flex gap-2">
              <Quote
                className="h-4 w-4 shrink-0 mt-0.5"
                style={{ color: customization.primaryColor, opacity: 0.5 }}
              />
              <div>
                <p style={{ opacity: 0.7 }}>
                  {customization.testimonialText}
                </p>
                {customization.testimonialAuthor && (
                  <p className="font-medium mt-2 not-italic text-sm">
                    &mdash; {customization.testimonialAuthor}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Service Selection */}
        <div className="mb-5">
          <Label className="text-sm font-semibold mb-2 block">
            Select Service
          </Label>
          <div className="space-y-2">
            {services.length === 0 ? (
              <p
                className="text-sm py-4 text-center"
                style={{ opacity: 0.4 }}
              >
                No services configured
              </p>
            ) : (
              services.slice(0, 3).map((svc: any) => (
                <button
                  key={svc.id}
                  onClick={() => setSelectedService(svc.id)}
                  className="w-full p-3 border text-left transition-all text-sm"
                  style={{
                    borderRadius,
                    borderColor:
                      selectedService === svc.id
                        ? customization.primaryColor
                        : undefined,
                    borderWidth: selectedService === svc.id ? 2 : 1,
                    backgroundColor:
                      selectedService === svc.id
                        ? `${customization.primaryColor}08`
                        : undefined,
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{svc.name}</span>
                    {settings.showPricing && (
                      <span className="text-xs">
                        {svc.priceType === 'quote' ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Quote
                          </Badge>
                        ) : svc.priceType === 'starting_at' ? (
                          `From $${svc.basePrice}`
                        ) : (
                          `$${svc.basePrice}`
                        )}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
            {services.length > 3 && (
              <p
                className="text-xs text-center"
                style={{ opacity: 0.4 }}
              >
                +{services.length - 3} more services
              </p>
            )}
          </div>
        </div>

        {/* Service Options */}
        {service && service.variables?.length > 0 && (
          <div className="mb-5 space-y-3">
            <Label className="text-sm font-semibold">Options</Label>
            {service.variables.slice(0, 2).map((variable: any) => (
              <div key={variable.id} className="space-y-1.5">
                <Label className="text-xs">{variable.name}</Label>
                <Select>
                  <SelectTrigger style={{ borderRadius }}>
                    <SelectValue
                      placeholder={`Select ${variable.name.toLowerCase()}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {variable.options?.map((opt: any) => (
                      <SelectItem key={opt.id} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {/* Date Selection */}
        {settings.allowDateSelection && (
          <div className="mb-5">
            <Label className="text-sm font-semibold mb-2 block">
              Preferred Date
            </Label>
            <Input type="date" className="text-sm" style={{ borderRadius }} />
          </div>
        )}

        {/* Time Selection */}
        {settings.allowTimeSelection && (
          <div className="mb-5">
            <Label className="text-sm font-semibold mb-2 block">
              Preferred Time
            </Label>
            <Input type="time" className="text-sm" style={{ borderRadius }} />
          </div>
        )}

        {/* Contact Info */}
        <div className="mb-5 space-y-3">
          <Label className="text-sm font-semibold mb-2 block">
            Your Information
          </Label>

          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input
              placeholder="Your name"
              className="text-sm"
              style={{ borderRadius }}
            />
          </div>

          {settings.requirePhone && (
            <div className="space-y-1.5">
              <Label className="text-xs">Phone *</Label>
              <Input
                placeholder="(555) 123-4567"
                className="text-sm"
                style={{ borderRadius }}
              />
            </div>
          )}

          {settings.requireEmail && (
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input
                placeholder="you@example.com"
                className="text-sm"
                style={{ borderRadius }}
              />
            </div>
          )}

          {settings.requireAddress && (
            <div className="space-y-1.5">
              <Label className="text-xs">Service Address *</Label>
              <Input
                placeholder="123 Main St"
                className="text-sm"
                style={{ borderRadius }}
              />
            </div>
          )}
        </div>

        {/* Price Summary */}
        {settings.showPricing && service && (
          <div
            className="mb-5 p-4 border"
            style={{
              borderRadius,
              backgroundColor: `${customization.primaryColor}06`,
              borderColor: `${customization.primaryColor}15`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" />
                <span className="font-semibold text-sm">
                  {settings.showEstimate ? 'Estimated Total' : 'Total'}
                </span>
              </div>
              <span className="text-lg font-bold">
                ${service.basePrice || '\u2014'}
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <Button
          className="w-full h-11 text-sm font-semibold"
          style={{
            backgroundColor: customization.primaryColor,
            borderRadius,
            color: '#ffffff',
          }}
          onClick={() => setShowSuccess(true)}
        >
          {customization.ctaText}
        </Button>

        {/* Footer */}
        <div className="mt-6 text-center text-xs" style={{ opacity: 0.4 }}>
          {customization.footerText && (
            <p className="mb-1">{customization.footerText}</p>
          )}
          {customization.showPoweredBy && (
            <p>
              Powered by{' '}
              <span className="underline">Vistrial</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
