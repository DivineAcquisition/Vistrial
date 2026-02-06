'use client';

// ============================================
// LITE CUSTOMIZE STEP
// Customize template variables
// ============================================

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RiArrowLeftLine, RiArrowRightLine } from '@remixicon/react';

interface LiteCustomizeStepProps {
  template: string;
  customizations: {
    businessName: string;
    bookingLink: string;
    reviewLink: string;
  };
  onUpdate: (customizations: LiteCustomizeStepProps['customizations']) => void;
  onNext: () => void;
  onBack: () => void;
}

export function LiteCustomizeStep({
  template,
  customizations,
  onUpdate,
  onNext,
  onBack,
}: LiteCustomizeStepProps) {
  const handleChange = (field: string, value: string) => {
    onUpdate({ ...customizations, [field]: value });
  };

  const isReviewTemplate = template === 'review-request';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Customize your campaign</h2>
        <p className="text-gray-600">
          These details will be inserted into your messages.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="businessName" className="text-gray-700">Your business name</Label>
          <Input
            id="businessName"
            value={customizations.businessName}
            onChange={(e) => handleChange('businessName', e.target.value)}
            placeholder="Sparkle Cleaning Co."
          />
          <p className="text-xs text-gray-500">
            This appears in your messages as {'{{business_name}}'}
          </p>
        </div>

        {!isReviewTemplate && (
          <div className="space-y-2">
            <Label htmlFor="bookingLink" className="text-gray-700">Booking link (optional)</Label>
            <Input
              id="bookingLink"
              value={customizations.bookingLink}
              onChange={(e) => handleChange('bookingLink', e.target.value)}
              placeholder="https://calendly.com/your-business"
            />
            <p className="text-xs text-gray-500">
              Where customers can book appointments. Leave blank to have them reply directly.
            </p>
          </div>
        )}

        {isReviewTemplate && (
          <div className="space-y-2">
            <Label htmlFor="reviewLink" className="text-gray-700">Google review link</Label>
            <Input
              id="reviewLink"
              value={customizations.reviewLink}
              onChange={(e) => handleChange('reviewLink', e.target.value)}
              placeholder="https://g.page/r/your-business/review"
            />
            <p className="text-xs text-gray-500">
              Your Google Business Profile review link
            </p>
          </div>
        )}
      </div>

      {/* Preview */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Message preview:</p>
          <div className="bg-green-600 text-white rounded-lg p-3 max-w-xs">
            <p className="text-sm">
              {template === 'we-miss-you' &&
                `Hey John! It's been a while since your last visit with ${
                  customizations.businessName || '[Your Business]'
                }. We'd love to have you back! Reply YES if you'd like to schedule.`}
              {template === 'seasonal-reminder' &&
                `Hi John! It's that time again - ready to schedule your regular service with ${
                  customizations.businessName || '[Your Business]'
                }? Reply to book!`}
              {template === 'review-request' &&
                `Hi John! Thank you for choosing ${
                  customizations.businessName || '[Your Business]'
                }. If you were happy with our service, we'd really appreciate a quick review: ${
                  customizations.reviewLink || '[your review link]'
                }`}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <RiArrowLeftLine className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!customizations.businessName}
          className="bg-green-600 hover:bg-green-700"
        >
          Continue
          <RiArrowRightLine className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
