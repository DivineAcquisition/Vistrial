// ============================================
// WORKFLOW TEMPLATES
// Pre-built multi-channel workflow templates
// ============================================

import type { WorkflowStep, WorkflowSettings, EnrollmentCriteria } from '@/types/workflows';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'reactivation' | 'review' | 'seasonal' | 'winback';
  channels: ('sms' | 'email' | 'voice_drop')[];
  steps: WorkflowStep[];
  settings: WorkflowSettings;
  enrollment_criteria: EnrollmentCriteria;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // SMS Only Templates
  {
    id: 'we-miss-you-sms',
    name: 'We Miss You (SMS)',
    description: '3-step SMS reactivation for dormant customers',
    category: 'reactivation',
    channels: ['sms'],
    steps: [
      {
        id: 'step_1',
        type: 'sms',
        delay_days: 0,
        delay_hours: 0,
        template: "Hey {{first_name}}! It's been a while since your last visit with {{business_name}}. We'd love to have you back! Reply YES if you'd like to schedule.",
      },
      {
        id: 'step_2',
        type: 'sms',
        delay_days: 3,
        delay_hours: 0,
        template: "Hi {{first_name}}, just following up - are you ready to book your next appointment with us?",
      },
      {
        id: 'step_3',
        type: 'sms',
        delay_days: 7,
        delay_hours: 0,
        template: "Last chance, {{first_name}}! We're offering 10% off your next service. Interested? Reply YES!",
      },
    ],
    settings: {
      send_window_start: '09:00',
      send_window_end: '20:00',
      send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      respect_timezone: true,
      stop_on_response: true,
      stop_on_booking: true,
    },
    enrollment_criteria: {
      status: ['active'],
      has_phone: true,
      last_contacted_before_days: 90,
    },
  },

  // Multi-Channel Template: SMS + Email
  {
    id: 'we-miss-you-multi',
    name: 'We Miss You (SMS + Email)',
    description: '5-step multi-channel reactivation combining SMS and email',
    category: 'reactivation',
    channels: ['sms', 'email'],
    steps: [
      {
        id: 'step_1',
        type: 'sms',
        delay_days: 0,
        delay_hours: 0,
        template: "Hey {{first_name}}! It's been a while since your last visit with {{business_name}}. We'd love to have you back! Reply YES if you'd like to schedule.",
      },
      {
        id: 'step_2',
        type: 'email',
        delay_days: 2,
        delay_hours: 0,
        email_subject: "We miss you, {{first_name}}! 💙",
        email_body: `Hi {{first_name}},

It's been a while since we last saw you, and we wanted to reach out!

At {{business_name}}, we truly value our customers, and you've been missed. We'd love the opportunity to serve you again.

As a thank you for being a loyal customer, we're offering you 10% off your next service.

Ready to schedule? Just reply to this email or click the button below.

We hope to see you soon!

Warm regards,
The {{business_name}} Team`,
        email_cta_text: 'Book Now',
        email_cta_url: '{{booking_link}}',
      },
      {
        id: 'step_3',
        type: 'sms',
        delay_days: 4,
        delay_hours: 0,
        template: "Hi {{first_name}}, did you see our email? We'd love to get you scheduled. Reply here or call us anytime!",
      },
      {
        id: 'step_4',
        type: 'email',
        delay_days: 7,
        delay_hours: 0,
        email_subject: "Last chance for 10% off, {{first_name}}",
        email_body: `Hi {{first_name}},

This is a quick reminder that your 10% discount expires soon!

We don't want you to miss out. Scheduling is easy - just reply to this email or click below.

Hope to hear from you!

- The {{business_name}} Team`,
        email_cta_text: 'Claim Your Discount',
        email_cta_url: '{{booking_link}}',
      },
      {
        id: 'step_5',
        type: 'sms',
        delay_days: 10,
        delay_hours: 0,
        template: "Final reminder {{first_name}} - your 10% off expires tomorrow! Reply YES to book before it's gone.",
      },
    ],
    settings: {
      send_window_start: '09:00',
      send_window_end: '20:00',
      send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      respect_timezone: true,
      stop_on_response: true,
      stop_on_booking: true,
    },
    enrollment_criteria: {
      status: ['active'],
      has_phone: true,
      has_email: true,
      last_contacted_before_days: 90,
    },
  },

  // Email Only Template
  {
    id: 'we-miss-you-email',
    name: 'We Miss You (Email Only)',
    description: '3-step email reactivation sequence',
    category: 'reactivation',
    channels: ['email'],
    steps: [
      {
        id: 'step_1',
        type: 'email',
        delay_days: 0,
        delay_hours: 0,
        email_subject: "It's been a while, {{first_name}}!",
        email_body: `Hi {{first_name}},

We noticed it's been a while since your last appointment with {{business_name}}, and we wanted to check in!

Life gets busy, and sometimes things slip through the cracks. But we're here whenever you're ready.

Would you like to schedule your next visit? Just reply to this email and we'll get you on the calendar.

Looking forward to seeing you!

Best,
The {{business_name}} Team`,
        email_cta_text: 'Schedule Now',
        email_cta_url: '{{booking_link}}',
      },
      {
        id: 'step_2',
        type: 'email',
        delay_days: 4,
        delay_hours: 0,
        email_subject: "A special offer for you, {{first_name}} ✨",
        email_body: `Hi {{first_name}},

We really do miss having you as a customer!

To show our appreciation, we'd like to offer you 15% off your next service with us.

No strings attached - just our way of saying we value you.

Ready to book?

Thanks,
{{business_name}}`,
        email_cta_text: 'Claim 15% Off',
        email_cta_url: '{{booking_link}}',
      },
      {
        id: 'step_3',
        type: 'email',
        delay_days: 7,
        delay_hours: 0,
        email_subject: "Your discount expires soon, {{first_name}}",
        email_body: `Hi {{first_name}},

Just a friendly heads up - your 15% discount expires in a few days.

We'd hate for you to miss out!

Click below to book before it expires.

See you soon,
{{business_name}}`,
        email_cta_text: 'Book Before It Expires',
        email_cta_url: '{{booking_link}}',
      },
    ],
    settings: {
      send_window_start: '08:00',
      send_window_end: '18:00',
      send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      respect_timezone: true,
      stop_on_response: true,
      stop_on_booking: true,
    },
    enrollment_criteria: {
      status: ['active'],
      has_email: true,
      last_contacted_before_days: 90,
    },
  },

  // Review Request Template
  {
    id: 'review-request-multi',
    name: 'Review Request (SMS + Email)',
    description: 'Ask happy customers for Google reviews',
    category: 'review',
    channels: ['sms', 'email'],
    steps: [
      {
        id: 'step_1',
        type: 'sms',
        delay_days: 0,
        delay_hours: 0,
        template: "Hi {{first_name}}! Thank you for choosing {{business_name}}. If you were happy with our service, we'd really appreciate a quick review: {{review_link}}",
      },
      {
        id: 'step_2',
        type: 'email',
        delay_days: 3,
        delay_hours: 0,
        email_subject: "How did we do, {{first_name}}?",
        email_body: `Hi {{first_name}},

Thank you for choosing {{business_name}}!

We hope you were happy with your recent service. If so, would you mind taking 30 seconds to leave us a review?

Your feedback helps other customers find us and helps us improve.

Thank you so much!

- The {{business_name}} Team`,
        email_cta_text: 'Leave a Review',
        email_cta_url: '{{review_link}}',
      },
    ],
    settings: {
      send_window_start: '10:00',
      send_window_end: '19:00',
      send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      respect_timezone: true,
      stop_on_response: true,
      stop_on_booking: false,
    },
    enrollment_criteria: {
      status: ['active'],
      has_phone: true,
    },
  },

  // Seasonal Reminder
  {
    id: 'seasonal-reminder-multi',
    name: 'Seasonal Reminder (SMS + Email)',
    description: 'Remind customers about regular maintenance',
    category: 'seasonal',
    channels: ['sms', 'email'],
    steps: [
      {
        id: 'step_1',
        type: 'email',
        delay_days: 0,
        delay_hours: 0,
        email_subject: "Time for your seasonal service, {{first_name}}!",
        email_body: `Hi {{first_name}},

It's that time of year again! Time to schedule your regular service with {{business_name}}.

Regular maintenance helps keep everything running smoothly and can prevent costly issues down the road.

We have openings available this week. Would you like to schedule?

Best,
{{business_name}}`,
        email_cta_text: 'Schedule Now',
        email_cta_url: '{{booking_link}}',
      },
      {
        id: 'step_2',
        type: 'sms',
        delay_days: 3,
        delay_hours: 0,
        template: "Hi {{first_name}}! Did you get our email about scheduling your seasonal service? We've got openings this week. Reply to book!",
      },
      {
        id: 'step_3',
        type: 'email',
        delay_days: 7,
        delay_hours: 0,
        email_subject: "Don't forget your seasonal maintenance, {{first_name}}",
        email_body: `Hi {{first_name}},

Just a friendly reminder - it's time for your seasonal service!

Our schedule is filling up fast. Book now to secure your preferred time.

See you soon!
{{business_name}}`,
        email_cta_text: 'Book My Spot',
        email_cta_url: '{{booking_link}}',
      },
    ],
    settings: {
      send_window_start: '09:00',
      send_window_end: '18:00',
      send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      respect_timezone: true,
      stop_on_response: true,
      stop_on_booking: true,
    },
    enrollment_criteria: {
      status: ['active'],
      has_email: true,
      last_job_before_days: 180,
    },
  },
];

// Get template by ID
export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

// Get templates by category
export function getTemplatesByCategory(category: WorkflowTemplate['category']): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

// Get templates by channel
export function getTemplatesByChannel(channel: 'sms' | 'email' | 'voice_drop'): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.channels.includes(channel));
}
