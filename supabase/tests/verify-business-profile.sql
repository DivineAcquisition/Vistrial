-- Prompt 12: the business profile, the compounding layer, the Leak Report, the
-- activation gate, and adoption watch, checked against raw rows.
--
-- IDs in this file use the 2222e222-2222-4222-8222- prefix so they cannot
-- collide with the orgs, members and leads seeded by earlier verify scripts.

-- ---------------------------------------------------------------------------
-- Every profile field names the feature that reads it. The migration enforces
-- this at deploy time; this repeats it so a later migration cannot quietly
-- drop the registry row and leave the column behind.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_orphans text;
  v_blank integer;
BEGIN
  SELECT string_agg(c.column_name, ', ') INTO v_orphans
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'business_profiles'
    AND c.column_name NOT IN (
      'org_id', 'version', 'completeness_score', 'last_reviewed_at',
      'last_reviewed_by_member_id', 'created_at', 'updated_at', 'aggregate_opt_out_at'
    )
    AND NOT EXISTS (SELECT 1 FROM public.profile_field_registry r WHERE r.field = c.column_name);
  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION 'profile fields with no named consumer: %', v_orphans;
  END IF;

  SELECT count(*) INTO v_blank
  FROM public.profile_field_registry WHERE char_length(trim(consumer)) = 0;
  IF v_blank > 0 THEN
    RAISE EXCEPTION '% registry rows name no consumer', v_blank;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('2222e222-2222-4222-8222-00000000a001', 'profile-owner@vistrial.local'),
  ('2222e222-2222-4222-8222-00000000a002', 'profile-setter@vistrial.local'),
  ('2222e222-2222-4222-8222-00000000a003', 'gate-owner@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, timezone, sales_cycle_days, baseline_lookback_days)
VALUES ('2222e222-2222-4222-8222-000000000001', 'Profile Co', 'profile-co', 'America/New_York', 60, 365);

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email) VALUES
  ('2222e222-2222-4222-8222-0000000000b1', '2222e222-2222-4222-8222-000000000001',
   '2222e222-2222-4222-8222-00000000a001', 'owner', 'Profile Owner', 'profile-owner@vistrial.local'),
  ('2222e222-2222-4222-8222-0000000000b2', '2222e222-2222-4222-8222-000000000001',
   '2222e222-2222-4222-8222-00000000a002', 'setter', 'Profile Setter', 'profile-setter@vistrial.local');

-- ---------------------------------------------------------------------------
-- Provisioning, versioning, completeness, defaults
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000001';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000b1';
  v_state jsonb;
  v_completeness jsonb;
  v_defaults jsonb;
  v_version integer;
  v_changed text[];
  v_actor uuid;
  v_missing text;
  v_stage_rows integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_profiles WHERE org_id = v_org) THEN
    RAISE EXCEPTION 'a new org must be provisioned with a business profile';
  END IF;

  SELECT count(*) INTO v_stage_rows FROM public.business_profile_stages WHERE org_id = v_org;
  IF v_stage_rows <> array_length(enum_range(NULL::public.profile_stage), 1) THEN
    RAISE EXCEPTION 'onboarding stages were not provisioned, found %', v_stage_rows;
  END IF;

  -- An empty profile scores zero and every required field is a named gap.
  v_completeness := public.business_profile_completeness(v_org);
  IF (v_completeness ->> 'score')::integer <> 0 THEN
    RAISE EXCEPTION 'an untouched profile should score 0, got %', v_completeness ->> 'score';
  END IF;
  IF jsonb_array_length(v_completeness -> 'gaps') <> (v_completeness ->> 'total')::integer THEN
    RAISE EXCEPTION 'every required field should be listed as a gap on an empty profile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_completeness -> 'gaps') g
    WHERE char_length(COALESCE(g ->> 'consumer', '')) = 0
  ) THEN
    RAISE EXCEPTION 'a completeness gap did not name the feature it holds back';
  END IF;

  -- Every registry field has a default with a source and a stated basis.
  v_defaults := public.business_profile_defaults(v_org);
  SELECT string_agg(r.field, ', ') INTO v_missing
  FROM public.profile_field_registry r
  WHERE NOT (v_defaults ? r.field)
     OR COALESCE(v_defaults #>> ARRAY[r.field, 'source'], '') = ''
     OR COALESCE(v_defaults #>> ARRAY[r.field, 'basis'], '') = '';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'fields with no defensible default: %', v_missing;
  END IF;

  -- Saving versions the previous state with the actor and the fields that moved.
  SELECT version INTO v_version FROM public.business_profiles WHERE org_id = v_org;
  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object(
      'offer_name', 'Scale Accelerator',
      'offer_type', 'coaching',
      'price_point_cents', 500000,
      'payment_structure', 'pif_or_plan',
      'sales_cycle_days', 45,
      'touches_to_close', 8,
      'close_motion', 'two_call',
      'team_structure', 'setter_closer',
      'monthly_lead_volume', 120,
      'monthly_lead_target', 160,
      'stated_close_rate_pct', 20
    ),
    'business'
  );

  IF (SELECT version FROM public.business_profiles WHERE org_id = v_org) <> v_version + 1 THEN
    RAISE EXCEPTION 'saving the profile must bump the version';
  END IF;

  SELECT changed_fields, actor_member_id INTO v_changed, v_actor
  FROM public.business_profile_versions
  WHERE org_id = v_org ORDER BY version DESC LIMIT 1;
  IF v_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'the version row must record who changed it';
  END IF;
  IF NOT ('price_point_cents' = ANY (v_changed)) THEN
    RAISE EXCEPTION 'the version row must list the fields that changed, got %', v_changed;
  END IF;
  IF (SELECT snapshot ->> 'price_point_cents' FROM public.business_profile_versions
      WHERE org_id = v_org ORDER BY version DESC LIMIT 1) IS NOT NULL THEN
    RAISE EXCEPTION 'the version snapshot must hold the state before the change';
  END IF;

  -- The stage is recorded so a client can stop and resume.
  IF (SELECT completed_at FROM public.business_profile_stages
      WHERE org_id = v_org AND stage = 'business') IS NULL THEN
    RAISE EXCEPTION 'submitting a stage must record it as complete';
  END IF;

  -- Completeness moved and the answered fields are no longer gaps.
  v_completeness := public.business_profile_completeness(v_org);
  IF (v_completeness ->> 'score')::integer = 0 THEN
    RAISE EXCEPTION 'completeness did not move after eleven fields were answered';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_completeness -> 'gaps') g WHERE g ->> 'field' = 'price_point_cents'
  ) THEN
    RAISE EXCEPTION 'an answered field is still reported as a gap';
  END IF;

  -- Bookkeeping columns are not writable through the patch.
  PERFORM public.save_business_profile(v_org, v_owner, jsonb_build_object('version', 999), NULL);
  IF (SELECT version FROM public.business_profiles WHERE org_id = v_org) = 999 THEN
    RAISE EXCEPTION 'the caller must not be able to set the version';
  END IF;

  v_state := public.business_profile_state(v_org);
  IF jsonb_array_length(v_state -> 'versions') = 0 THEN
    RAISE EXCEPTION 'the state payload must expose version history';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Applying a stage writes the configuration the platform already reads
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000001';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000b1';
  sc public.score_configs%ROWTYPE;
  v_soft integer;
  v_hard integer;
  v_rules integer;
  v_enabled boolean;
BEGIN
  PERFORM public.apply_business_profile_configuration(v_org, v_owner, 'business');

  IF (SELECT sales_cycle_days FROM public.organizations WHERE id = v_org) <> 45 THEN
    RAISE EXCEPTION 'the stated sales cycle did not reach cohort maturation';
  END IF;
  SELECT ghost_days_soft, ghost_days_hard INTO v_soft, v_hard
  FROM public.score_configs WHERE org_id = v_org;
  IF v_soft >= v_hard OR v_soft < 3 THEN
    RAISE EXCEPTION 'ghost thresholds are not derived sanely: % and %', v_soft, v_hard;
  END IF;
  IF (SELECT max_sequence_length FROM public.follow_up_settings WHERE org_id = v_org) <> 4 THEN
    RAISE EXCEPTION 'sequence length should be paced from eight touches to close';
  END IF;

  -- Qualification signals become scoring weights that still total 100.
  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object(
      'qualification_signals', jsonb_build_array('has_budget', 'urgent_timeline'),
      'disqualifiers', jsonb_build_array('no_budget', 'pre_revenue'),
      'price_bands', jsonb_build_array(
        jsonb_build_object('answer', 'under 5k', 'score', 20),
        jsonb_build_object('answer', '5k', 'score', 60),
        jsonb_build_object('answer', '15k', 'score', 95)
      ),
      'timeline_bands', jsonb_build_array(
        jsonb_build_object('answer', 'immediately', 'score', 100),
        jsonb_build_object('answer', '90 days', 'score', 30)
      )
    ),
    'qualification'
  );
  PERFORM public.apply_business_profile_configuration(v_org, v_owner, 'qualification');

  SELECT * INTO sc FROM public.score_configs WHERE org_id = v_org;
  IF sc.timeline_weight + sc.investment_capacity_weight
     + sc.decision_authority_weight + sc.pain_severity_weight <> 100 THEN
    RAISE EXCEPTION 'derived weights do not total 100';
  END IF;
  IF sc.investment_capacity_weight <= sc.pain_severity_weight THEN
    RAISE EXCEPTION 'a budget signal should have raised investment capacity above the unnamed factors';
  END IF;

  SELECT count(*) INTO v_rules
  FROM public.score_field_rules r
  JOIN public.score_field_maps m ON m.id = r.field_map_id
  WHERE m.org_id = v_org AND m.field_name = 'budget';
  IF v_rules <> 3 THEN
    RAISE EXCEPTION 'the three stated investment bands did not become answer rules, got %', v_rules;
  END IF;

  -- Speed-to-lead intent becomes the alarm window, and a CRM sequence the
  -- client already runs switches the matching Vistrial branch off.
  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object(
      'speed_to_lead_intent_minutes', 10,
      'setter_establishes', jsonb_build_array('budget_confirmed', 'timeline_confirmed'),
      'after_no_show', 'crm_sequence',
      'after_call', 'manual_only',
      'after_silence', 'nothing'
    ),
    'process'
  );
  PERFORM public.apply_business_profile_configuration(v_org, v_owner, 'process');

  IF (SELECT speed_to_lead_minutes FROM public.score_configs WHERE org_id = v_org) <> 10 THEN
    RAISE EXCEPTION 'the stated speed-to-lead intent did not become the alarm window';
  END IF;
  SELECT enabled INTO v_enabled FROM public.follow_up_routing_rules
  WHERE org_id = v_org AND branch = 'no_show';
  IF v_enabled IS NOT FALSE THEN
    RAISE EXCEPTION 'a CRM sequence the client already runs must switch off the matching branch';
  END IF;
  SELECT enabled INTO v_enabled FROM public.follow_up_routing_rules
  WHERE org_id = v_org AND branch = 'ghost_risk';
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'a branch the CRM does not cover must stay on';
  END IF;

  -- Objections seed the taxonomy before a transcript exists.
  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object('top_objections', jsonb_build_array(
      jsonb_build_object('type', 'price', 'phrasing', 'I need to think about the money',
        'response', 'What would have to be true for the money to be a yes?'),
      jsonb_build_object('type', 'spouse_partner', 'phrasing', 'I have to run it past my wife',
        'response', 'Let us get her on the next call.')
    )),
    'objections'
  );
  PERFORM public.apply_business_profile_configuration(v_org, v_owner, 'objections');
  IF (SELECT count(*) FROM public.objection_vocabulary WHERE org_id = v_org) <> 2 THEN
    RAISE EXCEPTION 'the stated objections did not seed the vocabulary';
  END IF;

  -- Voice reaches the generator's profile.
  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object(
      'voice_formality', 'casual',
      'never_say', jsonb_build_array('unlock', 'game-changer'),
      'channel_preference', 'email'
    ),
    'voice'
  );
  PERFORM public.apply_business_profile_configuration(v_org, v_owner, 'voice');
  IF NOT ('unlock' = ANY (SELECT unnest(banned_words) FROM public.org_voice_profiles WHERE org_id = v_org)) THEN
    RAISE EXCEPTION 'a word the client never uses did not reach the banned list';
  END IF;
  IF (SELECT default_channel FROM public.follow_up_settings WHERE org_id = v_org) <> 'email' THEN
    RAISE EXCEPTION 'the stated channel preference did not become the default channel';
  END IF;

  -- Funnel answers route application fields to factors.
  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object(
      'lead_channels', jsonb_build_array('meta_ads', 'referral'),
      'application_fields', jsonb_build_array(
        jsonb_build_object('answer_key', 'monthly_revenue', 'factor', 'investment_capacity')
      )
    ),
    'funnel'
  );
  PERFORM public.apply_business_profile_configuration(v_org, v_owner, 'funnel');
  IF NOT EXISTS (
    SELECT 1 FROM public.score_field_maps
    WHERE org_id = v_org AND field_name = 'monthly_revenue' AND factor = 'investment_capacity'
  ) THEN
    RAISE EXCEPTION 'an application answer did not reach the scoring field map';
  END IF;

  -- Declared channels are what "a source you never told us about" is measured against.
  IF public.profile_source_is_declared(v_org, 'facebook ads') IS NOT TRUE THEN
    RAISE EXCEPTION 'a declared meta channel should recognise a facebook source';
  END IF;
  IF public.profile_source_is_declared(v_org, 'tiktok') IS NOT FALSE THEN
    RAISE EXCEPTION 'an undeclared channel must not be reported as declared';
  END IF;

  PERFORM public.save_business_profile(
    v_org, v_owner,
    jsonb_build_object('goal_metric', 'clients_per_month', 'goal_value', 12),
    'goals'
  );
END
$$;

-- ---------------------------------------------------------------------------
-- Baseline history for the Leak Report, laid out so every figure is checkable
-- by hand: 100 contacts, 40 never touched, 60 touched (30 at +10m, 30 at +50m),
-- 25 with exactly one touch of which 10 closed, 40 bookings of which 10 no-show,
-- 50 from facebook (10 closes) and 50 from google (none).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000001';
  v_run uuid := '2222e222-2222-4222-8222-00000000c001';
  v_lead uuid;
  i integer;
  v_created timestamptz;
BEGIN
  INSERT INTO public.baseline_runs (
    id, org_id, status, grade, lookback_days, window_start, window_end,
    contacts_seen, contacts_with_created_date, contacts_with_activity,
    opportunities_seen, opportunities_with_value, finished_at
  ) VALUES (
    v_run, v_org, 'completed', 'usable', 365,
    now() - interval '365 days', now(), 100, 100, 60, 10, 10, now()
  );

  FOR i IN 1..100 LOOP
    v_lead := ('2222e222-2222-4222-8222-' || lpad((100000 + i)::text, 12, '0'))::uuid;
    v_created := now() - interval '200 days' + (i || ' hours')::interval;
    INSERT INTO public.baseline_leads (
      id, org_id, run_id, ghl_contact_id, created_at_crm, source, first_human_touch_at
    ) VALUES (
      v_lead, v_org, v_run, 'bp_contact_' || i, v_created,
      CASE WHEN i <= 50 THEN 'facebook ads' ELSE 'google' END,
      CASE
        WHEN i <= 30 THEN v_created + interval '10 minutes'
        WHEN i <= 60 THEN v_created + interval '50 minutes'
        ELSE NULL
      END
    );

    IF i <= 25 THEN
      INSERT INTO public.baseline_touches (org_id, run_id, baseline_lead_id, type, channel, direction, occurred_at)
      VALUES (v_org, v_run, v_lead, 'human', 'sms', 'outbound', v_created + interval '10 minutes');
    ELSIF i <= 60 THEN
      INSERT INTO public.baseline_touches (org_id, run_id, baseline_lead_id, type, channel, direction, occurred_at)
      VALUES
        (v_org, v_run, v_lead, 'human', 'sms', 'outbound', v_created + interval '50 minutes'),
        (v_org, v_run, v_lead, 'human', 'call', 'outbound', v_created + interval '2 days');
    END IF;

    IF i <= 10 THEN
      INSERT INTO public.baseline_revenue (org_id, run_id, baseline_lead_id, amount_cents, occurred_at, source)
      VALUES (v_org, v_run, v_lead, 500000, v_created + interval '30 days', 'opportunity');
    END IF;

    IF i <= 40 THEN
      INSERT INTO public.baseline_calls (org_id, run_id, baseline_lead_id, scheduled_at, occurred_at, outcome)
      VALUES (
        v_org, v_run, v_lead, v_created + interval '3 days', v_created + interval '3 days',
        CASE WHEN i <= 30 THEN 'held'::public.call_outcome ELSE 'no_show'::public.call_outcome END
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000001';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000b1';
  v_report jsonb;
  v_f jsonb;
  v_id uuid;
  v_latest jsonb;
BEGIN
  v_report := public.leak_report_compute(v_org);

  IF v_report ->> 'basis' <> 'backfill' THEN
    RAISE EXCEPTION 'a usable backfill should produce a measured report, got %', v_report ->> 'basis';
  END IF;

  -- Never touched: 40 of 100, worth 40 * 20 percent * 5,000 dollars.
  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f WHERE f ->> 'key' = 'never_touched';
  IF (v_f -> 'rate' ->> 'k')::integer <> 40 OR (v_f -> 'rate' ->> 'n')::integer <> 100 THEN
    RAISE EXCEPTION 'never-touched should be 40 of 100, got % of %',
      v_f -> 'rate' ->> 'k', v_f -> 'rate' ->> 'n';
  END IF;
  IF (v_f -> 'rate' ->> 'pct')::numeric <> 40.0 THEN
    RAISE EXCEPTION 'never-touched should be 40 percent, got %', v_f -> 'rate' ->> 'pct';
  END IF;
  IF (v_f ->> 'value_estimate_cents')::bigint <> 4000000 THEN
    RAISE EXCEPTION 'the value estimate should be 4,000,000 cents, got %', v_f ->> 'value_estimate_cents';
  END IF;
  IF position('Estimate' in (v_f ->> 'estimate_basis')) = 0 THEN
    RAISE EXCEPTION 'a value estimate must be labelled as an estimate';
  END IF;

  -- Speed to lead: median of thirty tens and thirty fifties is 30 minutes.
  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f WHERE f ->> 'key' = 'speed_to_lead';
  IF (v_f ->> 'actual_median_minutes')::numeric <> 30.0 THEN
    RAISE EXCEPTION 'the real median should be 30 minutes, got %', v_f ->> 'actual_median_minutes';
  END IF;
  IF (v_f ->> 'intent_minutes')::integer <> 10 THEN
    RAISE EXCEPTION 'the report should carry the stated intent of 10 minutes';
  END IF;

  -- Quiet after one touch: 25 single-touch contacts less the 10 that closed.
  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f
  WHERE f ->> 'key' = 'quiet_after_one_touch';
  IF (v_f -> 'rate' ->> 'k')::integer <> 15 THEN
    RAISE EXCEPTION 'one-touch-then-silence should be 15, got %', v_f -> 'rate' ->> 'k';
  END IF;

  -- Show rate: 30 held of 40 resolved bookings, 10 no-shows.
  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f WHERE f ->> 'key' = 'show_rate';
  IF (v_f -> 'rate' ->> 'pct')::numeric <> 75.0 THEN
    RAISE EXCEPTION 'show rate should be 75 percent, got %', v_f -> 'rate' ->> 'pct';
  END IF;
  IF (v_f ->> 'no_show_count')::integer <> 10 THEN
    RAISE EXCEPTION 'there should be 10 no-shows, got %', v_f ->> 'no_show_count';
  END IF;

  -- Close rate by source names the source with volume and no closes.
  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f
  WHERE f ->> 'key' = 'close_rate_by_source';
  IF NOT (v_f -> 'zero_close_sources' @> '["google"]'::jsonb) THEN
    RAISE EXCEPTION 'a source with volume and no closes must be named, got %', v_f -> 'zero_close_sources';
  END IF;
  IF v_f -> 'zero_close_sources' @> '["facebook ads"]'::jsonb THEN
    RAISE EXCEPTION 'a source that does close must not be named as a zero-close source';
  END IF;

  -- Where deals die cannot be measured from CRM history, and says so.
  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f WHERE f ->> 'key' = 'where_deals_die';
  IF (v_f ->> 'measured')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'cause of death should not claim to be measured with no terminal events';
  END IF;
  IF position('Not measured' in (v_f ->> 'trace')) = 0 THEN
    RAISE EXCEPTION 'an unmeasurable finding must say so rather than fill the gap';
  END IF;

  -- Every finding names a fix.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_report -> 'findings') f
    WHERE char_length(COALESCE(f ->> 'fix', '')) = 0
  ) THEN
    RAISE EXCEPTION 'a finding was produced with no fix beside it';
  END IF;

  -- Regeneration compares against the first cut from the same baseline.
  v_id := public.leak_report_generate(v_org, v_owner);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'generating the report returned nothing';
  END IF;
  PERFORM public.leak_report_generate(v_org, v_owner);
  v_latest := public.leak_report_latest(v_org);
  IF jsonb_array_length(v_latest -> 'history') <> 2 THEN
    RAISE EXCEPTION 'both generations should be kept, got %', jsonb_array_length(v_latest -> 'history');
  END IF;
  IF NOT (v_latest -> 'payload' ? 'movement') THEN
    RAISE EXCEPTION 'a later report must show movement against the first one';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_latest -> 'payload' -> 'movement') m
    WHERE m ->> 'key' = 'never_touched' AND (m ->> 'delta')::numeric = 0
  ) THEN
    RAISE EXCEPTION 'movement against an unchanged baseline should be zero, not absent';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A partial grade names what is missing; an unusable grade produces a
-- stated-figures report and fabricates nothing.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000001';
  v_run uuid := '2222e222-2222-4222-8222-00000000c001';
  v_report jsonb;
  v_f jsonb;
BEGIN
  UPDATE public.baseline_runs
  SET grade = 'partial', grade_reasons = ARRAY['fewer than 70 percent of contacts carry a creation date']
  WHERE id = v_run;

  v_report := public.leak_report_compute(v_org);
  IF v_report ->> 'basis' <> 'backfill_partial' THEN
    RAISE EXCEPTION 'a partial grade should be carried on the report';
  END IF;
  IF jsonb_array_length(v_report -> 'missing') = 0 THEN
    RAISE EXCEPTION 'a partial grade must state what is missing';
  END IF;

  UPDATE public.baseline_runs SET grade = 'unusable' WHERE id = v_run;
  v_report := public.leak_report_compute(v_org);
  IF v_report ->> 'basis' <> 'profile_only' THEN
    RAISE EXCEPTION 'an unusable grade must fall back to the stated figures';
  END IF;
  IF position('stated figures' in (v_report ->> 'basis_label')) = 0 THEN
    RAISE EXCEPTION 'a profile-only report must be labelled as such';
  END IF;

  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f WHERE f ->> 'key' = 'never_touched';
  IF (v_f ->> 'shown')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'a measured finding must not appear when there is nothing to measure';
  END IF;

  SELECT f INTO v_f FROM jsonb_array_elements(v_report -> 'findings') f WHERE f ->> 'key' = 'stated_shape';
  IF (v_f -> 'stated' ->> 'implied_clients_per_month')::numeric <> 24.0 THEN
    RAISE EXCEPTION '120 leads at 20 percent should imply 24 clients, got %',
      v_f -> 'stated' ->> 'implied_clients_per_month';
  END IF;
  IF (v_f ->> 'measured')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'stated figures must never be presented as measured';
  END IF;

  UPDATE public.baseline_runs SET grade = 'usable', grade_reasons = '{}' WHERE id = v_run;
END
$$;

-- ---------------------------------------------------------------------------
-- The compounding layer: minimum cohort size, opt-out, and disclosure
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  i integer;
  v_org uuid;
  v_user uuid;
  v_written integer;
BEGIN
  -- Four comparable businesses. One short of the minimum.
  FOR i IN 1..4 LOOP
    v_org := ('2222e222-2222-4222-8222-' || lpad((200000 + i)::text, 12, '0'))::uuid;
    v_user := ('2222e222-2222-4222-8222-' || lpad((300000 + i)::text, 12, '0'))::uuid;
    INSERT INTO auth.users (id, email) VALUES (v_user, 'cohort' || i || '@vistrial.local');
    INSERT INTO public.organizations (id, name, slug, activated_at)
    VALUES (v_org, 'Cohort ' || i, 'cohort-' || i, now() - interval '120 days');
    INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
    VALUES (v_org, v_user, 'owner', 'Cohort Owner ' || i, 'cohort' || i || '@vistrial.local');
    PERFORM public.save_business_profile(v_org, NULL, jsonb_build_object(
      'offer_type', 'consulting', 'price_point_cents', 700000,
      'monthly_lead_volume', 100, 'touches_to_close', 5
    ), NULL);
    INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
    VALUES (v_org, 'close_rate', 10 + i, 40, 'backfill');
  END LOOP;

  PERFORM public.benchmark_refresh_cohorts();
  IF EXISTS (
    SELECT 1 FROM public.benchmark_cohorts
    WHERE cohort_key = public.profile_cohort_key('consulting', 700000, 100)
  ) THEN
    RAISE EXCEPTION 'a cohort of four must not be written at all';
  END IF;
  IF EXISTS (SELECT 1 FROM public.configuration_priors) THEN
    RAISE EXCEPTION 'priors must not be written below the minimum cohort size';
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000200005';
  v_user uuid := '2222e222-2222-4222-8222-000000300005';
  v_out_org uuid := '2222e222-2222-4222-8222-000000200099';
  v_out_user uuid := '2222e222-2222-4222-8222-000000300099';
  v_key text := public.profile_cohort_key('consulting', 700000, 100);
  v_median numeric;
  v_count integer;
  v_bench jsonb;
  v_priors jsonb;
  v_threshold integer;
BEGIN
  -- The fifth business takes the cohort to the minimum.
  INSERT INTO auth.users (id, email) VALUES (v_user, 'cohort5@vistrial.local');
  INSERT INTO public.organizations (id, name, slug, activated_at)
  VALUES (v_org, 'Cohort 5', 'cohort-5', now() - interval '120 days');
  INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
  VALUES (v_org, v_user, 'owner', 'Cohort Owner 5', 'cohort5@vistrial.local');
  PERFORM public.save_business_profile(v_org, NULL, jsonb_build_object(
    'offer_type', 'consulting', 'price_point_cents', 700000,
    'monthly_lead_volume', 100, 'touches_to_close', 5
  ), NULL);
  INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
  VALUES (v_org, 'close_rate', 15, 40, 'backfill');

  PERFORM public.benchmark_refresh_cohorts();
  SELECT median_value, org_count INTO v_median, v_count
  FROM public.benchmark_cohorts WHERE cohort_key = v_key AND metric = 'close_rate';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'the cohort should hold five businesses, got %', v_count;
  END IF;
  IF v_median <> 13.0 THEN
    RAISE EXCEPTION 'the median of 11, 12, 13, 14, 15 is 13, got %', v_median;
  END IF;

  -- The aggregate carries no org id, so no figure can be traced back.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'benchmark_cohorts' AND column_name = 'org_id'
  ) THEN
    RAISE EXCEPTION 'the cross-client aggregate must not carry an org id';
  END IF;

  -- A sixth business opts out. Its extreme figure must not move the median,
  -- and it must still receive the benchmark.
  INSERT INTO auth.users (id, email) VALUES (v_out_user, 'optout@vistrial.local');
  INSERT INTO public.organizations (id, name, slug, activated_at)
  VALUES (v_out_org, 'Opted Out Co', 'opted-out-co', now() - interval '120 days');
  INSERT INTO public.org_members (org_id, user_id, role, display_name, email)
  VALUES (v_out_org, v_out_user, 'owner', 'Opt Out Owner', 'optout@vistrial.local');
  PERFORM public.save_business_profile(v_out_org, NULL, jsonb_build_object(
    'offer_type', 'consulting', 'price_point_cents', 700000, 'monthly_lead_volume', 100,
    'touches_to_close', 5, 'aggregate_opt_out', true
  ), NULL);
  INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
  VALUES (v_out_org, 'close_rate', 900, 40, 'backfill');

  PERFORM public.benchmark_refresh_cohorts();
  SELECT median_value, org_count INTO v_median, v_count
  FROM public.benchmark_cohorts WHERE cohort_key = v_key AND metric = 'close_rate';
  IF v_count <> 5 OR v_median <> 13.0 THEN
    RAISE EXCEPTION 'an opted-out business still fed the aggregate: % businesses, median %', v_count, v_median;
  END IF;

  v_bench := public.benchmark_for_org(v_out_org);
  IF (v_bench ->> 'shown')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'an opted-out business must still receive benchmarks';
  END IF;
  IF char_length(COALESCE(v_bench ->> 'basis', '')) = 0 THEN
    RAISE EXCEPTION 'a benchmark must disclose how it was matched';
  END IF;
  IF (v_bench ->> 'org_count')::integer <> 5 THEN
    RAISE EXCEPTION 'a benchmark must disclose how many businesses it represents';
  END IF;

  -- Priors pre-fill and are never applied on their own.
  SELECT ready_threshold INTO v_threshold FROM public.score_configs WHERE org_id = v_org;
  v_priors := public.configuration_priors_for_org(v_org);
  IF NOT (v_priors ? 'ready_threshold') THEN
    RAISE EXCEPTION 'a cohort at the minimum should produce priors';
  END IF;
  IF char_length(COALESCE(v_priors #>> '{ready_threshold,basis}', '')) = 0 THEN
    RAISE EXCEPTION 'a prior must state what it is drawn from';
  END IF;
  IF (SELECT ready_threshold FROM public.score_configs WHERE org_id = v_org) <> v_threshold THEN
    RAISE EXCEPTION 'reading a prior must not change a setting';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The activation gate. Each hard requirement is broken on its own.
-- ---------------------------------------------------------------------------

INSERT INTO public.organizations (id, name, slug)
VALUES ('2222e222-2222-4222-8222-000000000002', 'Gate Co', 'gate-co');

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '2222e222-2222-4222-8222-0000000000c1', '2222e222-2222-4222-8222-000000000002',
  '2222e222-2222-4222-8222-00000000a003', 'owner', 'Gate Owner', 'gate-owner@vistrial.local'
);

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000002';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000c1';
  v_lead uuid := '2222e222-2222-4222-8222-00000000d001';
  v_state jsonb;
  v_blocked boolean;
  v_at timestamptz;
  v_acks public.activation_warning[];
BEGIN
  -- 1. No CRM connection.
  v_state := public.activation_readiness(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'crm_connected' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'a workspace with no CRM should fail the connection requirement';
  END IF;
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, '{}');
    RAISE EXCEPTION 'activation went through with no CRM connected';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('blocked' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  INSERT INTO public.ghl_connections (org_id, location_id, status, last_verified_at)
  VALUES (v_org, 'ghl_loc_gate', 'active', now());

  -- 2. The backfill has not resolved.
  v_state := public.activation_readiness(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'backfill_resolved' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'a workspace with no backfill should fail the baseline requirement';
  END IF;

  -- An unusable grade on its own is not resolved.
  INSERT INTO public.baseline_runs (
    id, org_id, status, grade, lookback_days, window_start, window_end, finished_at
  ) VALUES (
    '2222e222-2222-4222-8222-00000000c002', v_org, 'skipped', 'unusable', 365,
    now() - interval '365 days', now(), now()
  );
  v_state := public.activation_readiness(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'backfill_resolved' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'an unusable grade with no stated figures must not count as resolved';
  END IF;

  -- Declining prior figures resolves it without inventing a baseline.
  PERFORM public.decline_baseline_fallback(v_org, v_owner, 'Owner does not have the old numbers.');
  v_state := public.activation_readiness(v_org);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'backfill_resolved' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'an explicit decline should resolve the baseline requirement';
  END IF;

  -- 3. No field mapping, so no real lead is scored.
  v_state := public.activation_readiness(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'field_mapping_valid' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'no mapped fields should fail the mapping requirement';
  END IF;
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, '{}');
    RAISE EXCEPTION 'activation went through with no field mapping';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('blocked' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  INSERT INTO public.ghl_field_maps (org_id, ghl_field_key, answer_key)
  VALUES (v_org, 'budget_field', 'budget');
  INSERT INTO public.leads (id, org_id, first_name, email, status, opted_in_at, application_answers)
  VALUES (v_lead, v_org, 'Gate', 'gate-lead@example.test', 'new', now() - interval '2 days',
    '{"budget":"15k"}'::jsonb);
  INSERT INTO public.readiness_scores (org_id, lead_id, timeline_raw, investment_capacity_raw, total, reasoning, triggered_by)
  VALUES (v_org, v_lead, 80, 80, 80, 'Seeded for the gate check.', 'intake');

  v_state := public.activation_readiness(v_org);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'field_mapping_valid' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'a mapped field producing a real score should satisfy the mapping requirement';
  END IF;

  -- 4. Scoring with no answer rules.
  DELETE FROM public.score_field_maps WHERE org_id = v_org;
  v_state := public.activation_readiness(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'scoring_valid' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'scoring with no answer rules should fail the scoring requirement';
  END IF;
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, '{}');
    RAISE EXCEPTION 'activation went through with invalid scoring';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('blocked' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
  PERFORM public.seed_default_score_maps(v_org);

  -- 5. Nobody active who can work leads. Platform admins are enrolled as
  -- owners everywhere and cannot be deactivated, so they are removed from this
  -- org for the check and re-enrolled straight after.
  DELETE FROM public.org_members m
  WHERE m.org_id = v_org
    AND EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = m.user_id);
  UPDATE public.org_members SET active = false WHERE org_id = v_org;
  v_state := public.activation_readiness(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'hard') h
    WHERE h ->> 'key' = 'active_member' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'a workspace with nobody active should fail the member requirement';
  END IF;
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, '{}');
    RAISE EXCEPTION 'activation went through with nobody active';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    NULL;
  END;
  UPDATE public.org_members SET active = true WHERE org_id = v_org;
  PERFORM public.enroll_platform_admin_in_orgs(pa.user_id) FROM public.platform_admins pa;

  -- Every hard requirement now passes and only the warnings remain.
  v_state := public.activation_readiness(v_org);
  IF (v_state ->> 'blocked')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'the gate is still blocked: %', v_state -> 'hard';
  END IF;
  IF jsonb_array_length(v_state -> 'warnings') = 0 THEN
    RAISE EXCEPTION 'a workspace with no voice examples and no transcript source should warn';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'warnings') w WHERE w ->> 'key' = 'profile_incomplete'
  ) THEN
    RAISE EXCEPTION 'an empty profile should warn, naming what it holds back';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_state -> 'warnings') w
    WHERE w ->> 'key' = 'profile_incomplete' AND jsonb_array_length(w -> 'affects') > 0
  ) THEN
    RAISE EXCEPTION 'the completeness warning must name the affected features';
  END IF;

  -- An unacknowledged warning blocks.
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, '{}');
    RAISE EXCEPTION 'activation went through with unacknowledged warnings';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('unacknowledged' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  SELECT array_agg((w ->> 'key')::public.activation_warning) INTO v_acks
  FROM jsonb_array_elements(v_state -> 'warnings') w;

  v_at := public.activate_org(v_org, v_owner, v_acks);
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'activation returned no timestamp';
  END IF;
  IF (SELECT activated_at FROM public.organizations WHERE id = v_org) IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'the org timestamp does not match the one returned';
  END IF;
  IF (SELECT warnings_acknowledged FROM public.activation_records WHERE org_id = v_org) IS DISTINCT FROM v_acks THEN
    RAISE EXCEPTION 'the acknowledged warnings were not recorded with the activation';
  END IF;
  IF (SELECT activated_by_member_id FROM public.activation_records WHERE org_id = v_org) <> v_owner THEN
    RAISE EXCEPTION 'the activation did not record who did it';
  END IF;
  IF (SELECT jsonb_array_length(requirements) FROM public.activation_records WHERE org_id = v_org) <> 5 THEN
    RAISE EXCEPTION 'the state of all five hard requirements should be kept with the activation';
  END IF;

  -- Captured once.
  BEGIN
    PERFORM public.activate_org(v_org, v_owner, v_acks);
    RAISE EXCEPTION 'a workspace was activated twice';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('once' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000002';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000c1';
  v_new timestamptz := now() - interval '30 days';
BEGIN
  -- Moving the line is deliberate: a written reason of real length, recorded.
  BEGIN
    PERFORM public.change_activation_timestamp(v_org, v_owner, v_new, 'oops');
    RAISE EXCEPTION 'the activation timestamp moved without a written reason';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('written reason' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.change_activation_timestamp(v_org, v_owner, now() + interval '1 day',
      'Backdating to when the team actually started working leads.');
    RAISE EXCEPTION 'the activation timestamp was moved into the future';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF position('future' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  PERFORM public.change_activation_timestamp(v_org, v_owner, v_new,
    'Backdating to the day the team actually started working leads in Vistrial.');

  IF (SELECT activated_at FROM public.organizations WHERE id = v_org) IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION 'the timestamp did not move';
  END IF;
  IF (SELECT count(*) FROM public.activation_changes WHERE org_id = v_org) <> 1 THEN
    RAISE EXCEPTION 'the change was not recorded';
  END IF;
  IF (SELECT changed_by_member_id FROM public.activation_changes WHERE org_id = v_org) <> v_owner THEN
    RAISE EXCEPTION 'the change did not record who made it';
  END IF;
  IF (SELECT activated_at FROM public.activation_records WHERE org_id = v_org) IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION 'the permanent record was not kept in step with the move';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Stated against observed, and the review prompts
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000002';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000c1';
  v_lead uuid;
  i integer;
  v_found integer;
  v_id uuid;
BEGIN
  -- A deliberate mismatch: they aim for ten minutes, the data says two hours.
  PERFORM public.save_business_profile(v_org, v_owner, jsonb_build_object(
    'speed_to_lead_intent_minutes', 10, 'monthly_lead_volume', 5, 'price_point_cents', 500000
  ), NULL);

  FOR i IN 1..25 LOOP
    v_lead := ('2222e222-2222-4222-8222-' || lpad((400000 + i)::text, 12, '0'))::uuid;
    INSERT INTO public.leads (
      id, org_id, first_name, email, status, opted_in_at, first_human_touch_at
    ) VALUES (
      v_lead, v_org, 'Slow', 'slow' || i || '@example.test', 'working',
      now() - interval '10 days', now() - interval '10 days' + interval '120 minutes'
    );
  END LOOP;

  v_found := public.profile_detect_signals(v_org);
  IF v_found = 0 THEN
    RAISE EXCEPTION 'a deliberate mismatch produced no signal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profile_contradictions
    WHERE org_id = v_org AND kind = 'speed_to_lead' AND dismissed_at IS NULL
      AND observed LIKE '%120 minutes%'
  ) THEN
    RAISE EXCEPTION 'the speed-to-lead contradiction was not surfaced';
  END IF;

  -- A large volume shift raises a review prompt.
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_review_prompts
    WHERE org_id = v_org AND reason = 'volume_change' AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION '25 leads against a stated 5 should raise a volume review prompt';
  END IF;

  -- Running twice does not duplicate an open signal.
  PERFORM public.profile_detect_signals(v_org);
  IF (SELECT count(*) FROM public.profile_contradictions
      WHERE org_id = v_org AND kind = 'speed_to_lead' AND dismissed_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'an open contradiction was duplicated';
  END IF;

  SELECT id INTO v_id FROM public.profile_contradictions
  WHERE org_id = v_org AND kind = 'speed_to_lead' AND dismissed_at IS NULL;
  PERFORM public.dismiss_profile_contradiction(v_org, v_id, v_owner);
  IF (SELECT dismissed_at FROM public.profile_contradictions WHERE id = v_id) IS NULL THEN
    RAISE EXCEPTION 'dismissing a contradiction did not stick';
  END IF;

  SELECT id INTO v_id FROM public.profile_review_prompts
  WHERE org_id = v_org AND reason = 'volume_change' AND resolved_at IS NULL;
  PERFORM public.resolve_profile_review_prompt(v_org, v_id, v_owner);
  IF (SELECT resolved_at FROM public.profile_review_prompts WHERE id = v_id) IS NULL THEN
    RAISE EXCEPTION 'resolving a review prompt did not stick';
  END IF;
END
$$;

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000002';
BEGIN
  -- A profile untouched for a quarter asks to be reviewed.
  UPDATE public.business_profiles
  SET last_reviewed_at = now() - interval '100 days' WHERE org_id = v_org;
  PERFORM public.profile_detect_signals(v_org);
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_review_prompts
    WHERE org_id = v_org AND reason = 'quarterly' AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a profile last reviewed 100 days ago should prompt a quarterly review';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Adoption watch
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000002';
  v_watch jsonb;
BEGIN
  v_watch := public.adoption_watch(v_org);

  IF (v_watch ->> 'activated')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'an activated workspace should have an adoption watch';
  END IF;
  IF (v_watch ->> 'leads_ingested_24h')::integer <> 0 THEN
    RAISE EXCEPTION 'no lead arrived in the last day, so the count should be zero';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_watch -> 'alarms') a WHERE a ->> 'key' = 'no_leads_24h'
  ) THEN
    RAISE EXCEPTION 'zero leads in twenty-four hours must alarm';
  END IF;
  IF NOT (v_watch -> 'outcome_logging' ? 'this_week') THEN
    RAISE EXCEPTION 'the outcome logging rate must be computed and trended';
  END IF;
  IF jsonb_array_length(v_watch -> 'members') = 0 THEN
    RAISE EXCEPTION 'per-member activity must be reported';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_watch -> 'members') m
    WHERE (m ->> 'touches')::integer = 0 AND (m ->> 'approvals')::integer = 0
  ) THEN
    RAISE EXCEPTION 'a member who has done nothing should be identifiable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_watch -> 'alarms') a
    WHERE char_length(COALESCE(a ->> 'plain', '')) = 0
  ) THEN
    RAISE EXCEPTION 'an alarm was raised with nothing said about it';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Access. The profile follows the revenue rule.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000001';
  v_other uuid := '2222e222-2222-4222-8222-000000000002';
  v_count integer;
  v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '2222e222-2222-4222-8222-00000000a002', false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.business_profiles WHERE org_id = v_org;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'a setter read the business profile';
  END IF;

  SELECT count(*) INTO v_count FROM public.leak_reports WHERE org_id = v_org;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'a setter read the Leak Report';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.business_profile_state(v_org);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'a setter loaded the profile through the RPC';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.save_business_profile(v_org, NULL, jsonb_build_object('offer_name', 'hijacked'), NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RESET ROLE;
    RAISE EXCEPTION 'a setter wrote to the business profile';
  END IF;

  RESET ROLE;

  -- An owner of one org cannot reach another.
  PERFORM set_config('request.jwt.claim.sub', '2222e222-2222-4222-8222-00000000a003', false);
  SET ROLE authenticated;
  v_denied := false;
  BEGIN
    PERFORM public.leak_report_compute(v_org);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'the owner of Gate Co computed a Leak Report for Profile Co';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF v_other IS NULL THEN
    RAISE EXCEPTION 'unreachable';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A client who accepts every default still ends up with a working
-- configuration. Their CRM is connected, because it has to be before a
-- workspace can go live, so the figures only they could know are derived from
-- their own history rather than invented.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email)
VALUES ('2222e222-2222-4222-8222-00000000a004', 'defaults-owner@vistrial.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES ('2222e222-2222-4222-8222-000000000003', 'Defaults Co', 'defaults-co');

INSERT INTO public.org_members (id, org_id, user_id, role, display_name, email)
VALUES (
  '2222e222-2222-4222-8222-0000000000d1', '2222e222-2222-4222-8222-000000000003',
  '2222e222-2222-4222-8222-00000000a004', 'owner', 'Defaults Owner', 'defaults-owner@vistrial.local'
);

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000003';
  v_run uuid := '2222e222-2222-4222-8222-00000000c003';
  v_lead uuid;
  v_created timestamptz;
  i integer;
BEGIN
  INSERT INTO public.baseline_runs (
    id, org_id, status, grade, lookback_days, window_start, window_end,
    contacts_seen, contacts_with_created_date, contacts_with_activity,
    opportunities_seen, opportunities_with_value, finished_at
  ) VALUES (
    v_run, v_org, 'completed', 'usable', 365,
    now() - interval '365 days', now(), 60, 60, 45, 9, 9, now()
  );

  FOR i IN 1..60 LOOP
    v_lead := ('2222e222-2222-4222-8222-' || lpad((700000 + i)::text, 12, '0'))::uuid;
    v_created := now() - interval '300 days' + (i || ' days')::interval;
    INSERT INTO public.baseline_leads (
      id, org_id, run_id, ghl_contact_id, created_at_crm, source, first_human_touch_at
    ) VALUES (
      v_lead, v_org, v_run, 'defaults_ct_' || i, v_created,
      CASE WHEN i % 2 = 0 THEN 'facebook ads' ELSE 'referral' END,
      CASE WHEN i <= 45 THEN v_created + interval '40 minutes' ELSE NULL END
    );
    IF i <= 9 THEN
      INSERT INTO public.baseline_revenue (org_id, run_id, baseline_lead_id, amount_cents, occurred_at, source)
      VALUES (v_org, v_run, v_lead, 450000, v_created + interval '40 days', 'opportunity');
    END IF;
  END LOOP;

  -- One live lead, so the offer name is something we read rather than ask for.
  INSERT INTO public.leads (org_id, ghl_contact_id, first_name, email, offer_name, status, opted_in_at)
  VALUES (v_org, 'defaults_live_1', 'Rae', 'rae@defaults.test', 'Momentum Programme', 'new', now() - interval '2 days');
END
$$;

DO $$
DECLARE
  v_org uuid := '2222e222-2222-4222-8222-000000000003';
  v_owner uuid := '2222e222-2222-4222-8222-0000000000d1';
  v_defaults jsonb;
  v_patch jsonb;
  v_stage public.profile_stage;
  v_field text;
  sc public.score_configs%ROWTYPE;
  v_completeness jsonb;
BEGIN
  FOREACH v_stage IN ARRAY enum_range(NULL::public.profile_stage) LOOP
    -- Defaults are recomputed each time, exactly as the form reloads them.
    v_defaults := public.business_profile_defaults(v_org);
    v_patch := '{}'::jsonb;

    FOR v_field IN
      SELECT reg.field FROM public.profile_field_registry reg WHERE reg.stage = v_stage
    LOOP
      IF v_defaults ? v_field AND (v_defaults #> ARRAY[v_field, 'value']) <> 'null'::jsonb THEN
        v_patch := v_patch || jsonb_build_object(v_field, v_defaults #> ARRAY[v_field, 'value']);
      END IF;
    END LOOP;

    PERFORM public.save_business_profile(v_org, v_owner, v_patch, v_stage);
    PERFORM public.apply_business_profile_configuration(v_org, v_owner, v_stage);
  END LOOP;

  -- The four weights still total 100 and answer rules exist for them to read.
  SELECT * INTO sc FROM public.score_configs WHERE org_id = v_org;
  IF sc.timeline_weight + sc.investment_capacity_weight
     + sc.decision_authority_weight + sc.pain_severity_weight <> 100 THEN
    RAISE EXCEPTION 'accepting the defaults left the weights not totalling 100';
  END IF;
  IF sc.speed_to_lead_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'accepting the defaults left an unusable speed-to-lead window';
  END IF;
  IF sc.ghost_days_soft >= sc.ghost_days_hard THEN
    RAISE EXCEPTION 'accepting the defaults left ghost thresholds the wrong way round';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.score_field_rules rules
    JOIN public.score_field_maps maps ON maps.id = rules.field_map_id
    WHERE maps.org_id = v_org
  ) THEN
    RAISE EXCEPTION 'accepting the defaults left scoring with no answer rules';
  END IF;

  -- Follow-up is configured rather than left half-built.
  IF NOT EXISTS (SELECT 1 FROM public.follow_up_routing_rules WHERE org_id = v_org AND enabled) THEN
    RAISE EXCEPTION 'accepting the defaults left no follow-up branch running';
  END IF;
  IF (SELECT max_sequence_length FROM public.follow_up_settings WHERE org_id = v_org) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'accepting the defaults left an unusable sequence length';
  END IF;

  -- Scoring is the one hard requirement the profile alone can satisfy, and it
  -- has to pass on defaults or the client is stuck before they start.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.activation_readiness(v_org) -> 'hard') h
    WHERE h ->> 'key' = 'scoring_valid' AND (h ->> 'ok')::boolean = false
  ) THEN
    RAISE EXCEPTION 'accepting the defaults did not satisfy the scoring requirement';
  END IF;

  -- Completeness clears the usable threshold, so the client is not warned
  -- about a profile they filled in by taking every answer we suggested.
  v_completeness := public.business_profile_completeness(v_org);
  IF (v_completeness ->> 'score')::integer < public.profile_completeness_min() THEN
    RAISE EXCEPTION
      'accepting every default only reached completeness %, under the usable threshold. Gaps: %',
      v_completeness ->> 'score', v_completeness -> 'gaps';
  END IF;
  -- With a connected CRM there should be nothing left over at all: every field
  -- is either read from their history or carries a cross-client starting point.
  IF jsonb_array_length(v_completeness -> 'gaps') > 0 THEN
    RAISE EXCEPTION 'a field was left with no default at all: %', v_completeness -> 'gaps';
  END IF;

  -- And the report they are promised at the end actually generates.
  PERFORM public.leak_report_generate(v_org, v_owner);
  IF NOT EXISTS (SELECT 1 FROM public.leak_reports WHERE org_id = v_org) THEN
    RAISE EXCEPTION 'accepting the defaults produced no Leak Report';
  END IF;
END
$$;

