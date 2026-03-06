// @ts-nocheck
// ============================================
// ORGANIZATION DEFAULTS SEEDER
// Seeds service types, conversion offers, sequence templates
// for new residential cleaning company orgs
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const DEFAULT_SERVICE_TYPES = [
  { name: 'Standard Clean', slug: 'standard_clean', min_price_cents: 12000, max_price_cents: 18000, avg_duration_minutes: 120, is_active: true, sort_order: 0 },
  { name: 'Deep Clean', slug: 'deep_clean', min_price_cents: 20000, max_price_cents: 35000, avg_duration_minutes: 240, is_active: true, sort_order: 1 },
  { name: 'Move In/Out Clean', slug: 'move_in_out', min_price_cents: 25000, max_price_cents: 45000, avg_duration_minutes: 300, is_active: true, sort_order: 2 },
  { name: 'Post-Construction Clean', slug: 'post_construction', min_price_cents: 30000, max_price_cents: 60000, avg_duration_minutes: 360, is_active: false, sort_order: 3 },
  { name: 'One-Time Special', slug: 'one_time_special', min_price_cents: 15000, max_price_cents: 30000, avg_duration_minutes: 180, is_active: false, sort_order: 4 },
];

const DEFAULT_OFFERS = [
  { name: 'Weekly Maintenance', trigger_service_slug: 'standard_clean', frequency: 'weekly', price_per_visit_cents: 12900, discount_percent: 15, discount_duration_months: 3, priority_scheduling: true, bonus_description: 'Free fridge clean', sort_order: 0 },
  { name: 'Biweekly Refresh', trigger_service_slug: 'deep_clean', frequency: 'biweekly', price_per_visit_cents: 16900, discount_percent: 15, discount_duration_months: 3, priority_scheduling: true, bonus_description: 'Free oven clean', sort_order: 1 },
  { name: 'Monthly Deep Clean', trigger_service_slug: 'move_in_out', frequency: 'monthly', price_per_visit_cents: 19900, discount_percent: 15, discount_duration_months: 3, priority_scheduling: true, bonus_description: null, sort_order: 2 },
  { name: 'Biweekly Standard', trigger_service_slug: 'one_time_special', frequency: 'biweekly', price_per_visit_cents: 13900, discount_percent: 15, discount_duration_months: 3, priority_scheduling: true, bonus_description: null, sort_order: 3 },
];

const DEFAULT_SEQUENCE_TEMPLATES = [
  // Stage 1: Post-Service Glow (2 hours after)
  { stage: 'post_service_glow', step_index: 0, channel: 'sms', delay_hours: 2, delay_days: 0, body: 'Hi {{first_name}}, it\'s {{business_name}}! ✨ How does everything look? We want to make sure you\'re 100% happy with your clean today. Reply if you need anything at all!' },
  { stage: 'post_service_glow', step_index: 1, channel: 'sms', delay_hours: 24, delay_days: 0, body: 'Hi {{first_name}}, glad you loved the results! 🏠 Quick question — would you like to keep your home this clean with regular service? I can lock in your preferred day and time. Reply YES to learn more or STOP to opt out.' },

  // Stage 2: Value Anchoring (Day 2-4)
  { stage: 'value_anchoring', step_index: 0, channel: 'sms', delay_hours: 0, delay_days: 2, body: 'Hey {{first_name}}! Fun fact — homes cleaned regularly have 40% less allergens and dust. Your next clean would take half the time since we just deep-cleaned. Want to set up a recurring schedule? Reply STOP to opt out.' },
  { stage: 'value_anchoring', step_index: 1, channel: 'sms', delay_hours: 0, delay_days: 4, body: '{{first_name}}, just thinking about your home! With biweekly cleaning, you\'d never have to spend your weekend scrubbing again. Our recurring clients save an average of 15% per visit. Interested? Reply STOP to opt out.' },

  // Stage 3: Incentive Window (Day 5-9)
  { stage: 'incentive_window', step_index: 0, channel: 'sms', delay_hours: 0, delay_days: 5, body: '🎉 Special offer for you, {{first_name}}! Lock in biweekly cleaning at {{offer_price}}/visit ({{discount_percent}}% off) for your first {{discount_months}} months. Includes priority scheduling{{bonus_text}}. This rate is only available for 5 days. Reply YES to claim! Reply STOP to opt out.' },
  { stage: 'incentive_window', step_index: 1, channel: 'sms', delay_hours: 0, delay_days: 7, body: '{{first_name}}, quick reminder — your {{discount_percent}}% off recurring cleaning offer expires in 3 days. Lock in {{offer_price}}/visit and never worry about cleaning day again. Reply YES or tap here: {{booking_link}} Reply STOP to opt out.' },

  // Stage 4: Social Proof (Day 10-17)
  { stage: 'social_proof', step_index: 0, channel: 'sms', delay_hours: 0, delay_days: 10, body: '{{first_name}}, here\'s what one of our recurring clients said: "Best decision I made — my home is always guest-ready and I save so much time." Want the same experience? We still have your {{discount_percent}}% off offer available. Reply STOP to opt out.' },
  { stage: 'social_proof', step_index: 1, channel: 'sms', delay_hours: 0, delay_days: 14, body: 'Hi {{first_name}}! {{business_name}} here. We just had a cancellation on {{suggested_day}} — that could be YOUR regular cleaning day. Want me to reserve it? Recurring clients get priority scheduling. Reply STOP to opt out.' },

  // Stage 5: Final Conversion (Day 18-30)
  { stage: 'final_conversion', step_index: 0, channel: 'sms', delay_hours: 0, delay_days: 18, body: '{{first_name}}, it\'s been a couple weeks since your clean. I bet things are starting to pile up! 😅 We\'d love to get you on a regular schedule. I can still honor {{discount_percent}}% off your first {{discount_months}} months. Last chance before the offer expires. Reply STOP to opt out.' },
  { stage: 'final_conversion', step_index: 1, channel: 'sms', delay_hours: 0, delay_days: 25, body: 'Hey {{first_name}}, just checking in one last time from {{business_name}}. If you ever want to set up recurring cleaning, we\'re here for you. Save this number — you can text us anytime to book. Wishing you the best! 🏠✨ Reply STOP to opt out.' },
];

const DEFAULT_CONVERSION_SETTINGS = {
  auto_enter_pipeline: true,
  default_sequence_enabled: true,
  satisfaction_check_delay_hours: 2,
  stage_timing: {
    post_service_glow: { delay_hours: 2, duration_days: 1 },
    value_anchoring: { delay_days: 2, duration_days: 3 },
    incentive_window: { delay_days: 5, duration_days: 5 },
    social_proof: { delay_days: 10, duration_days: 8 },
    final_conversion: { delay_days: 18, duration_days: 12 },
  },
  working_hours: { start: '09:00', end: '20:00' },
  working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  max_messages_per_day_per_contact: 2,
};

export async function seedOrganizationDefaults(orgId: string) {
  const admin = getSupabaseAdminClient();

  // 1. Seed service types
  const serviceInserts = DEFAULT_SERVICE_TYPES.map(s => ({ ...s, org_id: orgId }));
  const { data: serviceTypes } = await admin.from('service_types').upsert(serviceInserts, { onConflict: 'org_id,slug' }).select();

  // 2. Build service type ID map
  const serviceMap: Record<string, string> = {};
  if (serviceTypes) {
    for (const st of serviceTypes) {
      serviceMap[st.slug] = st.id;
    }
  }

  // 3. Seed conversion offers
  const offerInserts = DEFAULT_OFFERS.map(o => ({
    org_id: orgId,
    name: o.name,
    trigger_service_slug: o.trigger_service_slug,
    service_type_id: serviceMap[o.trigger_service_slug] || null,
    frequency: o.frequency,
    price_per_visit_cents: o.price_per_visit_cents,
    discount_percent: o.discount_percent,
    discount_duration_months: o.discount_duration_months,
    priority_scheduling: o.priority_scheduling,
    bonus_description: o.bonus_description,
    sort_order: o.sort_order,
    is_active: true,
    sms_preview: generateSmsPreview(o),
  }));
  await admin.from('conversion_offers').insert(offerInserts);

  // 4. Seed sequence templates
  const templateInserts = DEFAULT_SEQUENCE_TEMPLATES.map(t => ({ ...t, org_id: orgId, is_default: true, is_active: true }));
  await admin.from('sequence_templates').insert(templateInserts);

  // 5. Update org settings with conversion defaults
  const { data: org } = await admin.from('organizations').select('settings').eq('id', orgId).single();
  const existingSettings = (org?.settings as Record<string, any>) || {};
  await admin.from('organizations').update({
    settings: { ...existingSettings, conversion_settings: DEFAULT_CONVERSION_SETTINGS },
    industry: 'residential_cleaning',
  }).eq('id', orgId);

  return { serviceTypes: serviceTypes?.length || 0, offers: offerInserts.length, templates: templateInserts.length };
}

function generateSmsPreview(offer: typeof DEFAULT_OFFERS[0]): string {
  const freq = offer.frequency === 'weekly' ? 'weekly' : offer.frequency === 'biweekly' ? 'biweekly' : 'monthly';
  const price = `$${(offer.price_per_visit_cents / 100).toFixed(0)}`;
  const discountedPrice = `$${Math.round(offer.price_per_visit_cents * (1 - offer.discount_percent / 100) / 100)}`;
  const bonus = offer.bonus_description ? ` Includes ${offer.bonus_description}.` : '';
  return `Lock in ${freq} cleaning at ${discountedPrice}/visit (${offer.discount_percent}% off) for your first ${offer.discount_duration_months} months. Priority scheduling included.${bonus}`;
}
