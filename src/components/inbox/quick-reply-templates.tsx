'use client';

// ============================================
// QUICK REPLY TEMPLATES
// Pre-built response templates
// ============================================

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface QuickReplyTemplatesProps {
  onSelect: (template: string) => void;
  onClose: () => void;
}

const templates = [
  {
    category: 'Positive Response',
    items: [
      {
        name: 'Schedule Appointment',
        content:
          "Great to hear from you, {{first_name}}! I'd love to get you scheduled. What days/times work best for you this week?",
      },
      {
        name: 'Send Booking Link',
        content:
          "Perfect! You can book your appointment directly here: [booking_link]. Let me know if you have any questions!",
      },
      {
        name: 'Confirm Interest',
        content:
          "Thanks for getting back to me, {{first_name}}! Just to confirm - you're interested in scheduling a service? I can have someone reach out to discuss details.",
      },
    ],
  },
  {
    category: 'Follow Up',
    items: [
      {
        name: 'Check In',
        content:
          "Hi {{first_name}}, just checking in to see if you're still interested in scheduling? Happy to answer any questions you might have.",
      },
      {
        name: 'Offer Help',
        content:
          "Hi {{first_name}}, I noticed you reached out - is there anything I can help you with today?",
      },
    ],
  },
  {
    category: 'Information',
    items: [
      {
        name: 'Pricing Info',
        content:
          "Great question! Our pricing typically ranges from $X to $Y depending on the scope of work. Would you like me to provide a free estimate?",
      },
      {
        name: 'Service Area',
        content:
          "We service the greater [area] region. What's your zip code? I can confirm we cover your area.",
      },
    ],
  },
  {
    category: 'Closing',
    items: [
      {
        name: 'Thank You',
        content:
          "Thank you for your business, {{first_name}}! We really appreciate you choosing us. Don't hesitate to reach out if you need anything else.",
      },
      {
        name: 'Not Interested',
        content:
          "No problem at all, {{first_name}}. Thanks for letting me know. Feel free to reach out anytime if your situation changes!",
      },
    ],
  },
];

export function QuickReplyTemplates({
  onSelect,
  onClose,
}: QuickReplyTemplatesProps) {
  return (
    <Card className="mb-3 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm">Quick Replies</h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 max-h-64 overflow-y-auto">
        {templates.map((category) => (
          <div key={category.category}>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {category.category}
            </p>
            <div className="space-y-1">
              {category.items.map((template) => (
                <button
                  key={template.name}
                  onClick={() => onSelect(template.content)}
                  className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {template.content}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
