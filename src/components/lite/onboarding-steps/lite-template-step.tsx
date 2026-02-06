'use client';

// ============================================
// LITE TEMPLATE STEP
// Pre-built template selection
// ============================================

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckLine,
  RiRefreshLine,
  RiHeartLine,
  RiStarLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';

interface LiteTemplateStepProps {
  selectedTemplate: string | null;
  onSelect: (template: string) => void;
  onBack: () => void;
}

const TEMPLATES = [
  {
    id: 'we-miss-you',
    name: 'We Miss You',
    icon: RiHeartLine,
    description: "Warm reactivation for customers who haven&apos;t booked in a while",
    color: 'pink',
    steps: 3,
    preview: [
      "Hey {{first_name}}! It's been a while since your last visit with {{business_name}}. We'd love to have you back! Reply YES if you'd like to schedule.",
      "Hi {{first_name}}, just following up - are you ready to book your next appointment with us?",
      "Last chance, {{first_name}}! We're offering 10% off your next service. Interested?",
    ],
  },
  {
    id: 'seasonal-reminder',
    name: 'Seasonal Reminder',
    icon: RiRefreshLine,
    description: 'Perfect for services that need regular maintenance',
    color: 'blue',
    steps: 3,
    preview: [
      "Hi {{first_name}}! It's that time again - ready to schedule your regular service with {{business_name}}? Reply to book!",
      "{{first_name}}, don't forget about your regular maintenance! We've got openings this week. Interested?",
      "Final reminder: Let's get you on the schedule, {{first_name}}. Reply YES to book your service!",
    ],
  },
  {
    id: 'review-request',
    name: 'Review Request',
    icon: RiStarLine,
    description: 'Ask happy customers for Google reviews',
    color: 'yellow',
    steps: 2,
    preview: [
      "Hi {{first_name}}! Thank you for choosing {{business_name}}. If you were happy with our service, we'd really appreciate a quick review: {{review_link}}",
      "{{first_name}}, your feedback helps us grow! Would you mind leaving a quick review? It only takes 30 seconds: {{review_link}}",
    ],
  },
];

export function LiteTemplateStep({
  selectedTemplate,
  onSelect,
  onBack,
}: LiteTemplateStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Pick a campaign template</h2>
        <p className="text-gray-600">
          These are proven sequences that work. You can customize the messages next.
        </p>
      </div>

      <div className="space-y-4">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          const isSelected = selectedTemplate === template.id;

          return (
            <Card
              key={template.id}
              className={cn(
                'cursor-pointer transition-all hover:border-green-500/50 bg-white',
                isSelected && 'border-green-500 border-2 bg-green-50/50'
              )}
              onClick={() => onSelect(template.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      template.color === 'pink' && 'bg-pink-100 text-pink-600',
                      template.color === 'blue' && 'bg-blue-100 text-blue-600',
                      template.color === 'yellow' && 'bg-yellow-100 text-yellow-600'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {template.steps} messages
                      </Badge>
                      {isSelected && (
                        <RiCheckLine className="h-4 w-4 text-green-600 ml-auto" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {template.description}
                    </p>

                    {/* Preview */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Preview:</p>
                      <p className="text-sm text-gray-700">{template.preview[0]}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <RiArrowLeftLine className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={() => selectedTemplate && onSelect(selectedTemplate)}
          disabled={!selectedTemplate}
          className="bg-green-600 hover:bg-green-700"
        >
          Continue
          <RiArrowRightLine className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
