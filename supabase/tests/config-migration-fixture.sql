-- Loaded BEFORE 20261007030000 by scripts/test-config-migration.sh: make the
-- seeded Divine Acquisition workspace look like the live one (customised
-- scoring, a short follow-up window, a completed business profile), so the
-- migration is tested against the shape of real data.

UPDATE public.score_configs
SET timeline_weight = 25, investment_capacity_weight = 25, decision_authority_weight = 25, pain_severity_weight = 25,
    ready_threshold = 60, speed_to_lead_minutes = 15, ghost_days_soft = 4, ghost_days_hard = 7
WHERE org_id = '2d2d2d2d-2222-4222-8222-222222222222';

UPDATE public.follow_up_settings
SET max_sequence_length = 3, max_sequence_duration_days = 5, draft_stale_days = 5,
    quiet_hours_enabled = true, quiet_hours_start = '21:00', quiet_hours_end = '08:00'
WHERE org_id = '2d2d2d2d-2222-4222-8222-222222222222';

UPDATE public.org_voice_profiles SET formality = 'casual'
WHERE org_id = '2d2d2d2d-2222-4222-8222-222222222222';

INSERT INTO public.business_profiles (org_id) VALUES ('2d2d2d2d-2222-4222-8222-222222222222') ON CONFLICT (org_id) DO NOTHING;
UPDATE public.business_profiles
SET offer_name = 'Private Consulting For Sales Operations',
    offer_type = 'consulting',
    price_point_cents = 350000,
    payment_structure = 'plan',
    qualification_signals = ARRAY['has_budget', 'urgent_timeline', 'sole_decision_maker', 'clear_pain']::public.profile_qualification_signal[],
    disqualifiers = ARRAY['no_budget', 'pre_revenue']::public.profile_disqualifier[],
    lead_channels = ARRAY['meta_ads', 'referral']::public.profile_lead_channel[],
    top_objections = '[{"type":"price","phrasing":"It is a lot of money right now","response":null},{"type":"timing","phrasing":"Now is not the right time","response":null},{"type":"spouse_partner","phrasing":"I need to talk to my partner","response":null}]'::jsonb,
    voice_formality = 'casual'
WHERE org_id = '2d2d2d2d-2222-4222-8222-222222222222';
