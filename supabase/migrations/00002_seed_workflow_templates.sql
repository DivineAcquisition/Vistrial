-- ============================================
-- SEED: Workflow Templates
-- ============================================

INSERT INTO public.workflow_templates (name, slug, description, category, business_types, steps, is_active) VALUES

-- REACTIVATION WORKFLOWS
(
  'Win Back - 90 Day Inactive',
  'win-back-90-day',
  'Re-engage customers who haven''t booked in 90+ days with a friendly check-in sequence',
  'reactivation',
  ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}, it''s {{business_name}}! We noticed it''s been a while since your last service. Everything going okay? We''d love to help if you need us. Reply STOP to opt out."
    },
    {
      "id": "step_2",
      "type": "sms",
      "delay_days": 3,
      "delay_hours": 0,
      "template": "Hey {{first_name}}, just checking in from {{business_name}}. We have some openings this week if you need anything. Let us know!"
    },
    {
      "id": "step_3",
      "type": "voice_drop",
      "delay_days": 7,
      "delay_hours": 0,
      "template": "Hi {{first_name}}, this is {{business_name}} giving you a quick call. We miss having you as a customer and wanted to see if there''s anything we can help with. Give us a call back when you get a chance. Thanks!"
    }
  ]'::jsonb,
  true
),

(
  'We Miss You - Special Offer',
  'we-miss-you-offer',
  'Win back inactive customers with a special discount offer',
  'reactivation',
  ARRAY['cleaning_residential', 'hvac', 'landscaping', 'pest_control', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}! {{business_name}} here. We miss you! As a thank you for being a past customer, we''d like to offer you 15% off your next service. Interested? Reply STOP to opt out."
    },
    {
      "id": "step_2",
      "type": "sms",
      "delay_days": 4,
      "delay_hours": 0,
      "template": "Hey {{first_name}}, just a reminder - your 15% off offer from {{business_name}} is still available. Would you like to schedule something this week?"
    },
    {
      "id": "step_3",
      "type": "sms",
      "delay_days": 10,
      "delay_hours": 0,
      "template": "Last chance {{first_name}}! Your 15% discount from {{business_name}} expires soon. Reply YES to book or let us know if you have any questions!"
    }
  ]'::jsonb,
  true
),

-- RETENTION WORKFLOWS
(
  'Post-Service Review Request',
  'post-service-review',
  'Request reviews from customers after completing a service',
  'review_request',
  ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 1,
      "delay_hours": 0,
      "template": "Hi {{first_name}}, thank you for choosing {{business_name}}! We hope you were happy with our service. If you have a moment, we''d really appreciate a quick review: {{review_link}} - Reply STOP to opt out."
    },
    {
      "id": "step_2",
      "type": "sms",
      "delay_days": 5,
      "delay_hours": 0,
      "template": "Hey {{first_name}}, this is {{business_name}}. If you enjoyed our service, a quick Google review would mean the world to us! {{review_link}} Thank you!"
    }
  ]'::jsonb,
  true
),

(
  'Referral Request',
  'referral-request',
  'Ask satisfied customers for referrals',
  'referral',
  ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}! {{business_name}} here. Know anyone who could use our services? We''d love to help your friends and family - and we''ll thank you with a $25 credit for each referral! Reply STOP to opt out."
    }
  ]'::jsonb,
  true
),

-- SEASONAL WORKFLOWS
(
  'Spring Cleaning Promo',
  'spring-cleaning',
  'Seasonal promotion for spring cleaning services',
  'seasonal',
  ARRAY['cleaning_residential', 'carpet_cleaning', 'window_cleaning', 'pressure_washing']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}! Spring is here 🌸 {{business_name}} is booking spring cleaning appointments now. Ready to refresh your space? Reply for availability! Reply STOP to opt out."
    },
    {
      "id": "step_2",
      "type": "sms",
      "delay_days": 5,
      "delay_hours": 0,
      "template": "Hey {{first_name}}, spring slots are filling up fast at {{business_name}}! Want us to save you a spot this month?"
    }
  ]'::jsonb,
  true
),

(
  'HVAC Seasonal Tune-Up',
  'hvac-seasonal-tuneup',
  'Seasonal HVAC maintenance reminders',
  'seasonal',
  ARRAY['hvac']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}, {{business_name}} here! Time for your seasonal HVAC tune-up. Regular maintenance saves money and prevents breakdowns. Want to schedule? Reply STOP to opt out."
    },
    {
      "id": "step_2",
      "type": "sms",
      "delay_days": 4,
      "delay_hours": 0,
      "template": "Hey {{first_name}}, just following up on your HVAC tune-up. We have openings this week. Reply YES to book or call us at {{business_phone}}!"
    },
    {
      "id": "step_3",
      "type": "voice_drop",
      "delay_days": 8,
      "delay_hours": 0,
      "template": "Hi {{first_name}}, this is {{business_name}}. We wanted to remind you about scheduling your seasonal HVAC maintenance. It''s a great way to keep your system running efficiently and avoid unexpected repairs. Give us a call when you''re ready to schedule. Thanks!"
    }
  ]'::jsonb,
  true
),

(
  'Holiday Season Prep',
  'holiday-prep',
  'Pre-holiday cleaning and preparation services',
  'seasonal',
  ARRAY['cleaning_residential', 'carpet_cleaning', 'window_cleaning']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}! 🎄 The holidays are coming! {{business_name}} is booking now for pre-holiday cleanings. Let us help you get your home guest-ready! Reply STOP to opt out."
    },
    {
      "id": "step_2",
      "type": "sms",
      "delay_days": 5,
      "delay_hours": 0,
      "template": "Hey {{first_name}}, holiday appointments at {{business_name}} are filling up! Want us to save you a spot before the rush?"
    }
  ]'::jsonb,
  true
),

-- WIN BACK WORKFLOWS
(
  'Lost Customer Survey',
  'lost-customer-survey',
  'Reach out to understand why customers stopped using your service',
  'win_back',
  ARRAY['cleaning_residential', 'cleaning_commercial', 'hvac', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'roofing', 'painting', 'handyman', 'carpet_cleaning', 'window_cleaning', 'pressure_washing', 'pool_service', 'appliance_repair', 'other']::public.business_type[],
  '[
    {
      "id": "step_1",
      "type": "sms",
      "delay_days": 0,
      "delay_hours": 0,
      "template": "Hi {{first_name}}, {{business_name}} here. We noticed you haven''t booked with us in a while and wanted to check in. Is there anything we could have done better? Your feedback helps us improve. Reply STOP to opt out."
    }
  ]'::jsonb,
  true
);
