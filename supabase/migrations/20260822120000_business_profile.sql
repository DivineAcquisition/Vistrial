-- Prompt 12: the business profile, onboarding, the compounding layer, the Leak
-- Report, the activation gate, and adoption watch.
--
-- Product choices (stated, not guessed. The prompt left these open):
--   * Benchmarks need at least 5 contributing businesses in a cohort. Below
--     that a cohort row is not even written, so there is no table to leak.
--   * A cohort is offer type + price band + monthly lead volume band.
--   * Profile completeness is "answered required fields / required fields".
--     70 is the usable threshold below which activation warns and names the
--     features that degrade.
--   * Leak Report rates use the diagnostic minimum (n >= 20). Under it the
--     count is shown and the rate is withheld, the same honesty rule the rest
--     of reporting already follows.
--   * Activation stops being a side effect of the backfill finishing. It
--     becomes a deliberate, gated act with a recorded actor. Prompt 11 set
--     activated_at inside complete_baseline_run and skip_baseline_backfill;
--     if it kept doing that, four of the five hard requirements below could
--     never block anything.
--   * Every profile column that a person fills in has a row in
--     profile_field_registry naming the feature that reads it. A column
--     without one fails the schema verification, which is how "no field
--     without a named consumer" is enforced rather than promised.
--   * Structured everywhere a vocabulary is possible. Free text survives only
--     where the value is a proper noun (offer name), the prospect's own words
--     (objection phrasing, banned phrases), or the client's own label for a
--     CRM stage.

-- ---------------------------------------------------------------------------
-- Enums (never text + check)
-- ---------------------------------------------------------------------------

CREATE TYPE public.profile_stage AS ENUM (
  'connect',
  'business',
  'funnel',
  'qualification',
  'process',
  'objections',
  'voice',
  'goals'
);

CREATE TYPE public.profile_offer_type AS ENUM (
  'coaching',
  'consulting',
  'agency_service',
  'course',
  'software',
  'done_for_you',
  'other'
);

CREATE TYPE public.profile_payment_structure AS ENUM (
  'pif',
  'plan',
  'pif_or_plan',
  'bnpl',
  'other'
);

CREATE TYPE public.profile_close_motion AS ENUM ('one_call', 'two_call', 'multi_call');

CREATE TYPE public.profile_team_structure AS ENUM (
  'owner_sold',
  'closers_only',
  'setter_closer',
  'setters_only'
);

CREATE TYPE public.profile_lead_channel AS ENUM (
  'meta_ads',
  'google_ads',
  'youtube_ads',
  'tiktok_ads',
  'organic_social',
  'email_list',
  'referral',
  'affiliate',
  'webinar',
  'cold_outbound',
  'podcast',
  'seo',
  'events',
  'other'
);

CREATE TYPE public.profile_qualification_signal AS ENUM (
  'has_budget',
  'urgent_timeline',
  'sole_decision_maker',
  'clear_pain',
  'existing_revenue',
  'tried_alternatives',
  'right_industry',
  'has_team',
  'other'
);

CREATE TYPE public.profile_disqualifier AS ENUM (
  'no_budget',
  'wrong_industry',
  'needs_partner_approval',
  'pre_revenue',
  'seeking_employment',
  'out_of_geography',
  'competitor',
  'other'
);

CREATE TYPE public.profile_setter_fact AS ENUM (
  'budget_confirmed',
  'timeline_confirmed',
  'decision_maker_confirmed',
  'pain_articulated',
  'current_solution',
  'goal_stated',
  'call_purpose_set',
  'other'
);

CREATE TYPE public.profile_existing_followup AS ENUM ('crm_sequence', 'manual_only', 'nothing');

CREATE TYPE public.profile_goal_metric AS ENUM (
  'clients_per_month',
  'revenue_per_month',
  'close_rate',
  'speed_to_lead'
);

CREATE TYPE public.profile_review_reason AS ENUM (
  'quarterly',
  'price_change',
  'volume_change',
  'new_source'
);

CREATE TYPE public.profile_contradiction_kind AS ENUM (
  'close_motion',
  'sales_cycle',
  'top_objection',
  'speed_to_lead',
  'price_point'
);

CREATE TYPE public.benchmark_metric AS ENUM (
  'speed_to_lead_minutes',
  'show_rate',
  'close_rate',
  'touches_to_close'
);

CREATE TYPE public.leak_report_basis AS ENUM ('backfill', 'backfill_partial', 'profile_only');

CREATE TYPE public.activation_requirement AS ENUM (
  'crm_connected',
  'backfill_resolved',
  'field_mapping_valid',
  'scoring_valid',
  'active_member'
);

CREATE TYPE public.activation_warning AS ENUM (
  'no_voice_examples',
  'no_transcript_source',
  'profile_incomplete',
  'backfill_partial'
);

-- ---------------------------------------------------------------------------
-- The business profile
-- ---------------------------------------------------------------------------

CREATE TABLE public.business_profiles (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,

  -- Business shape
  offer_name text,
  offer_type public.profile_offer_type,
  offer_type_other text,
  price_point_cents bigint,
  payment_structure public.profile_payment_structure,
  payment_structure_other text,
  sales_cycle_days integer,
  touches_to_close integer,
  close_motion public.profile_close_motion,
  team_structure public.profile_team_structure,
  monthly_lead_volume integer,
  monthly_lead_target integer,
  stated_close_rate_pct numeric(5, 2),

  -- Lead sources
  lead_channels public.profile_lead_channel[] NOT NULL DEFAULT '{}',
  lead_channels_other text,
  channel_spend_cents jsonb NOT NULL DEFAULT '{}'::jsonb,
  application_fields jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Qualification, in their words
  qualification_signals public.profile_qualification_signal[] NOT NULL DEFAULT '{}',
  qualification_signals_other text,
  disqualifiers public.profile_disqualifier[] NOT NULL DEFAULT '{}',
  disqualifiers_other text,
  price_bands jsonb NOT NULL DEFAULT '[]'::jsonb,
  timeline_bands jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Their sales process
  speed_to_lead_intent_minutes integer,
  setter_establishes public.profile_setter_fact[] NOT NULL DEFAULT '{}',
  setter_establishes_other text,
  pipeline_stage_meanings jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_no_show public.profile_existing_followup,
  after_call public.profile_existing_followup,
  after_silence public.profile_existing_followup,

  -- Objections
  top_objections jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Voice
  never_say text[] NOT NULL DEFAULT '{}',
  voice_formality public.voice_formality,
  channel_preference text,

  -- Goals
  goal_metric public.profile_goal_metric,
  goal_value numeric,

  -- Consent
  aggregate_opt_out boolean NOT NULL DEFAULT false,
  aggregate_opt_out_at timestamptz,

  completeness_score integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  last_reviewed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_profiles_price_positive CHECK (
    price_point_cents IS NULL OR price_point_cents > 0
  ),
  CONSTRAINT business_profiles_sales_cycle_range CHECK (
    sales_cycle_days IS NULL OR sales_cycle_days BETWEEN 1 AND 365
  ),
  CONSTRAINT business_profiles_touches_range CHECK (
    touches_to_close IS NULL OR touches_to_close BETWEEN 1 AND 60
  ),
  CONSTRAINT business_profiles_volume_range CHECK (
    monthly_lead_volume IS NULL OR monthly_lead_volume BETWEEN 0 AND 1000000
  ),
  CONSTRAINT business_profiles_target_range CHECK (
    monthly_lead_target IS NULL OR monthly_lead_target BETWEEN 0 AND 1000000
  ),
  CONSTRAINT business_profiles_close_rate_range CHECK (
    stated_close_rate_pct IS NULL OR stated_close_rate_pct BETWEEN 0 AND 100
  ),
  CONSTRAINT business_profiles_speed_intent_range CHECK (
    speed_to_lead_intent_minutes IS NULL OR speed_to_lead_intent_minutes BETWEEN 1 AND 10080
  ),
  CONSTRAINT business_profiles_goal_value_positive CHECK (
    goal_value IS NULL OR goal_value > 0
  ),
  CONSTRAINT business_profiles_channel_preference CHECK (
    channel_preference IS NULL OR channel_preference IN ('sms', 'email')
  ),
  CONSTRAINT business_profiles_json_arrays CHECK (
    jsonb_typeof(application_fields) = 'array'
    AND jsonb_typeof(price_bands) = 'array'
    AND jsonb_typeof(timeline_bands) = 'array'
    AND jsonb_typeof(pipeline_stage_meanings) = 'array'
    AND jsonb_typeof(top_objections) = 'array'
    AND jsonb_typeof(channel_spend_cents) = 'object'
  ),
  CONSTRAINT business_profiles_opt_out_stamped CHECK (
    aggregate_opt_out = false OR aggregate_opt_out_at IS NOT NULL
  )
);

COMMENT ON TABLE public.business_profiles IS
  'One structured record of how this company sells. Every non-bookkeeping column has a row in profile_field_registry naming the feature that reads it.';

COMMENT ON COLUMN public.business_profiles.stated_close_rate_pct IS
  'Their close rate. Defaulted from the backfill where it is measurable; the Leak Report labels any value derived from it as an estimate.';

COMMENT ON COLUMN public.business_profiles.aggregate_opt_out IS
  'When true this org is excluded from every cross-client aggregate. It still receives benchmarks.';

CREATE TABLE public.business_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT business_profile_versions_org_version_key UNIQUE (org_id, version)
);

COMMENT ON TABLE public.business_profile_versions IS
  'The profile as it stood before each change, with the fields that changed and who changed them. A price change makes every earlier score interpretable instead of wrong.';

CREATE INDEX business_profile_versions_org_created_idx
  ON public.business_profile_versions (org_id, created_at DESC);

CREATE TABLE public.business_profile_stages (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  stage public.profile_stage NOT NULL,
  completed_at timestamptz,
  completed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, stage)
);

COMMENT ON TABLE public.business_profile_stages IS
  'Onboarding progress. A client can stop anywhere and resume without losing anything.';

CREATE TABLE public.profile_field_registry (
  field text PRIMARY KEY,
  stage public.profile_stage NOT NULL,
  label text NOT NULL,
  consumer text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sort integer NOT NULL,
  CONSTRAINT profile_field_registry_consumer_present CHECK (char_length(trim(consumer)) > 0)
);

COMMENT ON TABLE public.profile_field_registry IS
  'The named consumer of every profile field. Completeness, the gap list, and the schema check that forbids a field without a consumer all read this.';

-- ---------------------------------------------------------------------------
-- Living profile: review prompts and stated-versus-observed contradictions
-- ---------------------------------------------------------------------------

CREATE TABLE public.profile_review_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  reason public.profile_review_reason NOT NULL,
  detail text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX profile_review_prompts_open_key
  ON public.profile_review_prompts (org_id, reason)
  WHERE resolved_at IS NULL;

CREATE TABLE public.profile_contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind public.profile_contradiction_kind NOT NULL,
  stated text NOT NULL,
  observed text NOT NULL,
  sample_n integer NOT NULL DEFAULT 0,
  detected_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.profile_contradictions IS
  'Where the profile says one thing and the data says another. Only possible because both the stated and the observed version live in one system.';

CREATE UNIQUE INDEX profile_contradictions_open_key
  ON public.profile_contradictions (org_id, kind)
  WHERE dismissed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Objection vocabulary, seeded from the profile before any transcript exists
-- ---------------------------------------------------------------------------

CREATE TABLE public.objection_vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  type public.objection_type NOT NULL,
  phrasing text NOT NULL,
  response text,
  rank integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT objection_vocabulary_phrasing_present CHECK (char_length(trim(phrasing)) > 0),
  CONSTRAINT objection_vocabulary_org_type_key UNIQUE (org_id, type)
);

COMMENT ON TABLE public.objection_vocabulary IS
  'The owner''s memory of what prospects actually say, in their words. Extraction matches against phrasing; objection-hold drafting reuses response.';

-- ---------------------------------------------------------------------------
-- The compounding layer. Per-org metrics are org-scoped; only the aggregate
-- crosses org boundaries, and it carries no org id.
-- ---------------------------------------------------------------------------

CREATE TABLE public.org_benchmark_metrics (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  metric public.benchmark_metric NOT NULL,
  value numeric NOT NULL,
  sample_n integer NOT NULL,
  source text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, metric),
  CONSTRAINT org_benchmark_metrics_source_check CHECK (source IN ('live', 'backfill'))
);

COMMENT ON TABLE public.org_benchmark_metrics IS
  'One org''s own measured figures. Readable only by that org. The cross-client aggregate is built from this by the scheduled job under service_role.';

CREATE TABLE public.benchmark_cohorts (
  cohort_key text NOT NULL,
  metric public.benchmark_metric NOT NULL,
  offer_type public.profile_offer_type NOT NULL,
  price_band text NOT NULL,
  volume_band text NOT NULL,
  org_count integer NOT NULL,
  median_value numeric NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_key, metric),
  CONSTRAINT benchmark_cohorts_min_size CHECK (org_count >= 5)
);

COMMENT ON TABLE public.benchmark_cohorts IS
  'Aggregate only, and never written below the minimum cohort size, so there is no small-n row to leak. No org ids, no per-business figures.';

CREATE TABLE public.configuration_priors (
  cohort_key text NOT NULL,
  prior_key text NOT NULL,
  value jsonb NOT NULL,
  org_count integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_key, prior_key),
  CONSTRAINT configuration_priors_min_size CHECK (org_count >= 5)
);

COMMENT ON TABLE public.configuration_priors IS
  'What actually worked for similar businesses. Pre-fills a form field and nothing else. Never applied without the client submitting the stage.';

-- ---------------------------------------------------------------------------
-- The Leak Report
-- ---------------------------------------------------------------------------

CREATE TABLE public.leak_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  basis public.leak_report_basis NOT NULL,
  baseline_run_id uuid REFERENCES public.baseline_runs (id) ON DELETE SET NULL,
  profile_version integer NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  generated_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.leak_reports IS
  'Every generation is kept so day ninety can be shown against the same baseline rather than a re-cut of it.';

CREATE INDEX leak_reports_org_generated_idx
  ON public.leak_reports (org_id, generated_at DESC);

-- ---------------------------------------------------------------------------
-- The activation gate
-- ---------------------------------------------------------------------------

CREATE TABLE public.activation_records (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL,
  activated_by_member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  warnings_acknowledged public.activation_warning[] NOT NULL DEFAULT '{}',
  requirements jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activation_records IS
  'Who activated, when, which warnings they acknowledged, and the state of every hard requirement at that moment. Displayed in settings permanently.';

CREATE TABLE public.activation_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  previous_at timestamptz NOT NULL,
  new_at timestamptz NOT NULL,
  reason text NOT NULL,
  changed_by_member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT activation_changes_reason_present CHECK (char_length(trim(reason)) >= 20)
);

COMMENT ON TABLE public.activation_changes IS
  'Moving the line between baseline and measured shifts every historical figure. It takes a written reason of real length and it is kept.';

CREATE TABLE public.baseline_fallback_declines (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  declined_at timestamptz NOT NULL DEFAULT now(),
  declined_by_member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  note text
);

COMMENT ON TABLE public.baseline_fallback_declines IS
  'The client was asked for prior figures after an unusable backfill and explicitly declined. Resolves the backfill requirement without inventing a baseline.';

-- ---------------------------------------------------------------------------
-- Registry rows. Every field here names the running feature that reads it.
-- ---------------------------------------------------------------------------

INSERT INTO public.profile_field_registry (field, stage, label, consumer, required, sort) VALUES
  ('offer_name', 'business', 'Offer name', 'Lead offer label on the queue and the case file', true, 10),
  ('offer_type', 'business', 'Offer type', 'Benchmark cohort and configuration priors', true, 20),
  ('price_point_cents', 'business', 'Price point', 'Leak Report value estimates and the benchmark price band', true, 30),
  ('payment_structure', 'business', 'Payment structure', 'Follow-up sequence pacing', true, 40),
  ('sales_cycle_days', 'business', 'Sales cycle length', 'Cohort maturation on the outcome metric', true, 50),
  ('touches_to_close', 'business', 'Touches to close', 'Ghost thresholds and the touches-to-close benchmark', true, 60),
  ('close_motion', 'business', 'One-call or multi-call close', 'Follow-up branch routing', true, 70),
  ('team_structure', 'business', 'Team structure', 'Queue assignment defaults and coverage warnings', true, 80),
  ('monthly_lead_volume', 'business', 'Monthly lead volume', 'Volume-drop detection and the benchmark volume band', true, 90),
  ('monthly_lead_target', 'business', 'Monthly lead target', 'Capacity warnings', false, 100),
  ('stated_close_rate_pct', 'business', 'Close rate', 'Leak Report value estimates', true, 110),
  ('lead_channels', 'funnel', 'Lead channels', 'Source quality reporting', true, 120),
  ('channel_spend_cents', 'funnel', 'Channel spend', 'Cost per acquisition in the Leak Report', false, 130),
  ('application_fields', 'funnel', 'Application questions', 'CRM field mapping and factor extraction', true, 140),
  ('qualification_signals', 'qualification', 'What makes a lead worth a call', 'Readiness scoring weights', true, 150),
  ('disqualifiers', 'qualification', 'Disqualifiers', 'Disqualified flag on intake', true, 160),
  ('price_bands', 'qualification', 'Investment bands', 'Investment capacity scoring rules', true, 170),
  ('timeline_bands', 'qualification', 'Timeline bands', 'Timeline scoring rules', true, 180),
  ('speed_to_lead_intent_minutes', 'process', 'Speed-to-lead intent', 'The speed-to-lead alarm window and the Leak Report gap', true, 190),
  ('setter_establishes', 'process', 'What a setter establishes', 'The pre-call brief''s "what the setter established" section', true, 200),
  ('pipeline_stage_meanings', 'process', 'Pipeline stage meanings', 'Stage mapping and reporting labels', false, 210),
  ('after_no_show', 'process', 'What runs after a no-show today', 'No-show follow-up branch and CRM sequence deduplication', true, 220),
  ('after_call', 'process', 'What runs after a call today', 'Post-call follow-up branch and CRM sequence deduplication', true, 230),
  ('after_silence', 'process', 'What runs after silence today', 'Ghost-risk follow-up branch and CRM sequence deduplication', true, 240),
  ('top_objections', 'objections', 'Top objections', 'Objection taxonomy seed, extraction vocabulary, and objection-hold drafting', true, 250),
  ('never_say', 'voice', 'Words you never use', 'Banned list in follow-up generation', false, 260),
  ('voice_formality', 'voice', 'Formality', 'Tone in follow-up generation', true, 270),
  ('channel_preference', 'voice', 'Channel preference', 'Default follow-up channel', true, 280),
  ('goal_metric', 'goals', 'The number that matters', 'Reporting headline framing', true, 290),
  ('goal_value', 'goals', 'Your target for it', 'Reporting headline framing', true, 300),
  ('aggregate_opt_out', 'goals', 'Contribution to anonymized patterns', 'Cross-client aggregates and configuration priors', false, 310),
  ('offer_type_other', 'business', 'Offer type, specified', 'Benchmark cohort and configuration priors', false, 320),
  ('payment_structure_other', 'business', 'Payment structure, specified', 'Follow-up sequence pacing', false, 330),
  ('lead_channels_other', 'funnel', 'Lead channels, specified', 'Source quality reporting', false, 340),
  ('qualification_signals_other', 'qualification', 'Qualification signal, specified', 'Readiness scoring weights', false, 350),
  ('disqualifiers_other', 'qualification', 'Disqualifier, specified', 'Disqualified flag on intake', false, 360),
  ('setter_establishes_other', 'process', 'Setter fact, specified', 'The pre-call brief''s "what the setter established" section', false, 370);

-- ---------------------------------------------------------------------------
-- Provisioning
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_business_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.business_profiles (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.business_profile_stages (org_id, stage)
  SELECT NEW.id, s FROM unnest(enum_range(NULL::public.profile_stage)) AS s
  ON CONFLICT (org_id, stage) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_provision_business_profile
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.provision_business_profile();

INSERT INTO public.business_profiles (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.business_profile_stages (org_id, stage)
SELECT o.id, s
FROM public.organizations o
CROSS JOIN unnest(enum_range(NULL::public.profile_stage)) AS s
ON CONFLICT (org_id, stage) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Versioning. Nothing overwrites silently.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_profiles_record_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_changed text[];
  v_actor uuid;
BEGIN
  -- Bookkeeping columns move on every save. Listing them would bury the one
  -- field that actually changed in noise nobody can read past.
  SELECT array_agg(o.key ORDER BY o.key) INTO v_changed
  FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
  WHERE o.key NOT IN (
      'version', 'updated_at', 'completeness_score', 'created_at',
      'last_reviewed_at', 'last_reviewed_by_member_id'
    )
    AND o.value IS DISTINCT FROM (to_jsonb(NEW) -> o.key);

  IF v_changed IS NULL THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  v_actor := nullif(current_setting('vistrial.profile_actor', true), '')::uuid;

  INSERT INTO public.business_profile_versions (
    org_id, version, snapshot, changed_fields, actor_member_id
  ) VALUES (
    OLD.org_id, OLD.version, to_jsonb(OLD), v_changed, v_actor
  );

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.business_profiles_record_version() IS
  'Stores the profile as it stood before the change, the fields that moved, and the member id in vistrial.profile_actor.';

CREATE TRIGGER business_profiles_version
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.business_profiles_record_version();

CREATE TRIGGER business_profile_stages_set_updated_at
  BEFORE UPDATE ON public.business_profile_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER objection_vocabulary_set_updated_at
  BEFORE UPDATE ON public.objection_vocabulary
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Constants and small helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.benchmark_min_cohort()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;

CREATE OR REPLACE FUNCTION public.profile_completeness_min()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 70 $$;

CREATE OR REPLACE FUNCTION public.profile_value_answered(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN false
    WHEN jsonb_typeof(p_value) = 'array' THEN jsonb_array_length(p_value) > 0
    WHEN jsonb_typeof(p_value) = 'object' THEN p_value <> '{}'::jsonb
    WHEN jsonb_typeof(p_value) = 'string' THEN char_length(trim(p_value #>> '{}')) > 0
    WHEN jsonb_typeof(p_value) = 'boolean' THEN true
    ELSE true
  END;
$$;

CREATE OR REPLACE FUNCTION public.profile_price_band(p_cents bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cents IS NULL THEN 'unknown'
    WHEN p_cents < 200000 THEN 'under_2k'
    WHEN p_cents < 500000 THEN '2k_5k'
    WHEN p_cents < 1000000 THEN '5k_10k'
    WHEN p_cents < 2500000 THEN '10k_25k'
    ELSE '25k_plus'
  END;
$$;

CREATE OR REPLACE FUNCTION public.profile_volume_band(p_volume integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_volume IS NULL THEN 'unknown'
    WHEN p_volume < 50 THEN 'under_50'
    WHEN p_volume < 200 THEN '50_200'
    WHEN p_volume < 500 THEN '200_500'
    ELSE '500_plus'
  END;
$$;

CREATE OR REPLACE FUNCTION public.profile_cohort_key(
  p_offer_type public.profile_offer_type,
  p_price_cents bigint,
  p_volume integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_offer_type IS NULL THEN NULL
    ELSE p_offer_type::text
      || '|' || public.profile_price_band(p_price_cents)
      || '|' || public.profile_volume_band(p_volume)
  END;
$$;

CREATE OR REPLACE FUNCTION public.profile_require_access(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT public.reporting_caller_allowed(p_org_id) THEN
    RAISE EXCEPTION 'the business profile is owner/admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.profile_require_access(uuid) IS
  'Same gate as reporting: owner/admin of this org, or a service_role caller. Setters and closers never reach the profile.';

-- ---------------------------------------------------------------------------
-- Completeness, with the specific gaps and the features they hold back
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_profile_completeness(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_total integer;
  v_answered integer;
  v_gaps jsonb;
BEGIN
  SELECT to_jsonb(p) INTO v_row FROM public.business_profiles p WHERE p.org_id = p_org_id;
  IF v_row IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'answered', 0, 'total', 0, 'gaps', '[]'::jsonb, 'usable_min', public.profile_completeness_min()
    );
  END IF;

  SELECT
    count(*) FILTER (WHERE r.required),
    count(*) FILTER (WHERE r.required AND public.profile_value_answered(v_row -> r.field))
  INTO v_total, v_answered
  FROM public.profile_field_registry r;

  SELECT COALESCE(jsonb_agg(g ORDER BY g ->> 'sort'), '[]'::jsonb) INTO v_gaps
  FROM (
    SELECT jsonb_build_object(
      'field', r.field,
      'stage', r.stage,
      'label', r.label,
      'consumer', r.consumer,
      'sort', lpad(r.sort::text, 6, '0')
    ) AS g
    FROM public.profile_field_registry r
    WHERE r.required
      AND NOT public.profile_value_answered(v_row -> r.field)
  ) rows;

  RETURN jsonb_build_object(
    'score', CASE WHEN v_total = 0 THEN 0 ELSE floor(100.0 * v_answered / v_total)::integer END,
    'answered', v_answered,
    'total', v_total,
    'gaps', v_gaps,
    'usable_min', public.profile_completeness_min()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.business_profile_refresh_completeness(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer;
BEGIN
  v_score := (public.business_profile_completeness(p_org_id) ->> 'score')::integer;
  UPDATE public.business_profiles SET completeness_score = v_score WHERE org_id = p_org_id;
  RETURN v_score;
END;
$$;

-- ---------------------------------------------------------------------------
-- Defaults. Derived from their own data first, cross-client priors second,
-- a stated fallback last. Every field the client is asked for has one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_profile_defaults(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_out jsonb := '{}'::jsonb;
  v_months numeric;
  v_volume integer;
  v_cycle integer;
  v_close numeric;
  v_leads bigint;
  v_closed bigint;
  v_sources text[];
  v_fields jsonb;
  v_stages jsonb;
  v_price bigint;
  v_priors jsonb;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id AND grade IN ('usable', 'partial')
  ORDER BY created_at DESC, id DESC LIMIT 1;

  -- Monthly lead volume: measured from CRM history, never asked blind.
  IF v_run.id IS NOT NULL THEN
    SELECT count(*) INTO v_leads FROM public.baseline_leads
    WHERE org_id = p_org_id AND run_id = v_run.id AND created_at_crm IS NOT NULL;
    v_months := GREATEST(1, EXTRACT(EPOCH FROM (v_run.window_end - v_run.window_start)) / 2592000.0);
    v_volume := round(v_leads / v_months)::integer;

    SELECT count(*) INTO v_closed
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id AND b.run_id = v_run.id
      AND EXISTS (
        SELECT 1 FROM public.baseline_revenue r
        WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
      );
    IF v_leads > 0 THEN
      v_close := round((v_closed::numeric * 100 / v_leads), 2);
    END IF;

    SELECT round(
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (r.occurred_at - b.created_at_crm)) / 86400.0
      )
    )::integer
    INTO v_cycle
    FROM public.baseline_leads b
    JOIN public.baseline_revenue r
      ON r.org_id = b.org_id AND r.baseline_lead_id = b.id
    WHERE b.org_id = p_org_id AND b.run_id = v_run.id
      AND b.created_at_crm IS NOT NULL
      AND r.occurred_at > b.created_at_crm;

    SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.amount_cents))::bigint
    INTO v_price
    FROM public.baseline_revenue r
    WHERE r.org_id = p_org_id AND r.run_id = v_run.id AND r.amount_cents IS NOT NULL;

    SELECT array_agg(DISTINCT b.source) INTO v_sources
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id AND b.run_id = v_run.id AND b.source IS NOT NULL;
  END IF;

  -- Application questions: whatever the CRM field map already carries.
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('answer_key', m.answer_key, 'factor', sm.factor) ORDER BY m.answer_key),
    '[]'::jsonb
  )
  INTO v_fields
  FROM public.ghl_field_maps m
  LEFT JOIN public.score_field_maps sm
    ON sm.org_id = m.org_id AND sm.field_name = m.answer_key
  WHERE m.org_id = p_org_id;

  -- Pipeline stage names: read off the leads the CRM already sent.
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('crm_stage', l.pipeline_stage)), '[]'::jsonb)
  INTO v_stages
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.pipeline_stage IS NOT NULL;

  v_priors := public.configuration_priors_for_org(p_org_id);

  v_out := jsonb_build_object(
    'offer_name', jsonb_build_object(
      'value', COALESCE(p.offer_name, (SELECT l.offer_name FROM public.leads l
        WHERE l.org_id = p_org_id AND l.offer_name IS NOT NULL
        GROUP BY l.offer_name ORDER BY count(*) DESC LIMIT 1)),
      'source', CASE WHEN p.offer_name IS NOT NULL THEN 'saved' ELSE 'derived' END,
      'basis', CASE WHEN EXISTS (
          SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND l.offer_name IS NOT NULL
        )
        THEN 'The offer name most of your CRM leads already carry'
        ELSE 'Nothing in your CRM carries an offer name yet, so this one is yours to write' END
    ),
    'offer_type', jsonb_build_object(
      'value', COALESCE(p.offer_type::text, 'coaching'),
      'source', CASE WHEN p.offer_type IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Coaching is the most common shape on this platform'
    ),
    'price_point_cents', jsonb_build_object(
      'value', COALESCE(p.price_point_cents, v_price),
      'source', CASE WHEN p.price_point_cents IS NOT NULL THEN 'saved'
                     WHEN v_price IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN v_price IS NOT NULL
        THEN 'Median value of the won deals in your CRM history'
        ELSE 'No valued closes in your CRM history to read this from' END
    ),
    'payment_structure', jsonb_build_object(
      'value', COALESCE(p.payment_structure::text, 'pif_or_plan'),
      'source', CASE WHEN p.payment_structure IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Most offers at this price point take either'
    ),
    'sales_cycle_days', jsonb_build_object(
      'value', COALESCE(p.sales_cycle_days, v_cycle, o.sales_cycle_days),
      'source', CASE WHEN p.sales_cycle_days IS NOT NULL THEN 'saved'
                     WHEN v_cycle IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN v_cycle IS NOT NULL
        THEN 'Median days from opt-in to close in your CRM history'
        ELSE 'The platform default of sixty days' END
    ),
    'touches_to_close', jsonb_build_object(
      'value', COALESCE(p.touches_to_close, (v_priors #>> '{touches_to_close,value}')::integer, 6),
      'source', CASE WHEN p.touches_to_close IS NOT NULL THEN 'saved'
                     WHEN v_priors ? 'touches_to_close' THEN 'prior' ELSE 'fallback' END,
      'basis', COALESCE(v_priors #>> '{touches_to_close,basis}', 'Six is the working assumption until your own data says otherwise')
    ),
    'close_motion', jsonb_build_object(
      'value', COALESCE(p.close_motion::text, 'two_call'),
      'source', CASE WHEN p.close_motion IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Two-call is the most common shape above five thousand dollars'
    ),
    'team_structure', jsonb_build_object(
      'value', COALESCE(
        p.team_structure::text,
        CASE
          WHEN (SELECT count(*) FROM public.org_members m
                WHERE m.org_id = p_org_id AND m.active AND m.role = 'setter') > 0
            THEN 'setter_closer'
          WHEN (SELECT count(*) FROM public.org_members m
                WHERE m.org_id = p_org_id AND m.active AND m.role = 'closer') > 0
            THEN 'closers_only'
          ELSE 'owner_sold'
        END
      ),
      'source', CASE WHEN p.team_structure IS NOT NULL THEN 'saved' ELSE 'derived' END,
      'basis', 'The roles already on this workspace'
    ),
    'monthly_lead_volume', jsonb_build_object(
      'value', COALESCE(p.monthly_lead_volume, v_volume),
      'source', CASE WHEN p.monthly_lead_volume IS NOT NULL THEN 'saved'
                     WHEN v_volume IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN v_volume IS NOT NULL
        THEN 'Counted from your CRM history and divided by the months it covers'
        ELSE 'No usable CRM history to count this from' END
    ),
    'monthly_lead_target', jsonb_build_object(
      'value', COALESCE(p.monthly_lead_target, v_volume),
      'source', CASE WHEN p.monthly_lead_target IS NOT NULL THEN 'saved'
                     WHEN v_volume IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', 'Holding steady with what you already get, until you say otherwise'
    ),
    'stated_close_rate_pct', jsonb_build_object(
      'value', COALESCE(p.stated_close_rate_pct, v_close),
      'source', CASE WHEN p.stated_close_rate_pct IS NOT NULL THEN 'saved'
                     WHEN v_close IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN v_close IS NOT NULL
        THEN 'Closes divided by leads in your CRM history'
        ELSE 'No usable CRM history to measure this from' END
    )
  );

  v_out := v_out || jsonb_build_object(
    'lead_channels', jsonb_build_object(
      'value', CASE
        WHEN array_length(p.lead_channels, 1) IS NOT NULL THEN to_jsonb(p.lead_channels)
        ELSE '["meta_ads", "referral"]'::jsonb END,
      'crm_sources', COALESCE(to_jsonb(v_sources), '[]'::jsonb),
      'source', CASE WHEN array_length(p.lead_channels, 1) IS NOT NULL THEN 'saved'
                     WHEN v_sources IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN v_sources IS NOT NULL
        THEN 'Your CRM sources are listed beside this. Tick the ones that match'
        ELSE 'Paid social and referrals are where most businesses here start' END
    ),
    'channel_spend_cents', jsonb_build_object(
      'value', p.channel_spend_cents, 'source', 'fallback',
      'basis', 'Optional. Only fill it in for channels where you will share the number'
    ),
    'application_fields', jsonb_build_object(
      'value', CASE
        WHEN jsonb_array_length(p.application_fields) > 0 THEN p.application_fields
        WHEN jsonb_array_length(v_fields) > 0 THEN v_fields
        ELSE COALESCE((
          SELECT jsonb_agg(jsonb_build_object('answer_key', m.field_name, 'factor', m.factor)
                 ORDER BY m.field_name)
          FROM public.score_field_maps m
          WHERE m.org_id = p_org_id
            AND m.field_name NOT LIKE '%\_signal'
            AND m.field_name <> 'decision_process'
        ), '[]'::jsonb) END,
      'source', CASE WHEN jsonb_array_length(p.application_fields) > 0 THEN 'saved'
                     WHEN jsonb_array_length(v_fields) > 0 THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN jsonb_array_length(v_fields) > 0
        THEN 'The custom fields your CRM already sends with every contact'
        ELSE 'The four questions this workspace already scores on. Rename them to match your form' END
    ),
    'qualification_signals', jsonb_build_object(
      'value', CASE
        WHEN array_length(p.qualification_signals, 1) IS NOT NULL THEN to_jsonb(p.qualification_signals)
        ELSE '["has_budget", "urgent_timeline", "sole_decision_maker", "clear_pain"]'::jsonb END,
      'source', CASE WHEN array_length(p.qualification_signals, 1) IS NOT NULL THEN 'saved' ELSE 'fallback' END,
      'basis', 'Budget, timeline, authority and pain are what the four factors already measure'
    ),
    'disqualifiers', jsonb_build_object(
      'value', CASE
        WHEN array_length(p.disqualifiers, 1) IS NOT NULL THEN to_jsonb(p.disqualifiers)
        ELSE '["no_budget", "pre_revenue"]'::jsonb END,
      'source', CASE WHEN array_length(p.disqualifiers, 1) IS NOT NULL THEN 'saved' ELSE 'fallback' END,
      'basis', 'No budget and pre-revenue are the two most businesses name first'
    ),
    'price_bands', jsonb_build_object(
      'value', CASE WHEN jsonb_array_length(p.price_bands) > 0 THEN p.price_bands ELSE
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', m.field_name || ': ' || r.answer_value, 'answer', r.answer_value, 'score', r.score) ORDER BY r.score), '[]'::jsonb)
         FROM public.score_field_maps m
         JOIN public.score_field_rules r ON r.field_map_id = m.id
         WHERE m.org_id = p_org_id AND m.factor = 'investment_capacity' AND r.kind = 'choice') END,
      'source', CASE WHEN jsonb_array_length(p.price_bands) > 0 THEN 'saved' ELSE 'fallback' END,
      'basis', 'The investment bands already seeded on this workspace'
    ),
    'timeline_bands', jsonb_build_object(
      'value', CASE WHEN jsonb_array_length(p.timeline_bands) > 0 THEN p.timeline_bands ELSE
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', m.field_name || ': ' || r.answer_value, 'answer', r.answer_value, 'score', r.score) ORDER BY r.score DESC), '[]'::jsonb)
         FROM public.score_field_maps m
         JOIN public.score_field_rules r ON r.field_map_id = m.id
         WHERE m.org_id = p_org_id AND m.factor = 'timeline' AND r.kind = 'choice') END,
      'source', CASE WHEN jsonb_array_length(p.timeline_bands) > 0 THEN 'saved' ELSE 'fallback' END,
      'basis', 'The timeline bands already seeded on this workspace'
    ),
    'speed_to_lead_intent_minutes', jsonb_build_object(
      'value', COALESCE(
        p.speed_to_lead_intent_minutes,
        (v_priors #>> '{speed_to_lead_minutes,value}')::integer,
        sc.speed_to_lead_minutes,
        15
      ),
      'source', CASE WHEN p.speed_to_lead_intent_minutes IS NOT NULL THEN 'saved'
                     WHEN v_priors ? 'speed_to_lead_minutes' THEN 'prior' ELSE 'fallback' END,
      'basis', COALESCE(v_priors #>> '{speed_to_lead_minutes,basis}', 'Fifteen minutes is the window this workspace is already set to')
    ),
    'setter_establishes', jsonb_build_object(
      'value', CASE
        WHEN array_length(p.setter_establishes, 1) IS NOT NULL THEN to_jsonb(p.setter_establishes)
        ELSE '["budget_confirmed", "timeline_confirmed", "decision_maker_confirmed"]'::jsonb END,
      'source', CASE WHEN array_length(p.setter_establishes, 1) IS NOT NULL THEN 'saved' ELSE 'fallback' END,
      'basis', 'Budget, timeline and decision maker are what a closer reads first on the brief'
    ),
    'pipeline_stage_meanings', jsonb_build_object(
      'value', CASE WHEN jsonb_array_length(p.pipeline_stage_meanings) > 0
        THEN p.pipeline_stage_meanings ELSE v_stages END,
      'source', CASE WHEN jsonb_array_length(p.pipeline_stage_meanings) > 0 THEN 'saved'
                     WHEN jsonb_array_length(v_stages) > 0 THEN 'derived' ELSE 'fallback' END,
      'basis', 'The pipeline stage names already arriving on your CRM leads'
    )
  );

  v_out := v_out || jsonb_build_object(
    'after_no_show', jsonb_build_object(
      'value', COALESCE(p.after_no_show::text, 'manual_only'), 'source',
      CASE WHEN p.after_no_show IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Most businesses chase a no-show by hand, which is the case Vistrial takes over'
    ),
    'after_call', jsonb_build_object(
      'value', COALESCE(p.after_call::text, 'manual_only'), 'source',
      CASE WHEN p.after_call IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Say if your CRM already sends something here so Vistrial does not double up'
    ),
    'after_silence', jsonb_build_object(
      'value', COALESCE(p.after_silence::text, 'nothing'), 'source',
      CASE WHEN p.after_silence IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Silence is the gap almost nobody covers'
    ),
    'top_objections', jsonb_build_object(
      'value', CASE
        WHEN jsonb_array_length(p.top_objections) > 0 THEN p.top_objections
        WHEN EXISTS (SELECT 1 FROM public.objection_vocabulary v WHERE v.org_id = p_org_id) THEN
          (SELECT jsonb_agg(jsonb_build_object('type', v.type, 'phrasing', v.phrasing, 'response', v.response) ORDER BY v.rank)
           FROM public.objection_vocabulary v WHERE v.org_id = p_org_id)
        ELSE jsonb_build_array(
          jsonb_build_object('type', 'price', 'phrasing', 'It is a lot of money right now', 'response', NULL),
          jsonb_build_object('type', 'timing', 'phrasing', 'Now is not the right time', 'response', NULL),
          jsonb_build_object('type', 'spouse_partner', 'phrasing', 'I need to talk to my partner', 'response', NULL)
        ) END,
      'source', CASE WHEN jsonb_array_length(p.top_objections) > 0 THEN 'saved' ELSE 'fallback' END,
      'basis', 'Price, timing and partner approval are the three most offers hear. Rewrite them in the words your prospects actually use'
    ),
    'never_say', jsonb_build_object(
      'value', to_jsonb(p.never_say),
      'source', CASE WHEN array_length(p.never_say, 1) IS NOT NULL THEN 'saved' ELSE 'fallback' END,
      'basis', 'Corporate filler is already banned platform-wide. This is for words specific to you'
    ),
    'voice_formality', jsonb_build_object(
      'value', COALESCE(p.voice_formality::text,
        (SELECT vp.formality::text FROM public.org_voice_profiles vp WHERE vp.org_id = p_org_id), 'casual'),
      'source', CASE WHEN p.voice_formality IS NOT NULL THEN 'saved' ELSE 'derived' END,
      'basis', 'What the voice profile on this workspace is already set to'
    ),
    'channel_preference', jsonb_build_object(
      'value', COALESCE(p.channel_preference,
        (SELECT fs.default_channel::text FROM public.follow_up_settings fs WHERE fs.org_id = p_org_id), 'sms'),
      'source', CASE WHEN p.channel_preference IS NOT NULL THEN 'saved' ELSE 'derived' END,
      'basis', 'The default channel this workspace already sends on'
    ),
    'goal_metric', jsonb_build_object(
      'value', COALESCE(p.goal_metric::text, 'clients_per_month'),
      'source', CASE WHEN p.goal_metric IS NULL THEN 'fallback' ELSE 'saved' END,
      'basis', 'Clients per month is what the headline outcome metric already counts'
    ),
    'goal_value', jsonb_build_object(
      'value', COALESCE(
        p.goal_value,
        CASE WHEN v_volume IS NOT NULL AND v_close IS NOT NULL
          THEN GREATEST(1, round(v_volume * v_close / 100.0)) END
      ),
      'source', CASE WHEN p.goal_value IS NOT NULL THEN 'saved'
                     WHEN v_volume IS NOT NULL AND v_close IS NOT NULL THEN 'derived' ELSE 'fallback' END,
      'basis', CASE WHEN v_volume IS NOT NULL AND v_close IS NOT NULL
        THEN 'What your own history already produces per month, as a floor to beat'
        ELSE 'Only you can set this one. There is no history to read a floor from yet' END
    ),
    'aggregate_opt_out', jsonb_build_object(
      'value', p.aggregate_opt_out, 'source', 'saved',
      'basis', 'Contributing is on unless you turn it off. Benchmarks reach you either way'
    ),
    'offer_type_other', jsonb_build_object('value', p.offer_type_other, 'source', 'fallback', 'basis', 'Only needed if you picked other'),
    'payment_structure_other', jsonb_build_object('value', p.payment_structure_other, 'source', 'fallback', 'basis', 'Only needed if you picked other'),
    'lead_channels_other', jsonb_build_object('value', p.lead_channels_other, 'source', 'fallback', 'basis', 'Only needed if you picked other'),
    'qualification_signals_other', jsonb_build_object('value', p.qualification_signals_other, 'source', 'fallback', 'basis', 'Only needed if you picked other'),
    'disqualifiers_other', jsonb_build_object('value', p.disqualifiers_other, 'source', 'fallback', 'basis', 'Only needed if you picked other'),
    'setter_establishes_other', jsonb_build_object('value', p.setter_establishes_other, 'source', 'fallback', 'basis', 'Only needed if you picked other')
  );

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.business_profile_defaults(uuid) IS
  'A default and a stated basis for every registry field. source is saved, derived from their own data, prior from comparable businesses, or fallback.';

-- ---------------------------------------------------------------------------
-- Saving a stage. The actor travels in the argument, not in a GUC set by a
-- separate request, because PostgREST gives every call its own transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_business_profile(
  p_org_id uuid,
  p_member_id uuid,
  p_patch jsonb,
  p_stage public.profile_stage DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur public.business_profiles%ROWTYPE;
  v_new public.business_profiles%ROWTYPE;
  v_patch jsonb;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  IF jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be an object';
  END IF;

  SELECT * INTO v_cur FROM public.business_profiles WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'business profile missing for this org';
  END IF;

  -- Bookkeeping columns are the function's business, never the caller's.
  v_patch := p_patch
    - 'org_id' - 'version' - 'completeness_score' - 'created_at' - 'updated_at'
    - 'last_reviewed_at' - 'last_reviewed_by_member_id' - 'aggregate_opt_out_at';

  SELECT * INTO v_new
  FROM jsonb_populate_record(NULL::public.business_profiles, to_jsonb(v_cur) || v_patch);

  PERFORM set_config('vistrial.profile_actor', COALESCE(p_member_id::text, ''), true);

  UPDATE public.business_profiles SET
    offer_name = v_new.offer_name,
    offer_type = v_new.offer_type,
    offer_type_other = v_new.offer_type_other,
    price_point_cents = v_new.price_point_cents,
    payment_structure = v_new.payment_structure,
    payment_structure_other = v_new.payment_structure_other,
    sales_cycle_days = v_new.sales_cycle_days,
    touches_to_close = v_new.touches_to_close,
    close_motion = v_new.close_motion,
    team_structure = v_new.team_structure,
    monthly_lead_volume = v_new.monthly_lead_volume,
    monthly_lead_target = v_new.monthly_lead_target,
    stated_close_rate_pct = v_new.stated_close_rate_pct,
    lead_channels = v_new.lead_channels,
    lead_channels_other = v_new.lead_channels_other,
    channel_spend_cents = v_new.channel_spend_cents,
    application_fields = v_new.application_fields,
    qualification_signals = v_new.qualification_signals,
    qualification_signals_other = v_new.qualification_signals_other,
    disqualifiers = v_new.disqualifiers,
    disqualifiers_other = v_new.disqualifiers_other,
    price_bands = v_new.price_bands,
    timeline_bands = v_new.timeline_bands,
    speed_to_lead_intent_minutes = v_new.speed_to_lead_intent_minutes,
    setter_establishes = v_new.setter_establishes,
    setter_establishes_other = v_new.setter_establishes_other,
    pipeline_stage_meanings = v_new.pipeline_stage_meanings,
    after_no_show = v_new.after_no_show,
    after_call = v_new.after_call,
    after_silence = v_new.after_silence,
    top_objections = v_new.top_objections,
    never_say = v_new.never_say,
    voice_formality = v_new.voice_formality,
    channel_preference = v_new.channel_preference,
    goal_metric = v_new.goal_metric,
    goal_value = v_new.goal_value,
    aggregate_opt_out = v_new.aggregate_opt_out,
    aggregate_opt_out_at = CASE
      WHEN v_new.aggregate_opt_out AND NOT v_cur.aggregate_opt_out THEN now()
      WHEN NOT v_new.aggregate_opt_out THEN NULL
      ELSE v_cur.aggregate_opt_out_at
    END,
    last_reviewed_at = now(),
    last_reviewed_by_member_id = COALESCE(p_member_id, v_cur.last_reviewed_by_member_id)
  WHERE org_id = p_org_id;

  IF p_stage IS NOT NULL THEN
    INSERT INTO public.business_profile_stages (org_id, stage, completed_at, completed_by_member_id)
    VALUES (p_org_id, p_stage, now(), p_member_id)
    ON CONFLICT (org_id, stage) DO UPDATE
      SET completed_at = now(), completed_by_member_id = EXCLUDED.completed_by_member_id;
  END IF;

  PERFORM public.business_profile_refresh_completeness(p_org_id);
  RETURN public.business_profile_completeness(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_business_profile_stage(
  p_org_id uuid,
  p_member_id uuid,
  p_stage public.profile_stage
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  INSERT INTO public.business_profile_stages (org_id, stage, completed_at, completed_by_member_id)
  VALUES (p_org_id, p_stage, now(), p_member_id)
  ON CONFLICT (org_id, stage) DO UPDATE
    SET completed_at = now(), completed_by_member_id = EXCLUDED.completed_by_member_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- The compounding layer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.benchmark_refresh_org_metrics(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_source text;
  v_live_n bigint := 0;
  v_written integer := 0;
  v_n bigint;
  v_value numeric;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id AND grade IN ('usable', 'partial')
  ORDER BY created_at DESC, id DESC LIMIT 1;

  IF o.activated_at IS NOT NULL THEN
    SELECT count(*) INTO v_live_n FROM public.leads
    WHERE org_id = p_org_id AND opted_in_at >= o.activated_at;
  END IF;

  -- One consistent source per refresh. Live once there is enough of it,
  -- otherwise the CRM history, which every client has from day one.
  IF v_live_n >= public.reporting_diag_min() THEN
    v_source := 'live';
  ELSIF v_run.id IS NOT NULL THEN
    v_source := 'backfill';
  ELSE
    DELETE FROM public.org_benchmark_metrics WHERE org_id = p_org_id;
    RETURN 0;
  END IF;

  DELETE FROM public.org_benchmark_metrics WHERE org_id = p_org_id;

  -- Speed to lead: median minutes from opt-in to the first human touch.
  IF v_source = 'live' THEN
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)) / 60.0
    )
    INTO v_n, v_value
    FROM public.leads
    WHERE org_id = p_org_id AND opted_in_at >= o.activated_at
      AND first_human_touch_at IS NOT NULL AND first_human_touch_at >= opted_in_at;
  ELSE
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - created_at_crm)) / 60.0
    )
    INTO v_n, v_value
    FROM public.baseline_leads
    WHERE org_id = p_org_id AND run_id = v_run.id
      AND created_at_crm IS NOT NULL AND first_human_touch_at IS NOT NULL
      AND first_human_touch_at >= created_at_crm;
  END IF;
  IF v_n >= public.reporting_diag_min() AND v_value IS NOT NULL THEN
    INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
    VALUES (p_org_id, 'speed_to_lead_minutes', round(v_value, 1), v_n, v_source);
    v_written := v_written + 1;
  END IF;

  -- Show rate: held over resolved bookings.
  IF v_source = 'live' THEN
    SELECT count(*) FILTER (WHERE outcome IS NOT NULL),
           count(*) FILTER (WHERE outcome = 'held')
    INTO v_n, v_value
    FROM public.calls WHERE org_id = p_org_id AND scheduled_at >= o.activated_at;
  ELSE
    SELECT count(*) FILTER (WHERE outcome IS NOT NULL),
           count(*) FILTER (WHERE outcome = 'held')
    INTO v_n, v_value
    FROM public.baseline_calls WHERE org_id = p_org_id AND run_id = v_run.id;
  END IF;
  IF v_n >= public.reporting_diag_min() THEN
    INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
    VALUES (p_org_id, 'show_rate', round(v_value * 100 / v_n, 1), v_n, v_source);
    v_written := v_written + 1;
  END IF;

  -- Close rate: leads that produced a recorded close.
  IF v_source = 'live' THEN
    SELECT count(*),
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.revenue_log r WHERE r.org_id = l.org_id AND r.lead_id = l.id
           ))
    INTO v_n, v_value
    FROM public.leads l
    WHERE l.org_id = p_org_id AND l.opted_in_at >= o.activated_at
      AND l.opted_in_at <= now() - make_interval(days => o.sales_cycle_days);
  ELSE
    SELECT count(*),
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.baseline_revenue r
             WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
           ))
    INTO v_n, v_value
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id AND b.run_id = v_run.id;
  END IF;
  IF v_n >= public.reporting_diag_min() THEN
    INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
    VALUES (p_org_id, 'close_rate', round(v_value * 100 / v_n, 1), v_n, v_source);
    v_written := v_written + 1;
  END IF;

  -- Touches to close: median touch count on the leads that closed.
  IF v_source = 'live' THEN
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY t.n)
    INTO v_n, v_value
    FROM (
      SELECT l.id, (SELECT count(*) FROM public.touches x WHERE x.lead_id = l.id) AS n
      FROM public.leads l
      WHERE l.org_id = p_org_id AND l.opted_in_at >= o.activated_at
        AND EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = l.org_id AND r.lead_id = l.id)
    ) t;
  ELSE
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY t.n)
    INTO v_n, v_value
    FROM (
      SELECT b.id, (SELECT count(*) FROM public.baseline_touches x WHERE x.baseline_lead_id = b.id) AS n
      FROM public.baseline_leads b
      WHERE b.org_id = p_org_id AND b.run_id = v_run.id
        AND EXISTS (
          SELECT 1 FROM public.baseline_revenue r
          WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
        )
    ) t;
  END IF;
  IF v_n >= public.reporting_diag_min() AND v_value IS NOT NULL THEN
    INSERT INTO public.org_benchmark_metrics (org_id, metric, value, sample_n, source)
    VALUES (p_org_id, 'touches_to_close', round(v_value, 1), v_n, v_source);
    v_written := v_written + 1;
  END IF;

  RETURN v_written;
END;
$$;

CREATE OR REPLACE FUNCTION public.benchmark_refresh_cohorts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.benchmark_cohorts;
  DELETE FROM public.configuration_priors;

  -- Only contributing orgs, and only cohorts that clear the minimum. A row
  -- below the minimum is never written, so there is nothing small to leak.
  WITH contributing AS (
    SELECT
      p.org_id,
      p.offer_type,
      public.profile_price_band(p.price_point_cents) AS price_band,
      public.profile_volume_band(p.monthly_lead_volume) AS volume_band,
      public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume) AS cohort_key
    FROM public.business_profiles p
    WHERE p.aggregate_opt_out = false
      AND p.offer_type IS NOT NULL
      AND p.price_point_cents IS NOT NULL
      AND p.monthly_lead_volume IS NOT NULL
  )
  INSERT INTO public.benchmark_cohorts (
    cohort_key, metric, offer_type, price_band, volume_band, org_count, median_value
  )
  SELECT
    c.cohort_key,
    m.metric,
    c.offer_type,
    c.price_band,
    c.volume_band,
    count(DISTINCT m.org_id)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY m.value)::numeric, 1)
  FROM contributing c
  JOIN public.org_benchmark_metrics m ON m.org_id = c.org_id
  GROUP BY c.cohort_key, m.metric, c.offer_type, c.price_band, c.volume_band
  HAVING count(DISTINCT m.org_id) >= public.benchmark_min_cohort();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  WITH contributing AS (
    SELECT
      p.org_id,
      public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume) AS cohort_key
    FROM public.business_profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.aggregate_opt_out = false
      AND p.offer_type IS NOT NULL
      AND p.price_point_cents IS NOT NULL
      AND p.monthly_lead_volume IS NOT NULL
      AND o.activated_at IS NOT NULL
  ),
  agg AS (
    SELECT
      c.cohort_key,
      count(DISTINCT c.org_id)::integer AS n,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sc.speed_to_lead_minutes)) AS speed,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sc.ready_threshold)) AS threshold,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sc.ghost_days_soft)) AS ghost_soft,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sc.ghost_days_hard)) AS ghost_hard,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY o.sales_cycle_days)) AS cycle,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY bp.touches_to_close)) AS touches
    FROM contributing c
    JOIN public.score_configs sc ON sc.org_id = c.org_id
    JOIN public.organizations o ON o.id = c.org_id
    JOIN public.business_profiles bp ON bp.org_id = c.org_id
    GROUP BY c.cohort_key
    HAVING count(DISTINCT c.org_id) >= public.benchmark_min_cohort()
  )
  INSERT INTO public.configuration_priors (cohort_key, prior_key, value, org_count)
  SELECT a.cohort_key, k.prior_key, to_jsonb(k.val), a.n
  FROM agg a
  CROSS JOIN LATERAL (
    VALUES
      ('speed_to_lead_minutes', a.speed),
      ('ready_threshold', a.threshold),
      ('ghost_days_soft', a.ghost_soft),
      ('ghost_days_hard', a.ghost_hard),
      ('sales_cycle_days', a.cycle),
      ('touches_to_close', a.touches)
  ) AS k(prior_key, val)
  WHERE k.val IS NOT NULL;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.benchmark_refresh_cohorts() IS
  'Rebuilds every cross-client aggregate. Opted-out orgs contribute nothing. Cohorts under the minimum size are not written at all.';

CREATE OR REPLACE FUNCTION public.configuration_priors_for_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_out jsonb := '{}'::jsonb;
  r record;
BEGIN
  SELECT public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume)
  INTO v_key
  FROM public.business_profiles p WHERE p.org_id = p_org_id;

  IF v_key IS NULL THEN
    RETURN v_out;
  END IF;

  FOR r IN
    SELECT prior_key, value, org_count FROM public.configuration_priors
    WHERE cohort_key = v_key AND org_count >= public.benchmark_min_cohort()
  LOOP
    v_out := v_out || jsonb_build_object(r.prior_key, jsonb_build_object(
      'value', r.value,
      'org_count', r.org_count,
      'basis', 'The median across ' || r.org_count || ' comparable businesses, matched on offer type, price band and monthly lead volume'
    ));
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.configuration_priors_for_org(uuid) IS
  'Pre-fill values only. Nothing here is applied until the client submits the stage.';

CREATE OR REPLACE FUNCTION public.benchmark_for_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
  r record;
BEGIN
  PERFORM public.profile_require_access(p_org_id);

  SELECT public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume)
  INTO v_key
  FROM public.business_profiles p WHERE p.org_id = p_org_id;

  IF v_key IS NULL THEN
    RETURN jsonb_build_object(
      'shown', false,
      'cohort_key', NULL,
      'org_count', 0,
      'min_cohort', public.benchmark_min_cohort(),
      'rows', '[]'::jsonb,
      'plain', 'No benchmark yet. Offer type, price point and monthly lead volume decide which businesses you are compared against.'
    );
  END IF;

  FOR r IN
    SELECT
      c.metric,
      c.median_value,
      c.org_count,
      m.value AS own_value,
      m.sample_n AS own_sample_n,
      m.source AS own_source
    FROM public.benchmark_cohorts c
    LEFT JOIN public.org_benchmark_metrics m ON m.org_id = p_org_id AND m.metric = c.metric
    WHERE c.cohort_key = v_key AND c.org_count >= public.benchmark_min_cohort()
    ORDER BY c.metric
  LOOP
    v_count := GREATEST(v_count, r.org_count);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'metric', r.metric,
      'cohort_median', r.median_value,
      'org_count', r.org_count,
      'own_value', r.own_value,
      'own_sample_n', r.own_sample_n,
      'own_source', r.own_source
    ));
  END LOOP;

  IF jsonb_array_length(v_rows) = 0 THEN
    RETURN jsonb_build_object(
      'shown', false,
      'cohort_key', v_key,
      'org_count', 0,
      'min_cohort', public.benchmark_min_cohort(),
      'rows', '[]'::jsonb,
      'plain', 'Fewer than ' || public.benchmark_min_cohort()
        || ' comparable businesses have completed a profile, so nothing is shown. A benchmark drawn from three businesses is noise presented as insight.'
    );
  END IF;

  RETURN jsonb_build_object(
    'shown', true,
    'cohort_key', v_key,
    'org_count', v_count,
    'min_cohort', public.benchmark_min_cohort(),
    'rows', v_rows,
    'basis', 'Matched on offer type, price band and monthly lead volume band. Medians across ' || v_count
      || ' businesses. No individual business is identified and no single figure is recoverable.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_pattern_feedback(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_priors jsonb;
  v_out jsonb := '[]'::jsonb;
  v_threshold integer;
  v_cycle integer;
  v_speed integer;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  v_priors := public.configuration_priors_for_org(p_org_id);

  v_threshold := (v_priors #>> '{ready_threshold,value}')::integer;
  IF v_threshold IS NOT NULL AND sc.ready_threshold - v_threshold >= 15 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key', 'strict_qualification',
      'plain', 'Your ready threshold is ' || sc.ready_threshold || ' against a median of ' || v_threshold
        || ' for comparable businesses. A bar that much stricter may be discarding leads that would have closed.',
      'basis', v_priors #>> '{ready_threshold,basis}'
    ));
  END IF;

  v_cycle := (v_priors #>> '{sales_cycle_days,value}')::integer;
  IF v_cycle IS NOT NULL AND p.sales_cycle_days IS NOT NULL AND v_cycle - p.sales_cycle_days >= 20 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key', 'short_cycle_assumption',
      'plain', 'You put your sales cycle at ' || p.sales_cycle_days || ' days. Comparable offers take a median of '
        || v_cycle || '. If the shorter figure is wrong, the outcome metric will call cohorts mature before they are.',
      'basis', v_priors #>> '{sales_cycle_days,basis}'
    ));
  END IF;

  v_speed := (v_priors #>> '{speed_to_lead_minutes,value}')::integer;
  IF v_speed IS NOT NULL AND sc.speed_to_lead_minutes - v_speed >= 30 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key', 'wide_speed_window',
      'plain', 'Your speed-to-lead window is ' || sc.speed_to_lead_minutes || ' minutes against a median of '
        || v_speed || '. A window that wide means the alarm rarely fires and the queue loses its ordering.',
      'basis', v_priors #>> '{speed_to_lead_minutes,basis}'
    ));
  END IF;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.profile_pattern_feedback(uuid) IS
  'Suggestions drawn from the aggregate. Nothing here changes a setting; the client decides.';

-- ---------------------------------------------------------------------------
-- The Leak Report. Every figure traces to a named row source. Nothing is an
-- industry average, and a value estimate is labelled as one everywhere.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leak_report_compute(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_basis public.leak_report_basis;
  v_min integer := public.reporting_diag_min();
  v_findings jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_close numeric;
  v_price bigint;
  v_n bigint;
  v_k bigint;
  v_rate jsonb;
  v_median numeric;
  v_intent integer;
  v_sources jsonb;
  v_zero jsonb;
  v_spend bigint;
  v_closes bigint;
  v_terminal jsonb;
  v_dead_n bigint;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;

  v_close := p.stated_close_rate_pct;
  v_price := p.price_point_cents;
  v_intent := COALESCE(p.speed_to_lead_intent_minutes, sc.speed_to_lead_minutes);

  IF v_run.id IS NULL OR v_run.grade IS NULL OR v_run.grade = 'unusable' THEN
    v_basis := 'profile_only';
  ELSIF v_run.grade = 'partial' THEN
    v_basis := 'backfill_partial';
  ELSE
    v_basis := 'backfill';
  END IF;

  IF v_basis = 'backfill_partial' THEN
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_missing
    FROM unnest(v_run.grade_reasons) AS x;
  END IF;

  -- -------------------------------------------------------------------------
  -- Profile-only. The backfill graded unusable, so there is no measured
  -- history. State their own figures back and fabricate nothing.
  -- -------------------------------------------------------------------------
  IF v_basis = 'profile_only' THEN
    v_findings := v_findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'stated_shape',
        'title', 'What you told us your month looks like',
        'shown', true,
        'measured', false,
        'stated', jsonb_build_object(
          'monthly_lead_volume', p.monthly_lead_volume,
          'close_rate_pct', v_close,
          'price_point_cents', v_price,
          'implied_clients_per_month', CASE
            WHEN p.monthly_lead_volume IS NOT NULL AND v_close IS NOT NULL
            THEN round(p.monthly_lead_volume * v_close / 100.0, 1) END,
          'implied_revenue_cents_per_month', CASE
            WHEN p.monthly_lead_volume IS NOT NULL AND v_close IS NOT NULL AND v_price IS NOT NULL
            THEN round(p.monthly_lead_volume * v_close / 100.0 * v_price)::bigint END
        ),
        'trace', 'Your own stated figures from the profile. Not a measurement.',
        'fix', 'Reconnect a CRM with a full contact history and this section becomes measured instead of stated.',
        'vistrial', 'Vistrial will measure all of it from the day this workspace goes live, whatever the history says.'
      ),
      jsonb_build_object(
        'key', 'speed_to_lead',
        'title', 'Speed to lead',
        'shown', true,
        'measured', false,
        'intent_minutes', v_intent,
        'trace', 'Your intended window. The real median cannot be measured because the CRM history graded unusable.',
        'fix', 'Nothing to fix yet. The alarm band will show the real figure within a week of going live.',
        'vistrial', 'The queue puts every lead past this window in an alarm band above everything else.'
      )
    );

    FOR v_rate IN
      SELECT jsonb_build_object('key', k, 'title', t, 'reason', r)
      FROM (VALUES
        ('never_touched', 'Leads that never got a human touch', 'needs contact activity from the CRM history'),
        ('quiet_after_one_touch', 'Leads that went quiet after one touch', 'needs contact activity from the CRM history'),
        ('show_rate', 'Show rate and what a no-show costs', 'needs appointment history from the CRM'),
        ('close_rate_by_source', 'Close rate by source', 'needs contact source and won-deal history from the CRM')
      ) AS x(k, t, r)
    LOOP
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'key', v_rate ->> 'key',
        'title', v_rate ->> 'title',
        'shown', false,
        'measured', false,
        'trace', 'Not shown. This ' || (v_rate ->> 'reason') || ', and the history graded unusable.',
        'fix', 'Vistrial measures this from live data from day one. The gap is history, not capability.',
        'vistrial', NULL
      ));
    END LOOP;

    RETURN jsonb_build_object(
      'basis', v_basis,
      'basis_label', 'Based on your own stated figures, not measured history.',
      'generated_at', now(),
      'org_name', o.name,
      'org_slug', o.slug,
      'profile_version', p.version,
      'baseline_run_id', v_run.id,
      'window_start', NULL,
      'window_end', NULL,
      'missing', v_missing,
      'min_sample', v_min,
      'stated', jsonb_build_object(
        'close_rate_pct', v_close, 'price_point_cents', v_price,
        'monthly_lead_volume', p.monthly_lead_volume, 'speed_to_lead_intent_minutes', v_intent
      ),
      'findings', v_findings,
      'benchmark', public.benchmark_for_org(p_org_id)
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Measured from the backfill.
  -- -------------------------------------------------------------------------

  -- 1. Leads that never got a human touch.
  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NULL)
  INTO v_n, v_k
  FROM public.baseline_leads
  WHERE org_id = p_org_id AND run_id = v_run.id AND created_at_crm IS NOT NULL;

  v_rate := public.reporting_rate(v_k, v_n, v_min, false);
  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'key', 'never_touched',
    'title', 'Leads that never got a human touch',
    'shown', true,
    'measured', true,
    'rate', v_rate,
    'value_estimate_cents', CASE
      WHEN v_close IS NOT NULL AND v_price IS NOT NULL
      THEN round(v_k * v_close / 100.0 * v_price)::bigint END,
    'estimate_basis', CASE
      WHEN v_close IS NOT NULL AND v_price IS NOT NULL
      THEN 'Estimate. ' || v_k || ' untouched leads at the ' || v_close
        || ' percent close rate and the price you stated. It assumes those leads would have converted like the rest, which is generous.'
      ELSE 'No value estimate. It needs both a close rate and a price point on the profile.' END,
    'trace', 'baseline_leads rows in the backfill window whose first_human_touch_at is null.',
    'fix', 'Every lead has to land in one working queue with an owner, not in a CRM list nobody opens.',
    'vistrial', 'The queue orders by urgency and puts anything past your speed-to-lead window in an alarm band. An untouched lead cannot sit unseen.'
  ));

  -- 2. Actual speed to lead against intent.
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - created_at_crm)) / 60.0
  )
  INTO v_n, v_median
  FROM public.baseline_leads
  WHERE org_id = p_org_id AND run_id = v_run.id
    AND created_at_crm IS NOT NULL AND first_human_touch_at IS NOT NULL
    AND first_human_touch_at >= created_at_crm;

  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'key', 'speed_to_lead',
    'title', 'Speed to lead, intended against actual',
    'shown', true,
    'measured', v_n >= v_min,
    'intent_minutes', v_intent,
    'actual_median_minutes', CASE WHEN v_n >= v_min THEN round(v_median, 1) END,
    'sample_n', v_n,
    'too_small', v_n < v_min,
    'trace', 'Median minutes from baseline_leads.created_at_crm to first_human_touch_at, over '
      || v_n || ' contacts that were touched at all.',
    'fix', 'Intent is a number on a wall until something fires when it is missed.',
    'vistrial', 'The alarm band fires at ' || v_intent || ' minutes and stays lit until somebody logs a touch.'
  ));

  -- 3. Leads that went quiet after one touch and were never chased.
  SELECT count(*) INTO v_n
  FROM public.baseline_leads b
  WHERE b.org_id = p_org_id AND b.run_id = v_run.id AND b.created_at_crm IS NOT NULL;

  SELECT count(*) INTO v_k
  FROM public.baseline_leads b
  WHERE b.org_id = p_org_id AND b.run_id = v_run.id AND b.created_at_crm IS NOT NULL
    AND (SELECT count(*) FROM public.baseline_touches t WHERE t.baseline_lead_id = b.id) = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.baseline_revenue r
      WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
    );

  v_rate := public.reporting_rate(v_k, v_n, v_min, false);
  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'key', 'quiet_after_one_touch',
    'title', 'Leads that went quiet after one touch',
    'shown', true,
    'measured', true,
    'rate', v_rate,
    'value_estimate_cents', CASE
      WHEN v_close IS NOT NULL AND v_price IS NOT NULL
      THEN round(v_k * v_close / 100.0 * v_price)::bigint END,
    'estimate_basis', CASE
      WHEN v_close IS NOT NULL AND v_price IS NOT NULL
      THEN 'Estimate at your stated close rate and price. One-touch leads convert worse than average, so treat this as a ceiling.'
      ELSE 'No value estimate. It needs both a close rate and a price point on the profile.' END,
    'trace', 'baseline_leads with exactly one row in baseline_touches and no row in baseline_revenue.',
    'fix', 'A second and third touch has to be scheduled by something other than memory.',
    'vistrial', 'Follow-up drafts are written after every call and every silence, and a human approves each one before it sends.'
  ));

  -- 4. Show rate and the cost of a no-show.
  SELECT count(*) FILTER (WHERE outcome IS NOT NULL),
         count(*) FILTER (WHERE outcome = 'held'),
         count(*) FILTER (WHERE outcome = 'no_show')
  INTO v_n, v_k, v_dead_n
  FROM public.baseline_calls
  WHERE org_id = p_org_id AND run_id = v_run.id;

  v_rate := public.reporting_rate(v_k, v_n, v_min, false);
  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'key', 'show_rate',
    'title', 'Show rate, and what a no-show costs you',
    'shown', true,
    'measured', true,
    'rate', v_rate,
    'no_show_count', v_dead_n,
    'value_estimate_cents', CASE
      WHEN v_close IS NOT NULL AND v_price IS NOT NULL
      THEN round(v_dead_n * v_close / 100.0 * v_price)::bigint END,
    'estimate_basis', CASE
      WHEN v_close IS NOT NULL AND v_price IS NOT NULL
      THEN 'Estimate. ' || v_dead_n || ' no-shows at your stated close rate and price. A booked call that shows converts better than an average lead, so this is conservative.'
      ELSE 'No value estimate. It needs both a close rate and a price point on the profile.' END,
    'trace', 'baseline_calls with a recorded outcome, held against resolved.',
    'fix', 'No-shows need a same-day reach-out, not a slot that quietly empties.',
    'vistrial', 'A no-show routes straight into its own follow-up branch with a draft waiting for approval.'
  ));

  -- 5. Close rate by source, naming any source with volume and no closes.
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'source', s.source,
      'leads', s.n,
      'closes', s.k,
      'rate', public.reporting_rate(s.k, s.n, v_min, false)
    ) ORDER BY s.n DESC), '[]'::jsonb),
    COALESCE(jsonb_agg(s.source) FILTER (WHERE s.k = 0 AND s.n >= v_min), '[]'::jsonb)
  INTO v_sources, v_zero
  FROM (
    SELECT
      COALESCE(b.source, 'unattributed') AS source,
      count(*) AS n,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.baseline_revenue r
        WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
      )) AS k
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id AND b.run_id = v_run.id
    GROUP BY 1
  ) s;

  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'key', 'close_rate_by_source',
    'title', 'Close rate by source',
    'shown', true,
    'measured', true,
    'rows', v_sources,
    'zero_close_sources', v_zero,
    'trace', 'baseline_leads grouped by source, closes from baseline_revenue. Rates are withheld under '
      || v_min || ' leads and the count is shown instead.',
    'fix', 'A source that produces volume and no closes is a budget line, not a lead source.',
    'vistrial', 'Reporting keeps close rate by source live, so the answer stays current instead of being re-derived once a quarter.'
  ));

  -- 5b. Cost per acquisition, only where spend was actually shared.
  SELECT COALESCE(sum((value #>> '{}')::bigint), 0) INTO v_spend
  FROM jsonb_each(p.channel_spend_cents);

  IF v_spend > 0 THEN
    SELECT count(*) INTO v_closes
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id AND b.run_id = v_run.id
      AND EXISTS (
        SELECT 1 FROM public.baseline_revenue r
        WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
      );

    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'key', 'cost_per_acquisition',
      'title', 'Cost per client acquired',
      'shown', true,
      'measured', true,
      'monthly_spend_cents', v_spend,
      'closes_in_window', v_closes,
      'window_months', round(EXTRACT(EPOCH FROM (v_run.window_end - v_run.window_start)) / 2592000.0, 1),
      'cost_per_close_cents', CASE WHEN v_closes > 0 THEN round(
        v_spend * (EXTRACT(EPOCH FROM (v_run.window_end - v_run.window_start)) / 2592000.0) / v_closes
      )::bigint END,
      'trace', 'Monthly spend you shared, spread over the ' || round(EXTRACT(EPOCH FROM (v_run.window_end - v_run.window_start)) / 2592000.0, 1)
        || ' months of history, divided by the closes in it. Spend is your figure; closes are measured.',
      'fix', 'Cost per client is the number that decides whether to spend more, and it needs both halves.',
      'vistrial', 'Vistrial measures the closes. It does not read your ad accounts, so spend stays something you tell it.'
    ));
  END IF;

  -- 6. Where deals actually die. The CRM history carries no cause, so this is
  -- read from live status history and is honest about being empty early.
  SELECT count(*) INTO v_dead_n
  FROM public.lead_status_changes c
  WHERE c.org_id = p_org_id AND c.to_status IN ('closed_lost', 'ghost');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('cause', cause, 'n', n) ORDER BY n DESC), '[]'::jsonb)
  INTO v_terminal
  FROM (
    SELECT
      CASE
        WHEN c.to_status = 'ghost' THEN 'went silent'
        WHEN EXISTS (
          SELECT 1 FROM public.objections ob
          WHERE ob.lead_id = c.lead_id AND ob.resolved = false
        ) THEN 'unresolved objection'
        ELSE 'closed lost, no objection recorded'
      END AS cause,
      count(*) AS n
    FROM public.lead_status_changes c
    WHERE c.org_id = p_org_id AND c.to_status IN ('closed_lost', 'ghost')
    GROUP BY 1
  ) t;

  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'key', 'where_deals_die',
    'title', 'Where deals actually die',
    'shown', true,
    'measured', v_dead_n >= v_min,
    'rows', CASE WHEN v_dead_n >= v_min THEN v_terminal ELSE '[]'::jsonb END,
    'sample_n', v_dead_n,
    'too_small', v_dead_n < v_min,
    'trace', CASE WHEN v_dead_n >= v_min
      THEN 'lead_status_changes into closed lost or ghost, split by whether an unresolved objection was on the lead.'
      ELSE 'Not measured. Your CRM history records that deals were lost but not why, and Vistrial has fewer than '
        || v_min || ' terminal events of its own so far.' END,
    'fix', 'Cause of death has to be captured at the moment the deal dies, which means an outcome logged on every call.',
    'vistrial', 'Extraction pulls the objection in the prospect''s words off the transcript, so the cause is recorded without anyone typing it.'
  ));

  RETURN jsonb_build_object(
    'basis', v_basis,
    'basis_label', CASE
      WHEN v_basis = 'backfill' THEN 'Measured from your own CRM history.'
      ELSE 'Measured from your own CRM history, which graded partial. What is missing is named rather than filled in.' END,
    'generated_at', now(),
    'org_name', o.name,
    'org_slug', o.slug,
    'profile_version', p.version,
    'baseline_run_id', v_run.id,
    'window_start', v_run.window_start,
    'window_end', v_run.window_end,
    'missing', v_missing,
    'min_sample', v_min,
    'stated', jsonb_build_object(
      'close_rate_pct', v_close, 'price_point_cents', v_price,
      'monthly_lead_volume', p.monthly_lead_volume, 'speed_to_lead_intent_minutes', v_intent
    ),
    'findings', v_findings,
    'benchmark', public.benchmark_for_org(p_org_id)
  );
END;
$$;

COMMENT ON FUNCTION public.leak_report_compute(uuid) IS
  'Every figure carries the rows it came from. Estimates use the client''s own stated close rate and price and say so. An unusable backfill produces a stated-figures report, never an invented one.';

CREATE OR REPLACE FUNCTION public.leak_report_generate(p_org_id uuid, p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_first jsonb;
  v_first_at timestamptz;
  v_run uuid;
  v_movement jsonb := '[]'::jsonb;
  v_id uuid;
  v_key text;
  v_now numeric;
  v_then numeric;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  v_payload := public.leak_report_compute(p_org_id);
  v_run := nullif(v_payload ->> 'baseline_run_id', '')::uuid;

  -- Movement is measured against the first report cut from the same baseline,
  -- so day ninety is compared to the original and not to a re-cut of it.
  SELECT payload, generated_at INTO v_first, v_first_at
  FROM public.leak_reports
  WHERE org_id = p_org_id AND baseline_run_id IS NOT DISTINCT FROM v_run
  ORDER BY generated_at ASC LIMIT 1;

  IF v_first IS NOT NULL THEN
    FOREACH v_key IN ARRAY ARRAY['never_touched', 'quiet_after_one_touch', 'show_rate'] LOOP
      SELECT (f -> 'rate' ->> 'pct')::numeric INTO v_now
      FROM jsonb_array_elements(v_payload -> 'findings') f WHERE f ->> 'key' = v_key;
      SELECT (f -> 'rate' ->> 'pct')::numeric INTO v_then
      FROM jsonb_array_elements(v_first -> 'findings') f WHERE f ->> 'key' = v_key;
      IF v_now IS NOT NULL AND v_then IS NOT NULL THEN
        v_movement := v_movement || jsonb_build_array(jsonb_build_object(
          'key', v_key, 'first', v_then, 'now', v_now,
          'delta', public.reporting_trunc_delta(v_now - v_then, 1)
        ));
      END IF;
    END LOOP;

    SELECT (f ->> 'actual_median_minutes')::numeric INTO v_now
    FROM jsonb_array_elements(v_payload -> 'findings') f WHERE f ->> 'key' = 'speed_to_lead';
    SELECT (f ->> 'actual_median_minutes')::numeric INTO v_then
    FROM jsonb_array_elements(v_first -> 'findings') f WHERE f ->> 'key' = 'speed_to_lead';
    IF v_now IS NOT NULL AND v_then IS NOT NULL THEN
      v_movement := v_movement || jsonb_build_array(jsonb_build_object(
        'key', 'speed_to_lead', 'first', v_then, 'now', v_now,
        'delta', public.reporting_trunc_delta(v_now - v_then, 1)
      ));
    END IF;

    v_payload := v_payload || jsonb_build_object(
      'movement', v_movement,
      'movement_against', v_first_at
    );
  END IF;

  INSERT INTO public.leak_reports (
    org_id, basis, baseline_run_id, profile_version, payload, generated_by_member_id
  ) VALUES (
    p_org_id,
    (v_payload ->> 'basis')::public.leak_report_basis,
    v_run,
    (v_payload ->> 'profile_version')::integer,
    v_payload,
    p_member_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- The activation gate.
--
-- Prompt 11 activated the workspace as a side effect of the backfill
-- finishing. That is removed here: four of the five hard requirements below
-- could never block anything if activation kept happening on its own.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_baseline_run(
  p_run_id uuid,
  p_activate boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.baseline_runs WHERE id = p_run_id;
  IF v_org IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.baseline_runs
  SET status = 'completed',
      finished_at = now(),
      claimed_at = NULL,
      progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object('phase', 'completed')
  WHERE id = p_run_id;
  -- p_activate is kept for the signature and defaults to false. Activation is
  -- a gated act with a named actor, never a job's side effect.
  IF p_activate THEN
    PERFORM public.mark_org_activated(v_org);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_baseline_backfill(
  p_org_id uuid,
  p_member_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run uuid;
  v_status public.baseline_run_status;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT id, status INTO v_run, v_status
  FROM public.baseline_runs
  WHERE org_id = p_org_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_run IS NOT NULL AND v_status IN ('queued', 'running', 'failed') THEN
    UPDATE public.baseline_runs
    SET
      status = 'skipped',
      grade = 'unusable',
      grade_reasons = ARRAY['explicitly skipped by an admin'],
      finished_at = now(),
      triggered_by_member_id = COALESCE(triggered_by_member_id, p_member_id),
      progress = jsonb_build_object('phase', 'skipped')
    WHERE id = v_run;
  ELSE
    INSERT INTO public.baseline_runs (
      org_id, status, grade, grade_reasons, lookback_days,
      window_start, window_end, triggered_by_member_id, finished_at, progress
    )
    SELECT
      p_org_id,
      'skipped',
      'unusable',
      ARRAY['explicitly skipped by an admin'],
      o.baseline_lookback_days,
      now() - make_interval(days => o.baseline_lookback_days),
      now(),
      p_member_id,
      now(),
      jsonb_build_object('phase', 'skipped')
    FROM public.organizations o
    WHERE o.id = p_org_id;
  END IF;

  -- Skipping resolves the backfill. It does not activate. An unusable grade
  -- still has to be answered with stated figures or an explicit decline.
  RETURN (SELECT activated_at FROM public.organizations WHERE id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_baseline_fallback(
  p_org_id uuid,
  p_member_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  INSERT INTO public.baseline_fallback_declines (org_id, declined_by_member_id, note)
  VALUES (p_org_id, p_member_id, nullif(trim(COALESCE(p_note, '')), ''))
  ON CONFLICT (org_id) DO UPDATE
    SET declined_at = now(),
        declined_by_member_id = EXCLUDED.declined_by_member_id,
        note = EXCLUDED.note;
END;
$$;

CREATE OR REPLACE FUNCTION public.activation_readiness(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_conn public.ghl_connections%ROWTYPE;
  v_hard jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_ok boolean;
  v_detail text;
  v_scored bigint;
  v_mapped integer;
  v_members bigint;
  v_self boolean;
  v_declined boolean;
  v_examples integer;
  v_transcript integer;
  v_completeness jsonb;
  v_record public.activation_records%ROWTYPE;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_conn FROM public.ghl_connections WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_record FROM public.activation_records WHERE org_id = p_org_id;
  v_completeness := public.business_profile_completeness(p_org_id);

  -- 1. CRM connected and verified.
  v_ok := v_conn.org_id IS NOT NULL AND v_conn.status = 'active' AND v_conn.location_id IS NOT NULL;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'crm_connected', 'ok', v_ok,
    'label', 'CRM connected and verified',
    'detail', CASE WHEN v_ok
      THEN 'Linked to ' || COALESCE(v_conn.location_name, v_conn.location_id) || '.'
      ELSE 'No active GoHighLevel connection. Connect it on the integrations page.' END
  ));

  -- 2. Backfill resolved either way.
  SELECT EXISTS (SELECT 1 FROM public.self_reported_baselines WHERE org_id = p_org_id) INTO v_self;
  SELECT EXISTS (SELECT 1 FROM public.baseline_fallback_declines WHERE org_id = p_org_id) INTO v_declined;
  IF v_run.id IS NULL THEN
    v_ok := false;
    v_detail := 'The CRM history backfill has not run. It starts automatically once the CRM is connected.';
  ELSIF v_run.status IN ('queued', 'running') THEN
    v_ok := false;
    v_detail := 'The backfill is still running.';
  ELSIF v_run.status = 'failed' THEN
    v_ok := false;
    v_detail := 'The backfill failed. Re-run it or skip it, then answer with stated figures or decline them.';
  ELSIF v_run.grade IN ('usable', 'partial') THEN
    v_ok := true;
    v_detail := 'Graded ' || v_run.grade || '.';
  ELSIF v_self THEN
    v_ok := true;
    v_detail := 'Graded unusable. Prior figures were captured and are labelled self-reported everywhere.';
  ELSIF v_declined THEN
    v_ok := true;
    v_detail := 'Graded unusable and prior figures were explicitly declined. No baseline comparison will be shown.';
  ELSE
    v_ok := false;
    v_detail := 'Graded unusable. Capture the client-stated prior figures or record that they declined to give them.';
  END IF;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'backfill_resolved', 'ok', v_ok,
    'label', 'Baseline backfill resolved', 'detail', v_detail
  ));

  -- 3. Field mapping producing valid scores on real leads.
  SELECT count(*) INTO v_mapped FROM public.ghl_field_maps WHERE org_id = p_org_id;
  SELECT count(*) INTO v_scored
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.current_score IS NOT NULL;
  v_ok := v_mapped > 0 AND v_scored > 0;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'field_mapping_valid', 'ok', v_ok,
    'label', 'Field mapping produces scores on real leads',
    'detail', CASE
      WHEN v_mapped = 0 THEN 'No CRM fields are mapped, so no application answer ever reaches scoring.'
      WHEN v_scored = 0 THEN 'Fields are mapped but no real lead has produced a score yet.'
      ELSE v_scored || ' real leads currently carry a score from ' || v_mapped || ' mapped fields.' END
  ));

  -- 4. Scoring configuration saved and valid.
  v_ok := sc.org_id IS NOT NULL
    AND (sc.timeline_weight + sc.investment_capacity_weight + sc.decision_authority_weight + sc.pain_severity_weight) = 100
    AND EXISTS (SELECT 1 FROM public.score_field_maps m WHERE m.org_id = p_org_id)
    AND EXISTS (
      SELECT 1 FROM public.score_field_rules r
      JOIN public.score_field_maps m ON m.id = r.field_map_id
      WHERE m.org_id = p_org_id
    );
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'scoring_valid', 'ok', v_ok,
    'label', 'Scoring configuration saved and valid',
    'detail', CASE WHEN v_ok
      THEN 'Weights total 100 and answer rules exist for the mapped fields.'
      ELSE 'Scoring has no saved answer rules, or the four weights do not total 100.' END
  ));

  -- 5. At least one active member who can work leads.
  SELECT count(*) INTO v_members
  FROM public.org_members
  WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter');
  v_ok := v_members > 0;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'key', 'active_member', 'ok', v_ok,
    'label', 'At least one active member who can work leads',
    'detail', CASE WHEN v_ok THEN v_members || ' active members.' ELSE 'Nobody active can open the queue.' END
  ));

  -- Warnings. Each one has to be acknowledged, and the acknowledgement is kept.
  SELECT COALESCE(jsonb_array_length(vp.examples), 0) INTO v_examples
  FROM public.org_voice_profiles vp WHERE vp.org_id = p_org_id;
  IF COALESCE(v_examples, 0) = 0 THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'no_voice_examples',
      'label', 'No voice examples',
      'detail', 'Drafts will read generic. The voice profile has nothing of yours to imitate.'
    ));
  END IF;

  SELECT count(*) INTO v_transcript FROM public.transcript_connections WHERE org_id = p_org_id;
  IF COALESCE(v_transcript, 0) = 0 THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'no_transcript_source',
      'label', 'No transcript source',
      'detail', 'No extraction, no pre-call briefs, and no grounded follow-up. Everything downstream of a call stays empty.'
    ));
  END IF;

  IF (v_completeness ->> 'score')::integer < public.profile_completeness_min() THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'profile_incomplete',
      'label', 'Business profile below the usable threshold',
      'detail', 'Completeness is ' || (v_completeness ->> 'score') || ' against a usable threshold of '
        || public.profile_completeness_min() || '.',
      'affects', (
        SELECT COALESCE(jsonb_agg(DISTINCT g ->> 'consumer'), '[]'::jsonb)
        FROM jsonb_array_elements(v_completeness -> 'gaps') g
      )
    ));
  END IF;

  IF v_run.grade = 'partial' THEN
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'key', 'backfill_partial',
      'label', 'Baseline graded partial',
      'detail', 'Every before-and-after figure carries a caveat.',
      'affects', to_jsonb(v_run.grade_reasons)
    ));
  END IF;

  RETURN jsonb_build_object(
    'activated_at', o.activated_at,
    'hard', v_hard,
    'blocked', EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_hard) h WHERE (h ->> 'ok')::boolean = false
    ),
    'warnings', v_warn,
    'completeness', v_completeness,
    'record', CASE WHEN v_record.org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'activated_at', v_record.activated_at,
      'activated_by_member_id', v_record.activated_by_member_id,
      'warnings_acknowledged', to_jsonb(v_record.warnings_acknowledged),
      'requirements', v_record.requirements
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_org(
  p_org_id uuid,
  p_member_id uuid,
  p_acknowledged public.activation_warning[] DEFAULT '{}'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state jsonb;
  v_blocking text;
  v_unacked text;
  v_at timestamptz;
BEGIN
  PERFORM public.profile_require_access(p_org_id);

  IF (SELECT activated_at FROM public.organizations WHERE id = p_org_id) IS NOT NULL THEN
    RAISE EXCEPTION 'already activated. The timestamp is captured once.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_member_id AND org_id = p_org_id AND active
  ) THEN
    RAISE EXCEPTION 'activation has to be recorded against an active member of this org';
  END IF;

  v_state := public.activation_readiness(p_org_id);

  SELECT string_agg(h ->> 'label', '; ') INTO v_blocking
  FROM jsonb_array_elements(v_state -> 'hard') h
  WHERE (h ->> 'ok')::boolean = false;

  IF v_blocking IS NOT NULL THEN
    RAISE EXCEPTION 'activation blocked: %', v_blocking;
  END IF;

  SELECT string_agg(w ->> 'label', '; ') INTO v_unacked
  FROM jsonb_array_elements(v_state -> 'warnings') w
  WHERE NOT ((w ->> 'key')::public.activation_warning = ANY (COALESCE(p_acknowledged, '{}')));

  IF v_unacked IS NOT NULL THEN
    RAISE EXCEPTION 'unacknowledged warnings: %', v_unacked;
  END IF;

  UPDATE public.organizations SET activated_at = now() WHERE id = p_org_id
  RETURNING activated_at INTO v_at;

  INSERT INTO public.activation_records (
    org_id, activated_at, activated_by_member_id, warnings_acknowledged, requirements
  ) VALUES (
    p_org_id, v_at, p_member_id, COALESCE(p_acknowledged, '{}'), v_state -> 'hard'
  );

  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.activate_org(uuid, uuid, public.activation_warning[]) IS
  'The only way a workspace goes live. Every hard requirement blocks independently and every warning has to be acknowledged by key.';

CREATE OR REPLACE FUNCTION public.change_activation_timestamp(
  p_org_id uuid,
  p_member_id uuid,
  p_new_at timestamptz,
  p_reason text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev timestamptz;
BEGIN
  PERFORM public.profile_require_access(p_org_id);

  SELECT activated_at INTO v_prev FROM public.organizations WHERE id = p_org_id;
  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'this workspace has not been activated, so there is nothing to move';
  END IF;
  IF p_new_at IS NULL OR p_new_at > now() THEN
    RAISE EXCEPTION 'the activation timestamp cannot be in the future';
  END IF;
  IF p_new_at = v_prev THEN
    RAISE EXCEPTION 'that is the timestamp it already has';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) < 20 THEN
    RAISE EXCEPTION 'moving activation needs a written reason of at least twenty characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members WHERE id = p_member_id AND org_id = p_org_id AND active
  ) THEN
    RAISE EXCEPTION 'the change has to be recorded against an active member of this org';
  END IF;

  INSERT INTO public.activation_changes (org_id, previous_at, new_at, reason, changed_by_member_id)
  VALUES (p_org_id, v_prev, p_new_at, trim(p_reason), p_member_id);

  UPDATE public.organizations SET activated_at = p_new_at WHERE id = p_org_id;
  UPDATE public.activation_records SET activated_at = p_new_at WHERE org_id = p_org_id;

  -- Every cached figure was cut against the old line.
  DELETE FROM public.reporting_snapshots WHERE org_id = p_org_id;
  DELETE FROM public.reporting_cohorts WHERE org_id = p_org_id;

  RETURN p_new_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- The profile stays alive: review prompts and stated-versus-observed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profile_detect_signals(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_found integer := 0;
  v_min integer := public.reporting_diag_min();
  v_since timestamptz;
  v_live_price bigint;
  v_live_volume bigint;
  v_new_source text;
  v_n bigint;
  v_median numeric;
  v_top public.objection_type;
  v_stated_top public.objection_type;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  IF p.org_id IS NULL THEN
    RETURN 0;
  END IF;

  v_since := COALESCE(p.last_reviewed_at, p.created_at);

  -- Quarterly review.
  IF v_since < now() - interval '90 days' THEN
    INSERT INTO public.profile_review_prompts (org_id, reason, detail)
    VALUES (p_org_id, 'quarterly',
      'The profile has not been reviewed since ' || to_char(v_since, 'YYYY-MM-DD')
      || '. Everything downstream reads it, so a stale answer becomes a wrong one.')
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- A price change in the revenue data.
  SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY amount_cents))::bigint
  INTO v_live_price
  FROM public.revenue_log
  WHERE org_id = p_org_id AND amount_cents IS NOT NULL AND occurred_at >= now() - interval '90 days';

  IF v_live_price IS NOT NULL AND p.price_point_cents IS NOT NULL
     AND abs(v_live_price - p.price_point_cents) > p.price_point_cents * 0.25 THEN
    INSERT INTO public.profile_review_prompts (org_id, reason, detail)
    VALUES (p_org_id, 'price_change',
      'Deals over the last ninety days sit at a median of ' || v_live_price
      || ' cents against a profile price of ' || p.price_point_cents
      || ' cents. A price change reprices every score and every estimate.')
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- A large volume shift.
  SELECT count(*) INTO v_live_volume
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '30 days';

  IF p.monthly_lead_volume IS NOT NULL AND p.monthly_lead_volume > 0
     AND v_live_volume >= 10
     AND abs(v_live_volume - p.monthly_lead_volume) > p.monthly_lead_volume * 0.4 THEN
    INSERT INTO public.profile_review_prompts (org_id, reason, detail)
    VALUES (p_org_id, 'volume_change',
      v_live_volume || ' leads arrived in the last thirty days against a profile figure of '
      || p.monthly_lead_volume || '. Capacity warnings and the benchmark cohort both read that number.')
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- A new source appearing.
  SELECT l.source INTO v_new_source
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.source IS NOT NULL
    AND l.opted_in_at >= now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.leads e
      WHERE e.org_id = p_org_id AND e.source = l.source
        AND e.opted_in_at < now() - interval '30 days'
    )
  GROUP BY l.source
  HAVING count(*) >= 5
  ORDER BY count(*) DESC
  LIMIT 1;

  IF v_new_source IS NOT NULL THEN
    INSERT INTO public.profile_review_prompts (org_id, reason, detail)
    VALUES (p_org_id, 'new_source',
      'Leads started arriving from "' || v_new_source
      || '", which is not on the profile. Source quality reporting cannot label what it does not know about.')
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- Stated against observed: one-call close.
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY t.n)
  INTO v_n, v_median
  FROM (
    SELECT l.id, (SELECT count(*) FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'held') AS n
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = l.org_id AND r.lead_id = l.id)
  ) t;

  IF v_n >= v_min AND v_median IS NOT NULL AND p.close_motion = 'one_call' AND v_median >= 2 THEN
    INSERT INTO public.profile_contradictions (org_id, kind, stated, observed, sample_n)
    VALUES (p_org_id, 'close_motion', 'closes in one call',
      'the median closed deal took ' || round(v_median, 1) || ' held calls', v_n)
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- Stated against observed: sales cycle.
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (r.occurred_at - l.opted_in_at)) / 86400.0
  )
  INTO v_n, v_median
  FROM public.leads l
  JOIN public.revenue_log r ON r.org_id = l.org_id AND r.lead_id = l.id
  WHERE l.org_id = p_org_id AND r.occurred_at > l.opted_in_at;

  IF v_n >= v_min AND v_median IS NOT NULL AND p.sales_cycle_days IS NOT NULL
     AND abs(v_median - p.sales_cycle_days) > p.sales_cycle_days * 0.5 THEN
    INSERT INTO public.profile_contradictions (org_id, kind, stated, observed, sample_n)
    VALUES (p_org_id, 'sales_cycle', p.sales_cycle_days || ' day sales cycle',
      'the median closed deal took ' || round(v_median) || ' days', v_n)
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- Stated against observed: the top objection.
  SELECT (p.top_objections -> 0 ->> 'type')::public.objection_type INTO v_stated_top;
  SELECT ob.type, count(*) INTO v_top, v_n
  FROM public.objections ob
  WHERE ob.org_id = p_org_id
  GROUP BY ob.type ORDER BY count(*) DESC LIMIT 1;

  IF v_stated_top IS NOT NULL AND v_top IS NOT NULL AND v_n >= v_min AND v_top <> v_stated_top THEN
    INSERT INTO public.profile_contradictions (org_id, kind, stated, observed, sample_n)
    VALUES (p_org_id, 'top_objection', v_stated_top::text || ' is the objection you hear most',
      v_top::text || ' is what transcripts actually record most', v_n)
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  -- Stated against observed: speed to lead.
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)) / 60.0
  )
  INTO v_n, v_median
  FROM public.leads
  WHERE org_id = p_org_id AND first_human_touch_at IS NOT NULL AND first_human_touch_at >= opted_in_at;

  IF v_n >= v_min AND v_median IS NOT NULL AND p.speed_to_lead_intent_minutes IS NOT NULL
     AND v_median > p.speed_to_lead_intent_minutes * 3 THEN
    INSERT INTO public.profile_contradictions (org_id, kind, stated, observed, sample_n)
    VALUES (p_org_id, 'speed_to_lead',
      'you aim to respond in ' || p.speed_to_lead_intent_minutes || ' minutes',
      'the real median is ' || round(v_median) || ' minutes', v_n)
    ON CONFLICT DO NOTHING;
    v_found := v_found + 1;
  END IF;

  RETURN v_found;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_profile_review_prompt(
  p_org_id uuid, p_id uuid, p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  UPDATE public.profile_review_prompts
  SET resolved_at = now(), resolved_by_member_id = p_member_id
  WHERE id = p_id AND org_id = p_org_id AND resolved_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_profile_contradiction(
  p_org_id uuid, p_id uuid, p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  UPDATE public.profile_contradictions
  SET dismissed_at = now(), dismissed_by_member_id = p_member_id
  WHERE id = p_id AND org_id = p_org_id AND dismissed_at IS NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Adoption watch. Facts, stated to the person accountable. No streaks, no
-- badges, no completion percentages.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adoption_watch(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_alarms jsonb := '[]'::jsonb;
  v_ingested_24h bigint;
  v_ingested_7d bigint;
  v_touch_this jsonb;
  v_touch_prev jsonb;
  v_touch_k bigint;
  v_touch_n bigint;
  v_log_k bigint;
  v_log_n bigint;
  v_log_prev_k bigint;
  v_log_prev_n bigint;
  v_median numeric;
  v_approved bigint;
  v_rejected bigint;
  v_members jsonb;
  v_idle jsonb;
  v_unmatched bigint;
  v_days integer;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;

  IF o.activated_at IS NULL THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  v_days := floor(EXTRACT(EPOCH FROM (now() - o.activated_at)) / 86400.0)::integer;

  SELECT count(*) INTO v_ingested_24h
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_ingested_7d
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '7 days';

  IF v_days >= 1 AND v_ingested_24h = 0 THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'no_leads_24h',
      'plain', 'No lead has arrived in twenty-four hours. Either the form stopped or the CRM connection did.'
    ));
  END IF;

  -- Human touch coverage, this week against last.
  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_touch_n, v_touch_k
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '7 days';
  v_touch_this := public.reporting_rate(v_touch_k, v_touch_n, public.reporting_diag_min(), false);

  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_touch_n, v_touch_k
  FROM public.leads
  WHERE org_id = p_org_id
    AND opted_in_at >= now() - interval '14 days' AND opted_in_at < now() - interval '7 days';
  v_touch_prev := public.reporting_rate(v_touch_k, v_touch_n, public.reporting_diag_min(), false);

  -- Outcome logging: calls whose scheduled time has passed and that carry an outcome.
  SELECT count(*), count(*) FILTER (WHERE outcome IS NOT NULL)
  INTO v_log_n, v_log_k
  FROM public.calls
  WHERE org_id = p_org_id AND scheduled_at >= now() - interval '7 days' AND scheduled_at < now();

  SELECT count(*), count(*) FILTER (WHERE outcome IS NOT NULL)
  INTO v_log_prev_n, v_log_prev_k
  FROM public.calls
  WHERE org_id = p_org_id
    AND scheduled_at >= now() - interval '14 days' AND scheduled_at < now() - interval '7 days';

  IF v_ingested_7d >= 5 AND NOT EXISTS (
    SELECT 1 FROM public.touches t
    WHERE t.org_id = p_org_id AND t.type = 'human' AND t.occurred_at >= now() - interval '7 days'
  ) THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'leads_no_touches',
      'plain', v_ingested_7d || ' leads arrived this week and not one human touch was logged. If the team is working '
        || 'them in the CRM and not recording it here, every number on this page understates what actually happened.'
    ));
  END IF;

  SELECT percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)) / 60.0
  )
  INTO v_median
  FROM public.leads
  WHERE org_id = p_org_id AND opted_in_at >= now() - interval '14 days'
    AND first_human_touch_at IS NOT NULL AND first_human_touch_at >= opted_in_at;

  SELECT count(*) FILTER (WHERE status IN ('approved', 'sent')),
         count(*) FILTER (WHERE status = 'rejected')
  INTO v_approved, v_rejected
  FROM public.follow_up_drafts
  WHERE org_id = p_org_id AND created_at >= now() - interval '14 days';

  IF v_approved + v_rejected >= 10 AND v_rejected * 2 > v_approved + v_rejected THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'draft_rejection_high',
      'plain', 'More than half of the drafts written in the last fortnight were rejected. The voice profile is not '
        || 'reading like you, and adding real sent messages to it is the fix.'
    ));
  END IF;

  SELECT count(*) INTO v_unmatched
  FROM public.unmatched_transcripts WHERE org_id = p_org_id AND status = 'open';
  IF v_unmatched > 0 THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'transcripts_unmatched',
      'plain', v_unmatched || ' transcripts arrived without matching a call, so no brief and no extraction came from them.'
    ));
  END IF;

  -- Who used the system this week, and who did not.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member_id', m.id, 'name', m.display_name, 'role', m.role,
    'touches', x.touches, 'outcomes', x.outcomes, 'approvals', x.approvals,
    'last_active_at', x.last_active_at
  ) ORDER BY m.display_name), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.touches t
       WHERE t.actor_member_id = m.id AND t.occurred_at >= now() - interval '7 days') AS touches,
      (SELECT count(*) FROM public.calls c
       WHERE c.ran_by_member_id = m.id AND c.outcome IS NOT NULL
         AND c.updated_at >= now() - interval '7 days') AS outcomes,
      (SELECT count(*) FROM public.follow_up_drafts d
       WHERE d.approved_by_member_id = m.id AND d.approved_at >= now() - interval '7 days') AS approvals,
      GREATEST(
        (SELECT max(t.occurred_at) FROM public.touches t WHERE t.actor_member_id = m.id),
        (SELECT max(d.approved_at) FROM public.follow_up_drafts d WHERE d.approved_by_member_id = m.id)
      ) AS last_active_at
  ) x
  WHERE m.org_id = p_org_id AND m.active;

  SELECT COALESCE(jsonb_agg(e ->> 'name'), '[]'::jsonb) INTO v_idle
  FROM jsonb_array_elements(v_members) e
  WHERE (e ->> 'touches')::bigint = 0
    AND (e ->> 'outcomes')::bigint = 0
    AND (e ->> 'approvals')::bigint = 0;

  IF jsonb_array_length(v_idle) > 0 AND v_ingested_7d > 0 THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'members_idle',
      'plain', 'These people have done nothing in the system this week: '
        || (SELECT string_agg(x #>> '{}', ', ') FROM jsonb_array_elements(v_idle) x)
        || '. Leads are arriving, so the work is happening somewhere this cannot see.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'activated', true,
    'activated_at', o.activated_at,
    'days_live', v_days,
    'in_first_fortnight', v_days <= 14,
    'leads_ingested_24h', v_ingested_24h,
    'leads_ingested_7d', v_ingested_7d,
    'human_touch', jsonb_build_object('this_week', v_touch_this, 'previous_week', v_touch_prev),
    'outcome_logging', jsonb_build_object(
      'this_week', public.reporting_rate(v_log_k, v_log_n, public.reporting_diag_min(), false),
      'previous_week', public.reporting_rate(v_log_prev_k, v_log_prev_n, public.reporting_diag_min(), false)
    ),
    'median_minutes_to_first_touch', CASE WHEN v_median IS NULL THEN NULL ELSE round(v_median, 1) END,
    'configured_window_minutes', sc.speed_to_lead_minutes,
    'drafts', jsonb_build_object('approved', v_approved, 'rejected', v_rejected),
    'members', v_members,
    'alarms', v_alarms
  );
END;
$$;

COMMENT ON FUNCTION public.adoption_watch(uuid) IS
  'The first fortnight, and after it. Facts only: no streaks, no badges, no completion percentage.';

-- ---------------------------------------------------------------------------
-- Applying the profile to the configuration the rest of the platform reads.
--
-- Nothing here runs on its own. It runs when the client submits a stage, which
-- is what makes a prior a pre-fill rather than a silent change.
--
-- Signal to factor, stated rather than implied:
--   has_budget, existing_revenue      -> investment_capacity
--   urgent_timeline                   -> timeline
--   sole_decision_maker, has_team     -> decision_authority
--   clear_pain, tried_alternatives,
--   right_industry                    -> pain_severity
--   other                             -> nothing; it is a note, not a factor
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profile_signal_factor(p_signal public.profile_qualification_signal)
RETURNS public.score_factor
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_signal
    WHEN 'has_budget' THEN 'investment_capacity'
    WHEN 'existing_revenue' THEN 'investment_capacity'
    WHEN 'urgent_timeline' THEN 'timeline'
    WHEN 'sole_decision_maker' THEN 'decision_authority'
    WHEN 'has_team' THEN 'decision_authority'
    WHEN 'clear_pain' THEN 'pain_severity'
    WHEN 'tried_alternatives' THEN 'pain_severity'
    WHEN 'right_industry' THEN 'pain_severity'
    ELSE NULL
  END::public.score_factor;
$$;

CREATE OR REPLACE FUNCTION public.profile_channel_aliases(p_channel public.profile_lead_channel)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_channel
    WHEN 'meta_ads' THEN ARRAY['meta', 'facebook', 'fb', 'instagram', 'ig']
    WHEN 'google_ads' THEN ARRAY['google', 'adwords', 'gads', 'search ads']
    WHEN 'youtube_ads' THEN ARRAY['youtube', 'yt']
    WHEN 'tiktok_ads' THEN ARRAY['tiktok', 'tt']
    WHEN 'organic_social' THEN ARRAY['organic', 'social', 'linkedin', 'twitter', 'x.com']
    WHEN 'email_list' THEN ARRAY['email', 'newsletter', 'list', 'broadcast']
    WHEN 'referral' THEN ARRAY['referral', 'referred', 'word of mouth']
    WHEN 'affiliate' THEN ARRAY['affiliate', 'partner', 'jv']
    WHEN 'webinar' THEN ARRAY['webinar', 'masterclass', 'workshop']
    WHEN 'cold_outbound' THEN ARRAY['cold', 'outbound', 'prospecting', 'dm']
    WHEN 'podcast' THEN ARRAY['podcast']
    WHEN 'seo' THEN ARRAY['seo', 'organic search', 'blog']
    WHEN 'events' THEN ARRAY['event', 'conference', 'summit', 'live']
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.profile_channel_aliases(public.profile_lead_channel) IS
  'How a declared channel is recognised in the raw source string the CRM sends. Used to name sources the client never declared.';

CREATE OR REPLACE FUNCTION public.profile_source_is_declared(p_org_id uuid, p_source text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT bool_or(
      EXISTS (
        SELECT 1 FROM unnest(public.profile_channel_aliases(ch)) AS alias
        WHERE lower(COALESCE(p_source, '')) LIKE '%' || alias || '%'
      )
    )
    FROM public.business_profiles p, unnest(p.lead_channels) AS ch
    WHERE p.org_id = p_org_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.apply_business_profile_configuration(
  p_org_id uuid,
  p_member_id uuid,
  p_stage public.profile_stage
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.business_profiles%ROWTYPE;
  v_applied jsonb := '[]'::jsonb;
  v_soft integer;
  v_hard integer;
  v_factors public.score_factor[];
  v_w jsonb;
  v_share integer;
  v_sum integer;
  v_map_id uuid;
  r record;
  v_delay integer;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  IF p.org_id IS NULL THEN
    RETURN v_applied;
  END IF;

  IF p_stage = 'business' THEN
    IF p.sales_cycle_days IS NOT NULL THEN
      UPDATE public.organizations
      SET sales_cycle_days = LEAST(365, GREATEST(14, p.sales_cycle_days))
      WHERE id = p_org_id;
      v_applied := v_applied || jsonb_build_array('Cohort maturation now waits ' || p.sales_cycle_days || ' days.');

      v_soft := LEAST(90, GREATEST(3, ceil(p.sales_cycle_days / 4.0)::integer));
      v_hard := LEAST(180, GREATEST(v_soft + 1, ceil(p.sales_cycle_days / 2.0)::integer));
      UPDATE public.score_configs
      SET ghost_days_soft = v_soft, ghost_days_hard = v_hard
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'Ghost thresholds set to ' || v_soft || ' and ' || v_hard || ' days.');
    END IF;

    IF p.touches_to_close IS NOT NULL OR p.sales_cycle_days IS NOT NULL THEN
      UPDATE public.follow_up_settings
      SET
        max_sequence_length = LEAST(8, GREATEST(1, ceil(COALESCE(p.touches_to_close, 6) / 2.0)::integer)),
        max_sequence_duration_days = LEAST(90, GREATEST(1, ceil(COALESCE(p.sales_cycle_days, 60) / 3.0)::integer))
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array('Sequence length and duration paced to your cycle.');
    END IF;

    IF p.close_motion IS NOT NULL THEN
      v_delay := CASE p.close_motion WHEN 'one_call' THEN 24 WHEN 'two_call' THEN 48 ELSE 72 END;
      UPDATE public.follow_up_routing_rules
      SET sequence_steps = jsonb_build_array(jsonb_build_object('delayHours', v_delay))
      WHERE org_id = p_org_id AND branch = 'follow_up_scheduled';
      v_applied := v_applied || jsonb_build_array(
        'Post-call follow-up waits ' || v_delay || ' hours, matching a ' || p.close_motion || ' close.');
    END IF;
  END IF;

  IF p_stage = 'funnel' THEN
    FOR r IN
      SELECT
        f ->> 'answer_key' AS answer_key,
        nullif(f ->> 'factor', '')::public.score_factor AS factor
      FROM jsonb_array_elements(p.application_fields) f
      WHERE nullif(f ->> 'answer_key', '') IS NOT NULL
        AND nullif(f ->> 'factor', '') IS NOT NULL
    LOOP
      INSERT INTO public.score_field_maps (org_id, field_name, factor)
      VALUES (p_org_id, r.answer_key, r.factor)
      ON CONFLICT (org_id, field_name) DO UPDATE SET factor = EXCLUDED.factor;
    END LOOP;
    v_applied := v_applied || jsonb_build_array(
      'Application answers routed to factors: '
      || COALESCE((SELECT string_agg(f ->> 'answer_key', ', ')
                   FROM jsonb_array_elements(p.application_fields) f
                   WHERE nullif(f ->> 'factor', '') IS NOT NULL), 'none yet') || '.');
  END IF;

  IF p_stage = 'qualification' THEN
    SELECT array_agg(DISTINCT public.profile_signal_factor(s))
    INTO v_factors
    FROM unnest(p.qualification_signals) AS s
    WHERE public.profile_signal_factor(s) IS NOT NULL;

    IF v_factors IS NOT NULL AND array_length(v_factors, 1) > 0 THEN
      v_share := (60 / array_length(v_factors, 1))::integer;
      v_w := jsonb_build_object(
        'timeline', 10 + CASE WHEN 'timeline' = ANY (v_factors) THEN v_share ELSE 0 END,
        'investment_capacity', 10 + CASE WHEN 'investment_capacity' = ANY (v_factors) THEN v_share ELSE 0 END,
        'decision_authority', 10 + CASE WHEN 'decision_authority' = ANY (v_factors) THEN v_share ELSE 0 END,
        'pain_severity', 10 + CASE WHEN 'pain_severity' = ANY (v_factors) THEN v_share ELSE 0 END
      );
      v_sum := (v_w ->> 'timeline')::integer + (v_w ->> 'investment_capacity')::integer
        + (v_w ->> 'decision_authority')::integer + (v_w ->> 'pain_severity')::integer;
      -- Integer division leaves a remainder. It lands on timeline so the four
      -- weights total exactly 100, which the table constraint requires.
      v_w := jsonb_set(v_w, '{timeline}', to_jsonb((v_w ->> 'timeline')::integer + (100 - v_sum)));

      UPDATE public.score_configs SET
        timeline_weight = (v_w ->> 'timeline')::integer,
        investment_capacity_weight = (v_w ->> 'investment_capacity')::integer,
        decision_authority_weight = (v_w ->> 'decision_authority')::integer,
        pain_severity_weight = (v_w ->> 'pain_severity')::integer
      WHERE org_id = p_org_id;

      v_applied := v_applied || jsonb_build_array(
        'Scoring weights set to timeline ' || (v_w ->> 'timeline')
        || ', investment ' || (v_w ->> 'investment_capacity')
        || ', authority ' || (v_w ->> 'decision_authority')
        || ', pain ' || (v_w ->> 'pain_severity') || '.');
    END IF;

    -- Investment and timeline bands become answer rules on the fields the
    -- application already sends.
    FOR r IN
      SELECT 'investment_capacity'::public.score_factor AS factor, 'budget' AS field, p.price_bands AS bands
      UNION ALL
      SELECT 'timeline'::public.score_factor, 'timeline', p.timeline_bands
    LOOP
      CONTINUE WHEN jsonb_array_length(r.bands) = 0;

      INSERT INTO public.score_field_maps (org_id, field_name, factor)
      VALUES (p_org_id, r.field, r.factor)
      ON CONFLICT (org_id, field_name) DO UPDATE SET factor = EXCLUDED.factor
      RETURNING id INTO v_map_id;

      IF v_map_id IS NULL THEN
        SELECT id INTO v_map_id FROM public.score_field_maps
        WHERE org_id = p_org_id AND field_name = r.field;
      END IF;

      DELETE FROM public.score_field_rules WHERE field_map_id = v_map_id;
      INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
      SELECT p_org_id, v_map_id, 'choice', b ->> 'answer',
        LEAST(100, GREATEST(0, (b ->> 'score')::integer))
      FROM jsonb_array_elements(r.bands) b
      WHERE nullif(b ->> 'answer', '') IS NOT NULL AND nullif(b ->> 'score', '') IS NOT NULL;

      v_applied := v_applied || jsonb_build_array(
        jsonb_array_length(r.bands) || ' bands written onto the ' || r.field || ' field.');
    END LOOP;
  END IF;

  IF p_stage = 'process' THEN
    IF p.speed_to_lead_intent_minutes IS NOT NULL THEN
      UPDATE public.score_configs
      SET speed_to_lead_minutes = LEAST(1440, GREATEST(1, p.speed_to_lead_intent_minutes))
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'The alarm band now fires at ' || p.speed_to_lead_intent_minutes || ' minutes.');
    END IF;

    -- Deduplication. A branch the CRM already runs is switched off here so the
    -- prospect does not get the same nudge twice.
    FOR r IN
      SELECT 'no_show'::public.follow_up_branch AS branch, p.after_no_show AS current, 'a no-show' AS label
      UNION ALL SELECT 'follow_up_scheduled', p.after_call, 'a call'
      UNION ALL SELECT 'ghost_risk', p.after_silence, 'silence'
    LOOP
      CONTINUE WHEN r.current IS NULL;
      UPDATE public.follow_up_routing_rules
      SET enabled = (r.current <> 'crm_sequence')
      WHERE org_id = p_org_id AND branch = r.branch;
      v_applied := v_applied || jsonb_build_array(
        CASE WHEN r.current = 'crm_sequence'
          THEN 'Your CRM already follows up after ' || r.label || ', so Vistrial will not.'
          ELSE 'Vistrial will draft follow-up after ' || r.label || '.' END);
    END LOOP;
  END IF;

  IF p_stage = 'objections' THEN
    DELETE FROM public.objection_vocabulary WHERE org_id = p_org_id;
    INSERT INTO public.objection_vocabulary (org_id, type, phrasing, response, rank)
    SELECT DISTINCT ON ((o ->> 'type')::public.objection_type)
      p_org_id,
      (o ->> 'type')::public.objection_type,
      o ->> 'phrasing',
      nullif(o ->> 'response', ''),
      ord
    FROM jsonb_array_elements(p.top_objections) WITH ORDINALITY AS t(o, ord)
    WHERE nullif(o ->> 'type', '') IS NOT NULL AND nullif(trim(o ->> 'phrasing'), '') IS NOT NULL
    ORDER BY (o ->> 'type')::public.objection_type, ord;
    v_applied := v_applied || jsonb_build_array(
      (SELECT count(*) FROM public.objection_vocabulary WHERE org_id = p_org_id)
      || ' objections seeded before a single transcript has arrived.');
  END IF;

  IF p_stage = 'voice' THEN
    UPDATE public.org_voice_profiles SET
      formality = COALESCE(p.voice_formality, formality),
      banned_words = CASE
        WHEN array_length(p.never_say, 1) IS NULL THEN banned_words
        ELSE ARRAY(SELECT DISTINCT unnest(p.never_say)) END
    WHERE org_id = p_org_id;

    IF p.channel_preference IS NOT NULL THEN
      UPDATE public.follow_up_settings
      SET default_channel = p.channel_preference::public.touch_channel
      WHERE org_id = p_org_id;
      UPDATE public.follow_up_routing_rules
      SET channel = p.channel_preference::public.touch_channel
      WHERE org_id = p_org_id;
    END IF;

    v_applied := v_applied || jsonb_build_array(
      'Voice profile set to ' || COALESCE(p.voice_formality::text, 'unchanged')
      || ' on ' || COALESCE(p.channel_preference, 'the existing channel') || '.');
  END IF;

  PERFORM public.business_profile_refresh_completeness(p_org_id);
  PERFORM public.benchmark_refresh_org_metrics(p_org_id);

  RETURN v_applied;
END;
$$;

COMMENT ON FUNCTION public.apply_business_profile_configuration(uuid, uuid, public.profile_stage) IS
  'Turns the answers of one stage into the settings the queue, scoring, follow-up and reporting already read.';

-- ---------------------------------------------------------------------------
-- Read paths for the app
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_profile_state(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.business_profiles%ROWTYPE;
  v_latest public.leak_reports%ROWTYPE;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO v_latest FROM public.leak_reports
  WHERE org_id = p_org_id ORDER BY generated_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'profile', to_jsonb(p),
    'completeness', public.business_profile_completeness(p_org_id),
    'registry', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'field', r.field, 'stage', r.stage, 'label', r.label,
        'consumer', r.consumer, 'required', r.required
      ) ORDER BY r.sort), '[]'::jsonb)
      FROM public.profile_field_registry r
    ),
    'stages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'stage', s.stage, 'completed_at', s.completed_at, 'completed_by_member_id', s.completed_by_member_id
      ) ORDER BY array_position(enum_range(NULL::public.profile_stage), s.stage)), '[]'::jsonb)
      FROM public.business_profile_stages s WHERE s.org_id = p_org_id
    ),
    'versions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'version', v.version, 'changed_fields', to_jsonb(v.changed_fields),
        'created_at', v.created_at, 'actor_member_id', v.actor_member_id,
        'actor_name', m.display_name
      ) ORDER BY v.version DESC), '[]'::jsonb)
      FROM public.business_profile_versions v
      LEFT JOIN public.org_members m ON m.id = v.actor_member_id
      WHERE v.org_id = p_org_id
    ),
    'review_prompts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', rp.id, 'reason', rp.reason, 'detail', rp.detail, 'detected_at', rp.detected_at
      ) ORDER BY rp.detected_at DESC), '[]'::jsonb)
      FROM public.profile_review_prompts rp
      WHERE rp.org_id = p_org_id AND rp.resolved_at IS NULL
    ),
    'contradictions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'stated', c.stated, 'observed', c.observed,
        'sample_n', c.sample_n, 'detected_at', c.detected_at
      ) ORDER BY c.detected_at DESC), '[]'::jsonb)
      FROM public.profile_contradictions c
      WHERE c.org_id = p_org_id AND c.dismissed_at IS NULL
    ),
    'benchmark', public.benchmark_for_org(p_org_id),
    'pattern_feedback', public.profile_pattern_feedback(p_org_id),
    'activation', public.activation_readiness(p_org_id),
    'activation_changes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'previous_at', ac.previous_at, 'new_at', ac.new_at, 'reason', ac.reason,
        'created_at', ac.created_at, 'actor_name', m.display_name
      ) ORDER BY ac.created_at DESC), '[]'::jsonb)
      FROM public.activation_changes ac
      LEFT JOIN public.org_members m ON m.id = ac.changed_by_member_id
      WHERE ac.org_id = p_org_id
    ),
    'activated_by_name', (
      SELECT m.display_name FROM public.activation_records ar
      JOIN public.org_members m ON m.id = ar.activated_by_member_id
      WHERE ar.org_id = p_org_id
    ),
    'latest_leak_report', CASE WHEN v_latest.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_latest.id, 'basis', v_latest.basis, 'generated_at', v_latest.generated_at,
      'profile_version', v_latest.profile_version
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_payoff(p_org_id uuid, p_stage public.profile_stage)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  p public.business_profiles%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_min integer := public.reporting_diag_min();
  v_n bigint;
  v_median numeric;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;

  IF p_stage = 'connect' THEN
    RETURN jsonb_build_object(
      'connection', (
        SELECT jsonb_build_object('status', c.status, 'location_name', c.location_name,
          'last_verified_at', c.last_verified_at)
        FROM public.ghl_connections c WHERE c.org_id = p_org_id
      ),
      'backfill_status', v_run.status,
      'backfill_grade', v_run.grade,
      'backfill_phase', v_run.progress ->> 'phase',
      'contacts_found', (
        SELECT count(*) FROM public.baseline_leads WHERE org_id = p_org_id AND run_id = v_run.id
      ),
      'history_from', (
        SELECT min(created_at_crm) FROM public.baseline_leads WHERE org_id = p_org_id AND run_id = v_run.id
      ),
      'history_to', (
        SELECT max(created_at_crm) FROM public.baseline_leads WHERE org_id = p_org_id AND run_id = v_run.id
      ),
      'sources', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('source', s.source, 'n', s.n) ORDER BY s.n DESC), '[]'::jsonb)
        FROM (
          SELECT COALESCE(source, 'unattributed') AS source, count(*) AS n
          FROM public.baseline_leads WHERE org_id = p_org_id AND run_id = v_run.id
          GROUP BY 1 ORDER BY 2 DESC LIMIT 8
        ) s
      ),
      'live_leads', (SELECT count(*) FROM public.leads WHERE org_id = p_org_id)
    );
  END IF;

  IF p_stage = 'business' THEN
    RETURN jsonb_build_object(
      'benchmark', public.benchmark_for_org(p_org_id),
      'pattern_feedback', public.profile_pattern_feedback(p_org_id),
      'capacity', jsonb_build_object(
        'volume', p.monthly_lead_volume,
        'target', p.monthly_lead_target,
        'workers', (SELECT count(*) FROM public.org_members
          WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter')),
        'leads_per_worker', CASE
          WHEN (SELECT count(*) FROM public.org_members
                WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter')) > 0
          THEN round(COALESCE(p.monthly_lead_target, p.monthly_lead_volume, 0)::numeric /
            (SELECT count(*) FROM public.org_members
             WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter')), 1) END,
        'team_structure', p.team_structure,
        'coverage_gap', CASE
          WHEN p.team_structure = 'setter_closer' AND NOT EXISTS (
            SELECT 1 FROM public.org_members WHERE org_id = p_org_id AND active AND role = 'setter')
            THEN 'You said setters hand off to closers, and no active setter is on this workspace.'
          WHEN p.team_structure IN ('setter_closer', 'closers_only') AND NOT EXISTS (
            SELECT 1 FROM public.org_members WHERE org_id = p_org_id AND active AND role = 'closer')
            THEN 'You said closers run the sales calls, and no active closer is on this workspace.'
          WHEN (SELECT count(*) FROM public.org_members
                WHERE org_id = p_org_id AND active AND role IN ('owner', 'admin', 'closer', 'setter')) = 1
            THEN 'One person can work leads. There is no coverage if they are away.'
          END
      ),
      'applied', '[]'::jsonb
    );
  END IF;

  IF p_stage = 'funnel' THEN
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - created_at_crm)) / 60.0
    )
    INTO v_n, v_median
    FROM public.baseline_leads
    WHERE org_id = p_org_id AND run_id = v_run.id
      AND created_at_crm IS NOT NULL AND first_human_touch_at IS NOT NULL
      AND first_human_touch_at >= created_at_crm;

    RETURN jsonb_build_object(
      'speed_sample_n', v_n,
      'speed_median_minutes', CASE WHEN v_n >= v_min THEN round(v_median, 1) END,
      'speed_too_small', v_n < v_min,
      'intent_minutes', COALESCE(p.speed_to_lead_intent_minutes, sc.speed_to_lead_minutes),
      'sources', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'source', s.source, 'n', s.n, 'declared', public.profile_source_is_declared(p_org_id, s.source)
        ) ORDER BY s.n DESC), '[]'::jsonb)
        FROM (
          SELECT COALESCE(source, 'unattributed') AS source, count(*) AS n
          FROM public.baseline_leads WHERE org_id = p_org_id AND run_id = v_run.id
          GROUP BY 1 ORDER BY 2 DESC LIMIT 12
        ) s
      ),
      'mapped_fields', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('field_name', m.field_name, 'factor', m.factor)
          ORDER BY m.field_name), '[]'::jsonb)
        FROM public.score_field_maps m WHERE m.org_id = p_org_id
      )
    );
  END IF;

  IF p_stage = 'qualification' THEN
    RETURN jsonb_build_object(
      'weights', jsonb_build_object(
        'timeline', sc.timeline_weight, 'investment_capacity', sc.investment_capacity_weight,
        'decision_authority', sc.decision_authority_weight, 'pain_severity', sc.pain_severity_weight
      ),
      'ready_threshold', sc.ready_threshold,
      'scored_leads', (SELECT count(*) FROM public.leads WHERE org_id = p_org_id AND current_score IS NOT NULL),
      'total_leads', (SELECT count(*) FROM public.leads WHERE org_id = p_org_id),
      'ready_today', (
        SELECT count(*) FROM public.leads
        WHERE org_id = p_org_id AND current_score >= sc.ready_threshold
          AND status NOT IN ('closed_won', 'closed_lost')
      ),
      'top_leads', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'score', t.score, 'ready', t.score >= sc.ready_threshold
        ) ORDER BY t.score DESC), '[]'::jsonb)
        FROM (
          SELECT l.id,
            COALESCE(nullif(trim(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''),
              l.email, 'Unnamed lead') AS name,
            l.current_score AS score
          FROM public.leads l
          WHERE l.org_id = p_org_id AND l.current_score IS NOT NULL
          ORDER BY l.current_score DESC LIMIT 5
        ) t
      )
    );
  END IF;

  IF p_stage = 'process' THEN
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - created_at_crm)) / 60.0
    )
    INTO v_n, v_median
    FROM public.baseline_leads
    WHERE org_id = p_org_id AND run_id = v_run.id
      AND created_at_crm IS NOT NULL AND first_human_touch_at IS NOT NULL
      AND first_human_touch_at >= created_at_crm;

    RETURN jsonb_build_object(
      'window_minutes', sc.speed_to_lead_minutes,
      'speed_median_minutes', CASE WHEN v_n >= v_min THEN round(v_median, 1) END,
      'speed_sample_n', v_n,
      'speed_too_small', v_n < v_min,
      'in_alarm_now', (
        SELECT count(*) FROM public.leads
        WHERE org_id = p_org_id AND first_human_touch_at IS NULL
          AND opted_in_at <= now() - make_interval(mins => sc.speed_to_lead_minutes)
          AND status NOT IN ('closed_won', 'closed_lost')
      ),
      'branches', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'branch', rr.branch, 'enabled', rr.enabled, 'channel', rr.channel,
          'sequence_steps', rr.sequence_steps
        ) ORDER BY rr.priority), '[]'::jsonb)
        FROM public.follow_up_routing_rules rr WHERE rr.org_id = p_org_id
      ),
      'setter_establishes', to_jsonb(p.setter_establishes)
    );
  END IF;

  IF p_stage = 'objections' THEN
    RETURN jsonb_build_object(
      'vocabulary', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'type', v.type, 'phrasing', v.phrasing, 'response', v.response
        ) ORDER BY v.rank), '[]'::jsonb)
        FROM public.objection_vocabulary v WHERE v.org_id = p_org_id
      ),
      'extracted_so_far', (SELECT count(*) FROM public.objections WHERE org_id = p_org_id)
    );
  END IF;

  IF p_stage = 'voice' THEN
    RETURN jsonb_build_object(
      'example_count', (
        SELECT COALESCE(jsonb_array_length(vp.examples), 0)
        FROM public.org_voice_profiles vp WHERE vp.org_id = p_org_id
      ),
      'formality', (SELECT vp.formality FROM public.org_voice_profiles vp WHERE vp.org_id = p_org_id),
      'banned_words', (SELECT to_jsonb(vp.banned_words) FROM public.org_voice_profiles vp WHERE vp.org_id = p_org_id),
      'default_channel', (SELECT fs.default_channel FROM public.follow_up_settings fs WHERE fs.org_id = p_org_id),
      'preview_lead', (
        SELECT jsonb_build_object(
          'id', l.id,
          'name', COALESCE(nullif(trim(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''),
            l.email, 'Unnamed lead'),
          'score', l.current_score,
          'status', l.status,
          'source', l.source
        )
        FROM public.leads l
        WHERE l.org_id = p_org_id AND l.status NOT IN ('closed_won', 'closed_lost')
        ORDER BY l.current_score DESC NULLS LAST, l.opted_in_at DESC
        LIMIT 1
      )
    );
  END IF;

  IF p_stage = 'goals' THEN
    RETURN jsonb_build_object(
      'goal_metric', p.goal_metric,
      'goal_value', p.goal_value,
      'aggregate_opt_out', p.aggregate_opt_out,
      'completeness', public.business_profile_completeness(p_org_id),
      'latest_leak_report', (
        SELECT jsonb_build_object('id', lr.id, 'basis', lr.basis, 'generated_at', lr.generated_at)
        FROM public.leak_reports lr WHERE lr.org_id = p_org_id
        ORDER BY lr.generated_at DESC LIMIT 1
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.leak_report_latest(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.leak_reports%ROWTYPE;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO v_row FROM public.leak_reports
  WHERE org_id = p_org_id ORDER BY generated_at DESC LIMIT 1;
  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'basis', v_row.basis,
    'generated_at', v_row.generated_at,
    'profile_version', v_row.profile_version,
    'payload', v_row.payload,
    'history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', h.id, 'generated_at', h.generated_at, 'basis', h.basis
      ) ORDER BY h.generated_at DESC), '[]'::jsonb)
      FROM public.leak_reports h WHERE h.org_id = p_org_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS. The profile follows the revenue rule: owner and admin only. Setters and
-- closers work leads; they do not read or write how the business sells.
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profile_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_field_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_review_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objection_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_benchmark_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_priors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leak_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_fallback_declines ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_profiles_select
  ON public.business_profiles FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY business_profile_versions_select
  ON public.business_profile_versions FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY business_profile_stages_select
  ON public.business_profile_stages FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY profile_review_prompts_select
  ON public.profile_review_prompts FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY profile_contradictions_select
  ON public.profile_contradictions FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY objection_vocabulary_select
  ON public.objection_vocabulary FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY org_benchmark_metrics_select
  ON public.org_benchmark_metrics FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY leak_reports_select
  ON public.leak_reports FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY activation_records_select
  ON public.activation_records FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY activation_changes_select
  ON public.activation_changes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY baseline_fallback_declines_select
  ON public.baseline_fallback_declines FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

-- The registry is the same list of fields for every workspace and holds no
-- client data, so every signed-in user may read it.
CREATE POLICY profile_field_registry_select
  ON public.profile_field_registry FOR SELECT TO authenticated
  USING (true);

-- Aggregates carry no org id and are never written below the minimum cohort
-- size, so a read cannot be traced back to a business.
CREATE POLICY benchmark_cohorts_select
  ON public.benchmark_cohorts FOR SELECT TO authenticated
  USING (true);
CREATE POLICY configuration_priors_select
  ON public.configuration_priors FOR SELECT TO authenticated
  USING (true);

-- Every write goes through a SECURITY DEFINER function so the actor, the
-- version row and the gate checks cannot be bypassed by a direct table write.

GRANT SELECT ON
  public.business_profiles,
  public.business_profile_versions,
  public.business_profile_stages,
  public.profile_field_registry,
  public.profile_review_prompts,
  public.profile_contradictions,
  public.objection_vocabulary,
  public.org_benchmark_metrics,
  public.benchmark_cohorts,
  public.configuration_priors,
  public.leak_reports,
  public.activation_records,
  public.activation_changes,
  public.baseline_fallback_declines
TO authenticated;

GRANT ALL ON
  public.business_profiles,
  public.business_profile_versions,
  public.business_profile_stages,
  public.profile_field_registry,
  public.profile_review_prompts,
  public.profile_contradictions,
  public.objection_vocabulary,
  public.org_benchmark_metrics,
  public.benchmark_cohorts,
  public.configuration_priors,
  public.leak_reports,
  public.activation_records,
  public.activation_changes,
  public.baseline_fallback_declines
TO service_role;

REVOKE ALL ON FUNCTION public.provision_business_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_profiles_record_version() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_require_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_profile_completeness(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_profile_refresh_completeness(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_profile_defaults(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_profile_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_business_profile(uuid, uuid, jsonb, public.profile_stage) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_business_profile_stage(uuid, uuid, public.profile_stage) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_business_profile_configuration(uuid, uuid, public.profile_stage) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboarding_payoff(uuid, public.profile_stage) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.benchmark_refresh_org_metrics(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.benchmark_refresh_cohorts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.benchmark_for_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configuration_priors_for_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_pattern_feedback(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leak_report_compute(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leak_report_generate(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leak_report_latest(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activation_readiness(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_org(uuid, uuid, public.activation_warning[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_activation_timestamp(uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_baseline_fallback(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_detect_signals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_profile_review_prompt(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_profile_contradiction(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adoption_watch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_value_answered(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_price_band(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_volume_band(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_cohort_key(public.profile_offer_type, bigint, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_signal_factor(public.profile_qualification_signal) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_channel_aliases(public.profile_lead_channel) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_source_is_declared(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.benchmark_min_cohort() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_completeness_min() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.profile_require_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_profile_completeness(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_profile_refresh_completeness(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_profile_defaults(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_profile_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_business_profile(uuid, uuid, jsonb, public.profile_stage) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_business_profile_stage(uuid, uuid, public.profile_stage) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_business_profile_configuration(uuid, uuid, public.profile_stage) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.onboarding_payoff(uuid, public.profile_stage) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.benchmark_refresh_org_metrics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.benchmark_refresh_cohorts() TO service_role;
GRANT EXECUTE ON FUNCTION public.benchmark_for_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configuration_priors_for_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_pattern_feedback(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leak_report_compute(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leak_report_generate(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leak_report_latest(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activation_readiness(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_org(uuid, uuid, public.activation_warning[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_activation_timestamp(uuid, uuid, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_baseline_fallback(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_detect_signals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_profile_review_prompt(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_profile_contradiction(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adoption_watch(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_value_answered(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_price_band(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_volume_band(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_cohort_key(public.profile_offer_type, bigint, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_signal_factor(public.profile_qualification_signal) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_channel_aliases(public.profile_lead_channel) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_source_is_declared(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.benchmark_min_cohort() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_completeness_min() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- No profile field without a named consumer. This runs at migration time, so
-- adding a column and forgetting the registry row fails the deploy rather
-- than shipping a question nothing reads.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_orphans text;
BEGIN
  SELECT string_agg(c.column_name, ', ') INTO v_orphans
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'business_profiles'
    AND c.column_name NOT IN (
      'org_id', 'version', 'completeness_score', 'last_reviewed_at',
      'last_reviewed_by_member_id', 'created_at', 'updated_at', 'aggregate_opt_out_at'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_field_registry r WHERE r.field = c.column_name
    );
  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION 'business_profiles columns with no named consumer: %', v_orphans;
  END IF;

  SELECT string_agg(r.field, ', ') INTO v_orphans
  FROM public.profile_field_registry r
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'business_profiles'
      AND c.column_name = r.field
  );
  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION 'profile_field_registry names fields that do not exist: %', v_orphans;
  END IF;
END
$$;
