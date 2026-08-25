-- Prompt 16: calibration and continuous improvement.
-- Product choices (stated, not guessed):
--   * Holdout default 5%, range 0–20 inclusive. 0 disables it. Applied at
--     INSERT time by a BEFORE trigger so every intake path is covered, before
--     scoring and queue ranking. Selection is random(). Authenticated and
--     service-role inserts cannot choose holdout membership. Tests running as
--     postgres (or with vistrial.allow_holdout_override=1) may set it.
--   * Holdout leads are ranked as ready_track so they are worked. The queue
--     view does not expose is_holdout; there is no badge, filter, or copy.
--   * Close = a revenue_log row (same as Prompt 11). Lost = closed_lost with
--     no revenue. Unresolved leads, including ghosts, are not failed leads.
--   * Mature = opted_in_at is at least sales_cycle_days old, and the org is
--     activated. is_test leads are excluded.
--   * Bands are 0–19 / 20–39 / 40–59 / 60–79 / 80–100. Display minimum is
--     reporting_diag_min() (20). Six leads is treated as noise.
--   * Suggestions never write score_configs. apply_calibration_suggestion is
--     the only path, owner/admin, versioned, score history untouched.
--   * Weight moves are 5 points, and only when the holdout factor-delta gap is
--     at least 8 points on a sample of 20+.
--   * Sample audit: 5 random extractions per org per job, grounded against
--     the source transcript. Correction rate is per field, never aggregated.

-- ---------------------------------------------------------------------------
-- Holdout
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN holdout_percent numeric(5,2) NOT NULL DEFAULT 5;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_holdout_percent_range
    CHECK (holdout_percent >= 0 AND holdout_percent <= 20);

COMMENT ON COLUMN public.organizations.holdout_percent IS
  'Percent of new leads worked regardless of score, assigned at intake. 0 disables the holdout and withholds weight suggestions.';

ALTER TABLE public.leads
  ADD COLUMN is_holdout boolean,
  ADD COLUMN holdout_assigned_at timestamptz;

UPDATE public.leads SET is_holdout = false WHERE is_holdout IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN is_holdout SET NOT NULL,
  ADD CONSTRAINT leads_holdout_stamped CHECK (
    is_holdout = false OR holdout_assigned_at IS NOT NULL
  );

COMMENT ON COLUMN public.leads.is_holdout IS
  'Set once at insert. True means this lead was drawn into the random sample that is worked regardless of score. Never shown on the queue.';

CREATE OR REPLACE FUNCTION public.assign_lead_holdout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pct numeric;
  v_allow boolean;
BEGIN
  -- Table-level INSERT grants ignore column REVOKEs. Callers other than the
  -- test superuser must not choose holdout membership.
  v_allow := current_setting('vistrial.allow_holdout_override', true) = '1'
    OR current_user IN ('postgres', 'supabase_admin');
  IF NOT v_allow THEN
    NEW.is_holdout := NULL;
    NEW.holdout_assigned_at := NULL;
  END IF;

  IF NEW.is_holdout IS NOT NULL THEN
    IF NEW.is_holdout AND NEW.holdout_assigned_at IS NULL THEN
      NEW.holdout_assigned_at := clock_timestamp();
    END IF;
    IF NOT NEW.is_holdout THEN
      NEW.holdout_assigned_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  SELECT holdout_percent INTO v_pct
  FROM public.organizations
  WHERE id = NEW.org_id;

  IF v_pct IS NULL OR v_pct <= 0 THEN
    NEW.is_holdout := false;
    NEW.holdout_assigned_at := NULL;
    RETURN NEW;
  END IF;

  NEW.is_holdout := (random() < (v_pct / 100.0));
  IF NEW.is_holdout THEN
    NEW.holdout_assigned_at := clock_timestamp();
  ELSE
    NEW.holdout_assigned_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_assign_holdout
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_lead_holdout();

CREATE OR REPLACE FUNCTION public.protect_lead_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid;
BEGIN
  IF current_setting('vistrial.allow_score_cache', true) IS DISTINCT FROM '1' THEN
    IF NEW.current_score IS DISTINCT FROM OLD.current_score
      OR NEW.lead_type IS DISTINCT FROM OLD.lead_type THEN
      RAISE EXCEPTION 'leads.current_score and lead_type are trigger-maintained';
    END IF;
  END IF;

  IF current_setting('vistrial.allow_touch_times', true) IS DISTINCT FROM '1' THEN
    IF NEW.first_human_touch_at IS DISTINCT FROM OLD.first_human_touch_at
      OR NEW.last_touch_at IS DISTINCT FROM OLD.last_touch_at THEN
      RAISE EXCEPTION 'leads touch timestamps are trigger-maintained';
    END IF;
  END IF;

  IF NEW.is_holdout IS DISTINCT FROM OLD.is_holdout
    OR NEW.holdout_assigned_at IS DISTINCT FROM OLD.holdout_assigned_at THEN
    RAISE EXCEPTION 'leads.is_holdout is set at intake and cannot change';
  END IF;

  IF NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id
    OR NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id THEN
    IF auth.uid() IS NOT NULL
      AND NOT public.user_has_org_role(NEW.org_id, 'owner', 'admin') THEN
      v_self := public.user_member_id(NEW.org_id);
      IF v_self IS NULL THEN
        RAISE EXCEPTION 'not authorized to reassign leads';
      END IF;
      IF NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id
        AND NEW.assigned_setter_id IS DISTINCT FROM v_self THEN
        RAISE EXCEPTION 'not authorized to reassign leads';
      END IF;
      IF NEW.assigned_closer_id IS DISTINCT FROM OLD.assigned_closer_id
        AND NEW.assigned_closer_id IS DISTINCT FROM v_self THEN
        RAISE EXCEPTION 'not authorized to reassign leads';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold integer;
  v_holdout boolean;
BEGIN
  SELECT ready_threshold INTO v_threshold
  FROM public.score_configs
  WHERE org_id = NEW.org_id;

  SELECT is_holdout INTO v_holdout
  FROM public.leads
  WHERE id = NEW.lead_id AND org_id = NEW.org_id;

  PERFORM set_config('vistrial.allow_score_cache', '1', true);

  UPDATE public.leads
  SET
    current_score = NEW.total,
    lead_type = CASE
      WHEN COALESCE(v_holdout, false) THEN 'ready_track'::public.lead_type
      WHEN v_threshold IS NOT NULL AND NEW.total >= v_threshold
        THEN 'ready_track'::public.lead_type
      ELSE 'nurture_track'::public.lead_type
    END
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

-- Table-level INSERT on leads still exists from the spine migration.
-- Column REVOKEs do not override that, so replace it with a column list
-- that never includes holdout or the trigger-maintained cache columns.
REVOKE INSERT ON public.leads FROM authenticated;
GRANT INSERT (
  id,
  org_id,
  ghl_contact_id,
  ghl_opportunity_id,
  first_name,
  last_name,
  email,
  phone,
  source,
  campaign,
  ad_id,
  offer_name,
  application_answers,
  status,
  pipeline_stage,
  assigned_setter_id,
  assigned_closer_id,
  opted_in_at,
  ghost_approaching_at,
  created_at,
  updated_at,
  timezone,
  is_test
) ON public.leads TO authenticated;
REVOKE INSERT (is_holdout, holdout_assigned_at) ON public.leads FROM authenticated;
REVOKE UPDATE (is_holdout, holdout_assigned_at) ON public.leads FROM authenticated;

-- ---------------------------------------------------------------------------
-- Score config versions (Prompt 5 versioning, now a real table)
-- ---------------------------------------------------------------------------

CREATE TYPE public.score_config_source AS ENUM ('settings', 'calibration_apply', 'system');

CREATE TABLE public.score_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  timeline_weight integer NOT NULL,
  investment_capacity_weight integer NOT NULL,
  decision_authority_weight integer NOT NULL,
  pain_severity_weight integer NOT NULL,
  ready_threshold integer NOT NULL,
  speed_to_lead_minutes integer NOT NULL,
  ghost_days_soft integer NOT NULL,
  ghost_days_hard integer NOT NULL,
  source public.score_config_source NOT NULL DEFAULT 'settings',
  suggestion_id uuid,
  changed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.score_config_versions IS
  'Append-only snapshots of scoring config. Applying a calibration suggestion writes a row here and does not rewrite readiness_scores.';

CREATE INDEX score_config_versions_org_created_idx
  ON public.score_config_versions (org_id, created_at DESC);

ALTER TABLE public.score_config_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY score_config_versions_select
  ON public.score_config_versions FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE TRIGGER score_config_versions_forbid_update
  BEFORE UPDATE ON public.score_config_versions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE TRIGGER score_config_versions_forbid_delete
  BEFORE DELETE ON public.score_config_versions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

GRANT SELECT ON public.score_config_versions TO authenticated;
GRANT ALL ON public.score_config_versions TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_score_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_source public.score_config_source;
  v_suggestion uuid;
BEGIN
  v_actor := NULLIF(current_setting('vistrial.actor_member_id', true), '')::uuid;
  v_source := COALESCE(
    NULLIF(current_setting('vistrial.score_config_source', true), '')::public.score_config_source,
    CASE WHEN TG_OP = 'INSERT' THEN 'system'::public.score_config_source ELSE 'settings'::public.score_config_source END
  );
  v_suggestion := NULLIF(current_setting('vistrial.score_suggestion_id', true), '')::uuid;

  INSERT INTO public.score_config_versions (
    org_id, timeline_weight, investment_capacity_weight, decision_authority_weight,
    pain_severity_weight, ready_threshold, speed_to_lead_minutes, ghost_days_soft,
    ghost_days_hard, source, suggestion_id, changed_by_member_id
  ) VALUES (
    NEW.org_id, NEW.timeline_weight, NEW.investment_capacity_weight, NEW.decision_authority_weight,
    NEW.pain_severity_weight, NEW.ready_threshold, NEW.speed_to_lead_minutes, NEW.ghost_days_soft,
    NEW.ghost_days_hard, v_source, v_suggestion, v_actor
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER score_configs_snapshot
  AFTER INSERT OR UPDATE ON public.score_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_score_config();

INSERT INTO public.score_config_versions (
  org_id, timeline_weight, investment_capacity_weight, decision_authority_weight,
  pain_severity_weight, ready_threshold, speed_to_lead_minutes, ghost_days_soft,
  ghost_days_hard, source
)
SELECT
  org_id, timeline_weight, investment_capacity_weight, decision_authority_weight,
  pain_severity_weight, ready_threshold, speed_to_lead_minutes, ghost_days_soft,
  ghost_days_hard, 'system'
FROM public.score_configs;

-- ---------------------------------------------------------------------------
-- Suggestions, audits, cross-client aggregates
-- ---------------------------------------------------------------------------

CREATE TYPE public.calibration_suggestion_kind AS ENUM (
  'weights',
  'threshold',
  'draft_branch'
);

CREATE TYPE public.calibration_suggestion_status AS ENUM (
  'pending',
  'applied',
  'dismissed',
  'withheld',
  'superseded'
);

CREATE TABLE public.calibration_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind public.calibration_suggestion_kind NOT NULL,
  status public.calibration_suggestion_status NOT NULL DEFAULT 'pending',
  sample_n integer NOT NULL,
  evidence_sentence text NOT NULL,
  withheld_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz,
  applied_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  dismissed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  CONSTRAINT calibration_suggestions_sample_nonneg CHECK (sample_n >= 0),
  CONSTRAINT calibration_suggestions_withheld_reason CHECK (
    status <> 'withheld' OR withheld_reason IS NOT NULL
  )
);

COMMENT ON TABLE public.calibration_suggestions IS
  'Human-applied only. The refresh job may insert withheld or pending rows; it never writes score_configs.';

CREATE INDEX calibration_suggestions_org_status_idx
  ON public.calibration_suggestions (org_id, status, created_at DESC);

CREATE UNIQUE INDEX calibration_suggestions_one_pending
  ON public.calibration_suggestions (org_id, kind)
  WHERE status = 'pending';

ALTER TABLE public.calibration_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY calibration_suggestions_select
  ON public.calibration_suggestions FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT ON public.calibration_suggestions TO authenticated;
GRANT ALL ON public.calibration_suggestions TO service_role;

ALTER TABLE public.score_config_versions
  ADD CONSTRAINT score_config_versions_suggestion_fkey
  FOREIGN KEY (suggestion_id) REFERENCES public.calibration_suggestions (id) ON DELETE SET NULL;

CREATE TABLE public.extraction_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  extraction_id uuid NOT NULL,
  call_id uuid NOT NULL,
  field_name text NOT NULL,
  extracted_value text,
  grounded boolean NOT NULL,
  model_version text,
  sampled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT extraction_audits_extraction_org_fkey
    FOREIGN KEY (extraction_id, org_id)
    REFERENCES public.call_extractions (id, org_id) ON DELETE CASCADE,
  CONSTRAINT extraction_audits_call_org_fkey
    FOREIGN KEY (call_id, org_id)
    REFERENCES public.calls (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.extraction_audits IS
  'Random sample of extractions checked against the source transcript. Grounded means the extracted text appears in the transcript. Catches errors nobody corrected.';

CREATE INDEX extraction_audits_org_field_idx
  ON public.extraction_audits (org_id, field_name, sampled_at DESC);

ALTER TABLE public.extraction_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_audits_select
  ON public.extraction_audits FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE TRIGGER extraction_audits_forbid_update
  BEFORE UPDATE ON public.extraction_audits
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE TRIGGER extraction_audits_forbid_delete
  BEFORE DELETE ON public.extraction_audits
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

GRANT SELECT ON public.extraction_audits TO authenticated;
GRANT ALL ON public.extraction_audits TO service_role;

CREATE TABLE public.calibration_benchmarks (
  cohort_key text NOT NULL,
  metric text NOT NULL,
  offer_type public.profile_offer_type,
  price_band text,
  org_count integer NOT NULL,
  median_value numeric NOT NULL,
  sample_n integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_key, metric),
  CONSTRAINT calibration_benchmarks_min_orgs CHECK (org_count >= 5),
  CONSTRAINT calibration_benchmarks_min_n CHECK (sample_n >= 20)
);

COMMENT ON TABLE public.calibration_benchmarks IS
  'Aggregate calibration figures across similar businesses. No org_id. Rows below the cohort minimum are never written.';

ALTER TABLE public.calibration_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY calibration_benchmarks_select
  ON public.calibration_benchmarks FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.calibration_benchmarks TO authenticated;
GRANT ALL ON public.calibration_benchmarks TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calibration_score_band(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score IS NULL THEN NULL
    WHEN p_score < 20 THEN '0-19'
    WHEN p_score < 40 THEN '20-39'
    WHEN p_score < 60 THEN '40-59'
    WHEN p_score < 80 THEN '60-79'
    ELSE '80-100'
  END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_band_lo(p_key text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_key
    WHEN '0-19' THEN 0
    WHEN '20-39' THEN 20
    WHEN '40-59' THEN 40
    WHEN '60-79' THEN 60
    WHEN '80-100' THEN 80
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_recompute_total(
  p_timeline integer,
  p_investment integer,
  p_authority integer,
  p_pain integer,
  p_w_timeline integer,
  p_w_investment integer,
  p_w_authority integer,
  p_w_pain integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sum numeric := 0;
  v_wsum numeric := 0;
BEGIN
  IF p_timeline IS NOT NULL THEN
    v_sum := v_sum + p_timeline * p_w_timeline;
    v_wsum := v_wsum + p_w_timeline;
  END IF;
  IF p_investment IS NOT NULL THEN
    v_sum := v_sum + p_investment * p_w_investment;
    v_wsum := v_wsum + p_w_investment;
  END IF;
  IF p_authority IS NOT NULL THEN
    v_sum := v_sum + p_authority * p_w_authority;
    v_wsum := v_wsum + p_w_authority;
  END IF;
  IF p_pain IS NOT NULL THEN
    v_sum := v_sum + p_pain * p_w_pain;
    v_wsum := v_wsum + p_w_pain;
  END IF;
  IF v_wsum <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN GREATEST(0, LEAST(100, round(v_sum / v_wsum)::integer));
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_mature_resolved(p_org_id uuid)
RETURNS TABLE (
  lead_id uuid,
  is_holdout boolean,
  score integer,
  timeline integer,
  investment_capacity integer,
  decision_authority integer,
  pain_severity integer,
  closed boolean,
  opted_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.is_holdout,
    COALESCE(s.total, l.current_score) AS score,
    s.timeline_raw,
    s.investment_capacity_raw,
    s.decision_authority_raw,
    s.pain_severity_raw,
    EXISTS (
      SELECT 1 FROM public.revenue_log r
      WHERE r.lead_id = l.id AND r.org_id = l.org_id
    ) AS closed,
    l.opted_in_at
  FROM public.leads l
  JOIN public.organizations o ON o.id = l.org_id
  LEFT JOIN LATERAL (
    SELECT
      rs.timeline_raw,
      rs.investment_capacity_raw,
      rs.decision_authority_raw,
      rs.pain_severity_raw,
      rs.total
    FROM public.readiness_scores rs
    WHERE rs.lead_id = l.id AND rs.org_id = l.org_id
    ORDER BY
      CASE WHEN rs.triggered_by = 'intake' THEN 0 ELSE 1 END,
      rs.created_at ASC,
      rs.id ASC
    LIMIT 1
  ) s ON true
  WHERE l.org_id = p_org_id
    AND NOT l.is_test
    AND o.activated_at IS NOT NULL
    AND l.opted_in_at <= now() - make_interval(days => o.sales_cycle_days)
    AND (
      EXISTS (
        SELECT 1 FROM public.revenue_log r
        WHERE r.lead_id = l.id AND r.org_id = l.org_id
      )
      OR l.status = 'closed_lost'
    );
$$;

CREATE OR REPLACE FUNCTION public.calibration_holdout_state(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct numeric;
  v_n integer;
  v_min integer := public.reporting_diag_min();
  v_enabled boolean;
BEGIN
  SELECT holdout_percent INTO v_pct FROM public.organizations WHERE id = p_org_id;
  v_enabled := COALESCE(v_pct, 0) > 0;
  SELECT count(*)::integer INTO v_n
  FROM public.calibration_mature_resolved(p_org_id) r
  WHERE r.is_holdout AND r.score IS NOT NULL;
  RETURN jsonb_build_object(
    'percent', COALESCE(v_pct, 0),
    'enabled', v_enabled,
    'mature_resolved_n', COALESCE(v_n, 0),
    'min_n', v_min,
    'too_small', (NOT v_enabled) OR COALESCE(v_n, 0) < v_min,
    'plain', CASE
      WHEN NOT v_enabled THEN
        'The random sample is off. Close rates by score will look tidy because low-scoring leads are called last. Weight suggestions are withheld until the sample is on and large enough.'
      WHEN COALESCE(v_n, 0) < v_min THEN
        'The random sample is on, but only '
        || COALESCE(v_n, 0)::text
        || ' resolved holdout leads have aged through the sales cycle. That is below '
        || v_min::text
        || ', so the holdout curve is not shown as validation and weight suggestions are withheld.'
      ELSE
        'A small random share of new leads is worked regardless of score so we can check whether the score matches who actually closes, instead of only checking the leads the score already pushed to the front.'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_band_curve(p_org_id uuid, p_holdout_only boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_rows jsonb;
  v_shown jsonb;
  v_breaks jsonb := '[]'::jsonb;
  v_prev_key text;
  v_prev_rate numeric;
  rec record;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.lo), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      x.band_key,
      public.calibration_band_lo(x.band_key) AS lo,
      x.n,
      x.closed_n,
      public.reporting_rate(x.closed_n, x.n, v_min, false) AS close_rate
    FROM (
      SELECT
        b.band_key,
        count(r.lead_id)::bigint AS n,
        count(r.lead_id) FILTER (WHERE r.closed)::bigint AS closed_n
      FROM (
        SELECT unnest(ARRAY['0-19', '20-39', '40-59', '60-79', '80-100']) AS band_key
      ) b
      LEFT JOIN public.calibration_mature_resolved(p_org_id) r
        ON r.score IS NOT NULL
        AND public.calibration_score_band(r.score) = b.band_key
        AND (NOT p_holdout_only OR r.is_holdout)
      GROUP BY b.band_key
    ) x
  ) b;

  v_shown := '[]'::jsonb;
  FOR rec IN
    SELECT
      (elem ->> 'band_key') AS band_key,
      (elem -> 'close_rate' ->> 'pct')::numeric AS pct,
      COALESCE((elem -> 'close_rate' ->> 'too_small')::boolean, true) AS too_small
    FROM jsonb_array_elements(v_rows) elem
    ORDER BY public.calibration_band_lo(elem ->> 'band_key')
  LOOP
    IF rec.too_small OR rec.pct IS NULL THEN
      CONTINUE;
    END IF;
    IF v_prev_key IS NOT NULL THEN
      IF rec.pct < v_prev_rate THEN
        v_breaks := v_breaks || jsonb_build_array(jsonb_build_object(
          'kind', 'reversal',
          'from_key', v_prev_key,
          'to_key', rec.band_key,
          'from_rate', v_prev_rate,
          'to_rate', rec.pct,
          'plain', 'Close rate falls from '
            || v_prev_key || ' to ' || rec.band_key
            || '. Higher scores in that range did not close more often.'
        ));
      ELSIF rec.pct = v_prev_rate THEN
        v_breaks := v_breaks || jsonb_build_array(jsonb_build_object(
          'kind', 'flat',
          'from_key', v_prev_key,
          'to_key', rec.band_key,
          'rate', rec.pct,
          'plain', 'Close rate is flat from '
            || v_prev_key || ' to ' || rec.band_key
            || '. The score is not discriminating in the range where most leads sit.'
        ));
      END IF;
    END IF;
    v_shown := v_shown || jsonb_build_array(jsonb_build_object(
      'key', rec.band_key, 'pct', rec.pct
    ));
    v_prev_key := rec.band_key;
    v_prev_rate := rec.pct;
  END LOOP;

  RETURN jsonb_build_object(
    'holdout_only', p_holdout_only,
    'min_n', v_min,
    'rows', v_rows,
    'shown_count', jsonb_array_length(v_shown),
    'monotonic', jsonb_array_length(v_shown) >= 2 AND jsonb_array_length(v_breaks) = 0,
    'breaks', v_breaks
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_factor_validity(p_org_id uuid, p_holdout_only boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_rows jsonb := '[]'::jsonb;
  v_factor text;
  v_col text;
BEGIN
  FOREACH v_factor IN ARRAY ARRAY[
    'timeline',
    'investment_capacity',
    'decision_authority',
    'pain_severity'
  ]
  LOOP
    v_col := CASE v_factor
      WHEN 'timeline' THEN 'timeline'
      WHEN 'investment_capacity' THEN 'investment_capacity'
      WHEN 'decision_authority' THEN 'decision_authority'
      ELSE 'pain_severity'
    END;
    v_rows := v_rows || jsonb_build_array((
      SELECT jsonb_build_object(
        'factor', v_factor,
        'n', s.n,
        'n_closed', s.n_closed,
        'n_lost', s.n_lost,
        'too_small', s.n_closed < v_min OR s.n_lost < v_min,
        'avg_closed', CASE WHEN s.n_closed < v_min THEN NULL ELSE trunc((s.sum_closed / s.n_closed) * 10) / 10 END,
        'avg_lost', CASE WHEN s.n_lost < v_min THEN NULL ELSE trunc((s.sum_lost / s.n_lost) * 10) / 10 END,
        'delta', CASE
          WHEN s.n_closed < v_min OR s.n_lost < v_min THEN NULL
          ELSE trunc(((s.sum_closed / s.n_closed) - (s.sum_lost / s.n_lost)) * 10) / 10
        END,
        'high', public.reporting_rate(s.high_closed, s.high_n, v_min, false),
        'low', public.reporting_rate(s.low_closed, s.low_n, v_min, false),
        'plain', CASE
          WHEN s.n_closed < v_min OR s.n_lost < v_min THEN
            'Need at least '
            || v_min::text
            || ' closed and '
            || v_min::text
            || ' lost leads with a known '
            || replace(v_factor, '_', ' ')
            || ' reading. A gap from one side of six is noise.'
          WHEN ((s.sum_closed / s.n_closed) - (s.sum_lost / s.n_lost)) >= 8 THEN
            replace(v_factor, '_', ' ')
            || ' is higher on closed leads than on lost leads. That is association, not proof it causes closes. Weight spent here is earning its place.'
          WHEN abs((s.sum_closed / s.n_closed) - (s.sum_lost / s.n_lost)) < 8 THEN
            replace(v_factor, '_', ' ')
            || ' barely differs between closed and lost leads. Weight spent here is not separating outcomes in this business.'
          ELSE
            replace(v_factor, '_', ' ')
            || ' is lower on closed leads than on lost leads. The current weight is pointing the wrong way relative to outcomes.'
        END
      )
      FROM (
        SELECT
          count(*)::integer AS n,
          count(*) FILTER (WHERE r.closed)::numeric AS n_closed,
          count(*) FILTER (WHERE NOT r.closed)::numeric AS n_lost,
          COALESCE(sum(v.val) FILTER (WHERE r.closed), 0) AS sum_closed,
          COALESCE(sum(v.val) FILTER (WHERE NOT r.closed), 0) AS sum_lost,
          count(*) FILTER (WHERE v.val >= 70)::bigint AS high_n,
          count(*) FILTER (WHERE v.val >= 70 AND r.closed)::bigint AS high_closed,
          count(*) FILTER (WHERE v.val < 40)::bigint AS low_n,
          count(*) FILTER (WHERE v.val < 40 AND r.closed)::bigint AS low_closed
        FROM public.calibration_mature_resolved(p_org_id) r
        CROSS JOIN LATERAL (
          SELECT CASE v_col
            WHEN 'timeline' THEN r.timeline
            WHEN 'investment_capacity' THEN r.investment_capacity
            WHEN 'decision_authority' THEN r.decision_authority
            ELSE r.pain_severity
          END AS val
        ) v
        WHERE v.val IS NOT NULL
          AND (NOT p_holdout_only OR r.is_holdout)
      ) s
    ));
  END LOOP;
  RETURN jsonb_build_object('holdout_only', p_holdout_only, 'min_n', v_min, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_threshold_placement(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_curve jsonb;
  v_best jsonb;
  rec record;
  v_prev_key text;
  v_prev_pct numeric;
  v_jump numeric;
  v_shown integer;
BEGIN
  SELECT ready_threshold INTO v_current FROM public.score_configs WHERE org_id = p_org_id;
  -- Never place a threshold against the all-leads curve. That curve is biased.
  v_curve := public.calibration_band_curve(p_org_id, true);
  v_shown := COALESCE((v_curve ->> 'shown_count')::integer, 0);

  FOR rec IN
    SELECT
      elem ->> 'band_key' AS band_key,
      (elem -> 'close_rate' ->> 'pct')::numeric AS pct,
      COALESCE((elem -> 'close_rate' ->> 'too_small')::boolean, true) AS too_small
    FROM jsonb_array_elements(v_curve -> 'rows') elem
    ORDER BY public.calibration_band_lo(elem ->> 'band_key')
  LOOP
    IF rec.too_small OR rec.pct IS NULL THEN
      CONTINUE;
    END IF;
    IF v_prev_key IS NOT NULL THEN
      v_jump := rec.pct - v_prev_pct;
      IF v_jump > 0 AND (v_best IS NULL OR v_jump > (v_best ->> 'jump')::numeric) THEN
        v_best := jsonb_build_object(
          'from_key', v_prev_key,
          'to_key', rec.band_key,
          'jump', v_jump,
          'suggested_threshold', public.calibration_band_lo(rec.band_key)
        );
      END IF;
    END IF;
    v_prev_key := rec.band_key;
    v_prev_pct := rec.pct;
  END LOOP;

  RETURN jsonb_build_object(
    'current', v_current,
    'steepest', v_best,
    'source', 'holdout',
    'consequence', CASE
      WHEN v_shown < 2 THEN
        'Not enough holdout bands above the sample floor to place a ready line against the close-rate curve. The all-leads curve is not used for this.'
      WHEN v_best IS NULL THEN
        'The holdout curve does not step up. There is no steepest improvement to place a ready line against.'
      WHEN (v_best ->> 'suggested_threshold')::integer = v_current THEN
        'The ready line already sits at the steepest step-up on the holdout curve.'
      WHEN (v_best ->> 'suggested_threshold')::integer < v_current THEN
        'Moving the ready line down to '
        || (v_best ->> 'suggested_threshold')
        || ' would put more of today''s queue on the ready track. That is more calls today, not a promise of more closes.'
      ELSE
        'Moving the ready line up to '
        || (v_best ->> 'suggested_threshold')
        || ' would take some of today''s ready-track leads off that track. That is fewer calls today, not a promise of better closes.'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_score_config_change(
  p_org_id uuid,
  p_timeline integer,
  p_investment integer,
  p_authority integer,
  p_pain integer,
  p_threshold integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur public.score_configs%ROWTYPE;
  v_cross jsonb := '[]'::jsonb;
  v_position jsonb := '[]'::jsonb;
  v_open integer := 0;
  rec record;
  v_new integer;
  v_old_ready boolean;
  v_new_ready boolean;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  IF p_timeline + p_investment + p_authority + p_pain <> 100 THEN
    RAISE EXCEPTION 'weights must add to 100';
  END IF;
  IF p_threshold < 0 OR p_threshold > 100 THEN
    RAISE EXCEPTION 'threshold out of range';
  END IF;
  SELECT * INTO v_cur FROM public.score_configs WHERE org_id = p_org_id;

  FOR rec IN
    SELECT
      l.id,
      COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), NULLIF(btrim(l.email), ''), 'Unnamed lead') AS name,
      l.current_score,
      l.lead_type,
      l.is_holdout,
      s.timeline_raw,
      s.investment_capacity_raw,
      s.decision_authority_raw,
      s.pain_severity_raw
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw
      FROM public.readiness_scores rs
      WHERE rs.lead_id = l.id AND rs.org_id = l.org_id
      ORDER BY rs.created_at DESC, rs.id DESC
      LIMIT 1
    ) s ON true
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.status NOT IN ('closed_won', 'closed_lost', 'ghost')
    ORDER BY l.opted_in_at DESC
  LOOP
    v_open := v_open + 1;
    v_new := public.calibration_recompute_total(
      rec.timeline_raw, rec.investment_capacity_raw, rec.decision_authority_raw, rec.pain_severity_raw,
      p_timeline, p_investment, p_authority, p_pain
    );
    v_old_ready := COALESCE(rec.is_holdout, false)
      OR rec.lead_type = 'ready_track'
      OR (rec.current_score IS NOT NULL AND rec.current_score >= v_cur.ready_threshold);
    v_new_ready := COALESCE(rec.is_holdout, false)
      OR (v_new IS NOT NULL AND v_new >= p_threshold);
    IF v_old_ready IS DISTINCT FROM v_new_ready THEN
      v_cross := v_cross || jsonb_build_array(jsonb_build_object(
        'lead_id', rec.id,
        'name', rec.name,
        'current_score', rec.current_score,
        'proposed_score', v_new,
        'direction', CASE WHEN v_new_ready THEN 'onto_ready' ELSE 'off_ready' END
      ));
    ELSIF v_new IS NOT NULL AND rec.current_score IS NOT NULL AND v_new <> rec.current_score THEN
      v_position := v_position || jsonb_build_array(jsonb_build_object(
        'lead_id', rec.id,
        'name', rec.name,
        'current_score', rec.current_score,
        'proposed_score', v_new
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'open_leads', v_open,
    'threshold_moves', v_cross,
    'threshold_move_count', jsonb_array_length(v_cross),
    'score_moves', v_position,
    'score_move_count', jsonb_array_length(v_position),
    'plain',
      (jsonb_array_length(v_cross))::text
      || ' open leads would move across the ready line. '
      || (jsonb_array_length(v_position))::text
      || ' would change score without crossing it. Existing score history is not rewritten.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_extraction_report(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_extract_n bigint;
  v_fields jsonb;
  v_models jsonb;
  v_unmatched_n bigint;
  v_matched_n bigint;
  v_unmatched_by jsonb;
  v_fail jsonb;
  v_audit jsonb;
BEGIN
  SELECT count(*) INTO v_extract_n FROM public.call_extractions e WHERE e.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'field_name', f.field_name,
    'corrections', f.corrections,
    'extractions', v_extract_n,
    'rate', public.reporting_rate(f.corrections, GREATEST(v_extract_n, 1), v_min, false)
  ) ORDER BY f.field_name), '[]'::jsonb)
  INTO v_fields
  FROM (
    SELECT field_name, count(DISTINCT extraction_id)::bigint AS corrections
    FROM public.extraction_corrections
    WHERE org_id = p_org_id
    GROUP BY field_name
  ) f;

  -- Fields with zero corrections still appear so the operator can see which
  -- fields have not been touched, without aggregating across fields.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'field_name', x.field_name,
    'corrections', COALESCE(c.corrections, 0),
    'extractions', v_extract_n,
    'rate', public.reporting_rate(COALESCE(c.corrections, 0), GREATEST(v_extract_n, 1), v_min, false)
  ) ORDER BY x.field_name), '[]'::jsonb)
  INTO v_fields
  FROM (
    SELECT unnest(ARRAY[
      'summary',
      'stated_objection',
      'stated_objection_state',
      'budget_signal',
      'budget_signal_state',
      'timeline_signal',
      'timeline_signal_state',
      'decision_process',
      'decision_process_state',
      'next_step_agreed',
      'next_step_state',
      'quotes'
    ]) AS field_name
  ) x
  LEFT JOIN (
    SELECT field_name, count(DISTINCT extraction_id)::bigint AS corrections
    FROM public.extraction_corrections
    WHERE org_id = p_org_id
    GROUP BY field_name
  ) c ON c.field_name = x.field_name;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'model_version', COALESCE(m.model_version, 'unknown'),
    'field_name', m.field_name,
    'corrections', m.corrections,
    'extractions', m.extractions,
    'rate', public.reporting_rate(m.corrections, m.extractions, v_min, false)
  ) ORDER BY m.model_version, m.field_name), '[]'::jsonb)
  INTO v_models
  FROM (
    SELECT
      COALESCE(e.model_version, 'unknown') AS model_version,
      x.field_name,
      count(DISTINCT e.id)::bigint AS extractions,
      count(DISTINCT c.extraction_id)::bigint AS corrections
    FROM public.call_extractions e
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'summary','stated_objection','budget_signal','timeline_signal',
        'decision_process','next_step_agreed','quotes'
      ]) AS field_name
    ) x
    LEFT JOIN public.extraction_corrections c
      ON c.extraction_id = e.id AND c.org_id = e.org_id AND c.field_name = x.field_name
    WHERE e.org_id = p_org_id
    GROUP BY 1, 2
  ) m;

  SELECT count(*) INTO v_unmatched_n FROM public.unmatched_transcripts u WHERE u.org_id = p_org_id;
  SELECT count(*) INTO v_matched_n
  FROM public.calls c
  WHERE c.org_id = p_org_id AND c.raw_transcript IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', s.status, 'n', s.n
  ) ORDER BY s.status), '[]'::jsonb)
  INTO v_unmatched_by
  FROM (
    SELECT status::text AS status, count(*)::integer AS n
    FROM public.unmatched_transcripts
    WHERE org_id = p_org_id
    GROUP BY status
  ) s;

  SELECT jsonb_build_object(
    'dead', count(*) FILTER (WHERE status = 'dead'),
    'n', count(*),
    'rate', public.reporting_rate(
      count(*) FILTER (WHERE status = 'dead'),
      count(*),
      v_min,
      false
    )
  )
  INTO v_fail
  FROM public.extraction_jobs
  WHERE org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'field_name', a.field_name,
    'n', a.n,
    'grounded', a.grounded,
    'rate', public.reporting_rate(a.grounded, a.n, v_min, false)
  ) ORDER BY a.field_name), '[]'::jsonb)
  INTO v_audit
  FROM (
    SELECT field_name, count(*)::bigint AS n, count(*) FILTER (WHERE grounded)::bigint AS grounded
    FROM public.extraction_audits
    WHERE org_id = p_org_id
    GROUP BY field_name
  ) a;

  RETURN jsonb_build_object(
    'correction_by_field', v_fields,
    'correction_by_model_field', v_models,
    'unmatched_n', COALESCE(v_unmatched_n, 0),
    'matched_n', COALESCE(v_matched_n, 0),
    'unmatched_rate', public.reporting_rate(
      COALESCE(v_unmatched_n, 0),
      COALESCE(v_unmatched_n, 0) + COALESCE(v_matched_n, 0),
      v_min,
      false
    ),
    'unmatched_by_status', v_unmatched_by,
    'extraction_failure', v_fail,
    'sample_audit_by_field', v_audit,
    'plain', 'Correction rate is errors someone noticed. The sample audit is a random check against the transcript, including errors nobody caught. Neither number is a single accuracy score across fields.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_draft_report(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_edit jsonb;
  v_approve jsonb;
  v_reject jsonb;
  v_reply jsonb;
  v_quality jsonb;
  v_under jsonb;
  v_outcome jsonb;
  v_worst record;
  v_peer_n integer := 0;
  v_second numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch', e.branch,
    'n', e.n,
    'median_edit_distance', e.median_edit_distance
  ) ORDER BY e.branch), '[]'::jsonb)
  INTO v_edit
  FROM (
    SELECT
      d.branch::text AS branch,
      count(*)::integer AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d.edit_distance) AS median_edit_distance
    FROM public.follow_up_drafts d
    WHERE d.org_id = p_org_id AND d.edit_distance IS NOT NULL
    GROUP BY d.branch
  ) e;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch', a.branch,
    'generated', a.generated,
    'approved', a.approved,
    'rejected', a.rejected,
    'approval_rate', public.reporting_rate(a.approved, a.generated, v_min, false),
    'rejection_rate', public.reporting_rate(a.rejected, a.generated, v_min, false)
  ) ORDER BY a.branch), '[]'::jsonb)
  INTO v_approve
  FROM (
    SELECT
      d.branch::text AS branch,
      count(*)::bigint AS generated,
      count(*) FILTER (WHERE d.status IN ('approved', 'sent'))::bigint AS approved,
      count(*) FILTER (WHERE d.status = 'rejected')::bigint AS rejected
    FROM public.follow_up_drafts d
    WHERE d.org_id = p_org_id
    GROUP BY d.branch
  ) a;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch', r.branch,
    'reason', r.rejected_reason,
    'n', r.n
  ) ORDER BY r.branch, r.n DESC), '[]'::jsonb)
  INTO v_reject
  FROM (
    SELECT branch::text, rejected_reason, count(*)::integer AS n
    FROM public.follow_up_drafts
    WHERE org_id = p_org_id AND status = 'rejected' AND rejected_reason IS NOT NULL
    GROUP BY 1, 2
  ) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch', s.branch,
    'sequence_position', s.sequence_position,
    'sent', s.sent,
    'replied', s.replied,
    'reply_rate', public.reporting_rate(s.replied, s.sent, v_min, false)
  ) ORDER BY s.branch, s.sequence_position), '[]'::jsonb)
  INTO v_reply
  FROM (
    SELECT
      d.branch::text AS branch,
      d.sequence_position,
      count(*) FILTER (WHERE d.status = 'sent')::bigint AS sent,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.follow_up_reply_signals rs
          WHERE rs.draft_id = d.id AND rs.org_id = d.org_id
        )
      )::bigint AS replied
    FROM public.follow_up_drafts d
    WHERE d.org_id = p_org_id
    GROUP BY d.branch, d.sequence_position
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch', q.branch,
    'failure_type', q.failure_type,
    'n', q.n
  ) ORDER BY q.branch, q.n DESC), '[]'::jsonb)
  INTO v_quality
  FROM (
    SELECT branch::text, failure_type::text, count(*)::integer AS n
    FROM public.follow_up_quality_check_failures
    WHERE org_id = p_org_id
    GROUP BY 1, 2
  ) q;

  SELECT * INTO v_worst
  FROM (
    SELECT
      e.branch,
      e.n,
      e.median_edit_distance,
      a.generated,
      a.rejected
    FROM (
      SELECT branch::text AS branch,
        count(*)::integer AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY edit_distance) AS median_edit_distance
      FROM public.follow_up_drafts
      WHERE org_id = p_org_id AND edit_distance IS NOT NULL
      GROUP BY branch
    ) e
    JOIN (
      SELECT branch::text AS branch, count(*)::integer AS generated,
        count(*) FILTER (WHERE status = 'rejected')::integer AS rejected
      FROM public.follow_up_drafts
      WHERE org_id = p_org_id
      GROUP BY branch
    ) a ON a.branch = e.branch
    WHERE e.n >= v_min
    ORDER BY e.median_edit_distance DESC NULLS LAST
    LIMIT 1
  ) w;

  SELECT count(*)::integer INTO v_peer_n
  FROM (
    SELECT branch
    FROM public.follow_up_drafts
    WHERE org_id = p_org_id AND edit_distance IS NOT NULL
    GROUP BY branch
    HAVING count(*) >= v_min
  ) q;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.edit_distance)
  INTO v_second
  FROM public.follow_up_drafts d
  WHERE d.org_id = p_org_id
    AND d.edit_distance IS NOT NULL
    AND d.branch::text IS DISTINCT FROM v_worst.branch
    AND d.branch IN (
      SELECT branch
      FROM public.follow_up_drafts
      WHERE org_id = p_org_id AND edit_distance IS NOT NULL
      GROUP BY branch
      HAVING count(*) >= v_min
    );

  IF v_worst.branch IS NOT NULL
     AND v_peer_n >= 2
     AND v_second IS NOT NULL
     AND v_worst.median_edit_distance > v_second THEN
    v_under := jsonb_build_object(
      'branch', v_worst.branch,
      'n', v_worst.n,
      'median_edit_distance', v_worst.median_edit_distance,
      'recommendation',
        'The '
        || replace(v_worst.branch, '_', ' ')
        || ' branch is rewritten more than the others (median edit distance '
        || round(COALESCE(v_worst.median_edit_distance, 0)::numeric)::text
        || ' on '
        || v_worst.n::text
        || ' drafts). Change that branch''s instruction so the first draft is closer to what operators send.'
    );
  ELSE
    v_under := jsonb_build_object(
      'branch', null,
      'plain', 'No follow-up branch has enough edited drafts, compared with another branch, to name an underperformer.'
    );
  END IF;

  -- Outcome association: sent follow-up vs none, only inside score bands
  -- that have enough of both groups. Unmatched volumes are not "comparable."
  SELECT jsonb_build_object(
    'treated', public.reporting_rate(t.closed, t.n, v_min, false),
    'control', public.reporting_rate(c.closed, c.n, v_min, false),
    'plain', CASE
      WHEN t.n < v_min OR c.n < v_min THEN
        'Not enough comparable resolved leads to compare follow-up against no follow-up inside the same score band.'
      WHEN abs(
        COALESCE((t.closed::numeric / NULLIF(t.n, 0)), 0)
        - COALESCE((c.closed::numeric / NULLIF(c.n, 0)), 0)
      ) < 0.02 THEN
        'Leads that received a follow-up closed at about the same rate as comparable leads that did not, inside the same score band. That is association, not proof the follow-up did nothing — and not proof it helped.'
      ELSE
        'Leads that received a follow-up closed at a different rate than comparable leads that did not, inside the same score band. That is association, not proof the follow-up caused the difference.'
    END
  )
  INTO v_outcome
  FROM (
    SELECT
      count(*)::bigint AS n,
      count(*) FILTER (WHERE r.closed)::bigint AS closed
    FROM public.calibration_mature_resolved(p_org_id) r
    WHERE r.score IS NOT NULL
      AND public.calibration_score_band(r.score) IN (
        SELECT public.calibration_score_band(x.score)
        FROM public.calibration_mature_resolved(p_org_id) x
        WHERE x.score IS NOT NULL
        GROUP BY public.calibration_score_band(x.score)
        HAVING count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.follow_up_drafts d
            WHERE d.lead_id = x.lead_id AND d.org_id = p_org_id AND d.status = 'sent'
          )
        ) >= v_min
        AND count(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM public.follow_up_drafts d
            WHERE d.lead_id = x.lead_id AND d.org_id = p_org_id AND d.status = 'sent'
          )
        ) >= v_min
      )
      AND EXISTS (
        SELECT 1 FROM public.follow_up_drafts d
        WHERE d.lead_id = r.lead_id AND d.org_id = p_org_id AND d.status = 'sent'
      )
  ) t
  CROSS JOIN (
    SELECT
      count(*)::bigint AS n,
      count(*) FILTER (WHERE r.closed)::bigint AS closed
    FROM public.calibration_mature_resolved(p_org_id) r
    WHERE r.score IS NOT NULL
      AND public.calibration_score_band(r.score) IN (
        SELECT public.calibration_score_band(x.score)
        FROM public.calibration_mature_resolved(p_org_id) x
        WHERE x.score IS NOT NULL
        GROUP BY public.calibration_score_band(x.score)
        HAVING count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.follow_up_drafts d
            WHERE d.lead_id = x.lead_id AND d.org_id = p_org_id AND d.status = 'sent'
          )
        ) >= v_min
        AND count(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM public.follow_up_drafts d
            WHERE d.lead_id = x.lead_id AND d.org_id = p_org_id AND d.status = 'sent'
          )
        ) >= v_min
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.follow_up_drafts d
        WHERE d.lead_id = r.lead_id AND d.org_id = p_org_id AND d.status = 'sent'
      )
  ) c;

  RETURN jsonb_build_object(
    'median_edit_distance_by_branch', v_edit,
    'approval_by_branch', v_approve,
    'rejection_reasons', v_reject,
    'reply_by_branch_position', v_reply,
    'quality_failures_by_branch', v_quality,
    'underperforming_branch', v_under,
    'follow_up_outcome', v_outcome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_profile_shift(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_changed_at timestamptz;
  v_before_n integer;
  v_after_n integer;
  v_reason text;
  rec record;
  v_bn integer;
  v_bk integer;
  v_an integer;
  v_ak integer;
  v_delta numeric;
  v_best numeric := 0;
BEGIN
  FOR rec IN
    SELECT created_at
    FROM public.business_profile_versions
    WHERE org_id = p_org_id
    ORDER BY created_at
  LOOP
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE closed)::integer
    INTO v_bn, v_bk
    FROM public.calibration_mature_resolved(p_org_id) r
    WHERE r.opted_in_at < rec.created_at;

    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE closed)::integer
    INTO v_an, v_ak
    FROM public.calibration_mature_resolved(p_org_id) r
    WHERE r.opted_in_at >= rec.created_at;

    IF v_bn >= v_min AND v_an >= v_min THEN
      v_delta := abs((v_ak::numeric / v_an) - (v_bk::numeric / v_bn));
      IF v_delta >= 0.10 AND v_delta >= v_best THEN
        v_best := v_delta;
        v_changed_at := rec.created_at;
        v_before_n := v_bn;
        v_after_n := v_an;
        v_reason :=
          'A business profile change on '
          || rec.created_at::date::text
          || ' sits next to a shift in close rate. That is a business change, not evidence the scoring weights are wrong.';
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'shifted', v_reason IS NOT NULL,
    'profile_changed_at', v_changed_at,
    'before_n', v_before_n,
    'after_n', v_after_n,
    'reason', v_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_historical_effect(
  p_org_id uuid,
  p_w_t integer,
  p_w_i integer,
  p_w_a integer,
  p_w_p integer,
  p_threshold integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur public.score_configs%ROWTYPE;
  v_n integer;
  v_closed integer;
  v_cur_ready integer;
  v_new_ready integer;
BEGIN
  SELECT * INTO v_cur FROM public.score_configs WHERE org_id = p_org_id;
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE r.closed)::integer,
    count(*) FILTER (
      WHERE r.closed AND r.score IS NOT NULL AND r.score >= v_cur.ready_threshold
    )::integer,
    count(*) FILTER (
      WHERE r.closed AND public.calibration_recompute_total(
        r.timeline, r.investment_capacity, r.decision_authority, r.pain_severity,
        p_w_t, p_w_i, p_w_a, p_w_p
      ) >= p_threshold
    )::integer
  INTO v_n, v_closed, v_cur_ready, v_new_ready
  FROM public.calibration_mature_resolved(p_org_id) r
  WHERE r.is_holdout;

  RETURN jsonb_build_object(
    'n', COALESCE(v_n, 0),
    'closed', COALESCE(v_closed, 0),
    'closed_at_or_above_current', COALESCE(v_cur_ready, 0),
    'closed_at_or_above_proposed', COALESCE(v_new_ready, 0),
    'plain',
      'On the holdout sample of '
      || COALESCE(v_n, 0)::text
      || ' resolved leads, '
      || COALESCE(v_new_ready, 0)::text
      || ' of the '
      || COALESCE(v_closed, 0)::text
      || ' that closed would have sat at or above the ready line under the suggested weights, versus '
      || COALESCE(v_cur_ready, 0)::text
      || ' under today''s weights. That is a replay of history, not a forecast.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_calibration_suggestions(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer := public.reporting_diag_min();
  v_holdout jsonb;
  v_shift jsonb;
  v_factors jsonb;
  v_curve jsonb;
  v_cfg public.score_configs%ROWTYPE;
  v_n integer;
  v_weak text;
  v_strong text;
  v_weak_w integer;
  v_strong_w integer;
  v_weak_d numeric;
  v_strong_d numeric;
  v_prop jsonb;
  v_hist jsonb;
  v_id uuid;
  v_well boolean;
  v_sentence text;
BEGIN
  -- This function inserts suggestion rows. It does not write live scoring configuration.
  v_holdout := public.calibration_holdout_state(p_org_id);
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  v_n := COALESCE((v_holdout ->> 'mature_resolved_n')::integer, 0);

  UPDATE public.calibration_suggestions
  SET status = 'superseded'
  WHERE org_id = p_org_id AND status = 'pending';

  IF NOT COALESCE((v_holdout ->> 'enabled')::boolean, false) THEN
    INSERT INTO public.calibration_suggestions (
      org_id, kind, status, sample_n, evidence_sentence, withheld_reason, payload
    ) VALUES (
      p_org_id, 'weights', 'withheld', v_n,
      'Weight suggestions are withheld because the random sample is off.',
      'holdout_disabled',
      jsonb_build_object('holdout', v_holdout)
    );
    RETURN jsonb_build_object('status', 'withheld', 'reason', 'holdout_disabled');
  END IF;

  IF COALESCE((v_holdout ->> 'too_small')::boolean, true) THEN
    INSERT INTO public.calibration_suggestions (
      org_id, kind, status, sample_n, evidence_sentence, withheld_reason, payload
    ) VALUES (
      p_org_id, 'weights', 'withheld', v_n,
      'Weight suggestions are withheld because the holdout sample is below '
        || v_min::text || ' resolved leads.',
      'holdout_too_small',
      jsonb_build_object('holdout', v_holdout)
    );
    RETURN jsonb_build_object('status', 'withheld', 'reason', 'holdout_too_small');
  END IF;

  v_shift := public.calibration_profile_shift(p_org_id);
  IF COALESCE((v_shift ->> 'shifted')::boolean, false) THEN
    INSERT INTO public.calibration_suggestions (
      org_id, kind, status, sample_n, evidence_sentence, withheld_reason, payload
    ) VALUES (
      p_org_id, 'weights', 'withheld', v_n,
      v_shift ->> 'reason',
      'business_profile_shift',
      jsonb_build_object('holdout', v_holdout, 'shift', v_shift)
    );
    RETURN jsonb_build_object('status', 'withheld', 'reason', 'business_profile_shift');
  END IF;

  v_curve := public.calibration_band_curve(p_org_id, true);
  v_well := COALESCE((v_curve ->> 'monotonic')::boolean, false)
    AND COALESCE((v_curve ->> 'shown_count')::integer, 0) >= 2;

  IF v_well THEN
    RETURN jsonb_build_object(
      'status', 'working',
      'plain', 'The score is lining up with who actually closes on the holdout sample. Leave the weights.'
    );
  END IF;

  v_factors := public.calibration_factor_validity(p_org_id, true);
  SELECT f.factor, f.delta, CASE f.factor
      WHEN 'timeline' THEN v_cfg.timeline_weight
      WHEN 'investment_capacity' THEN v_cfg.investment_capacity_weight
      WHEN 'decision_authority' THEN v_cfg.decision_authority_weight
      ELSE v_cfg.pain_severity_weight
    END
  INTO v_weak, v_weak_d, v_weak_w
  FROM jsonb_to_recordset(v_factors -> 'rows') AS f(
    factor text, n integer, n_closed numeric, n_lost numeric, too_small boolean, delta numeric
  )
  WHERE NOT f.too_small AND f.delta IS NOT NULL
    AND f.n_closed >= v_min AND f.n_lost >= v_min
  ORDER BY f.delta ASC
  LIMIT 1;

  SELECT f.factor, f.delta, CASE f.factor
      WHEN 'timeline' THEN v_cfg.timeline_weight
      WHEN 'investment_capacity' THEN v_cfg.investment_capacity_weight
      WHEN 'decision_authority' THEN v_cfg.decision_authority_weight
      ELSE v_cfg.pain_severity_weight
    END
  INTO v_strong, v_strong_d, v_strong_w
  FROM jsonb_to_recordset(v_factors -> 'rows') AS f(
    factor text, n integer, n_closed numeric, n_lost numeric, too_small boolean, delta numeric
  )
  WHERE NOT f.too_small AND f.delta IS NOT NULL
    AND f.n_closed >= v_min AND f.n_lost >= v_min
  ORDER BY f.delta DESC
  LIMIT 1;

  IF v_weak IS NULL OR v_strong IS NULL OR v_weak = v_strong THEN
    RETURN jsonb_build_object('status', 'working', 'plain', 'No factor has enough holdout sample to justify a weight change.');
  END IF;

  IF (v_strong_d - v_weak_d) < 8 OR v_weak_w < 5 THEN
    INSERT INTO public.calibration_suggestions (
      org_id, kind, status, sample_n, evidence_sentence, withheld_reason, payload
    ) VALUES (
      p_org_id, 'weights', 'withheld', v_n,
      'The factor gap is too small to survive a modest amount of noise, so no weight change is offered.',
      'noise_floor',
      jsonb_build_object('weak', v_weak, 'strong', v_strong, 'gap', v_strong_d - v_weak_d)
    );
    RETURN jsonb_build_object('status', 'withheld', 'reason', 'noise_floor');
  END IF;

  v_prop := jsonb_build_object(
    'timeline', v_cfg.timeline_weight
      + CASE WHEN v_strong = 'timeline' THEN 5 WHEN v_weak = 'timeline' THEN -5 ELSE 0 END,
    'investment_capacity', v_cfg.investment_capacity_weight
      + CASE WHEN v_strong = 'investment_capacity' THEN 5 WHEN v_weak = 'investment_capacity' THEN -5 ELSE 0 END,
    'decision_authority', v_cfg.decision_authority_weight
      + CASE WHEN v_strong = 'decision_authority' THEN 5 WHEN v_weak = 'decision_authority' THEN -5 ELSE 0 END,
    'pain_severity', v_cfg.pain_severity_weight
      + CASE WHEN v_strong = 'pain_severity' THEN 5 WHEN v_weak = 'pain_severity' THEN -5 ELSE 0 END,
    'ready_threshold', v_cfg.ready_threshold,
    'from_factor', v_weak,
    'to_factor', v_strong,
    'move', 5
  );

  v_hist := public.calibration_historical_effect(
    p_org_id,
    (v_prop ->> 'timeline')::integer,
    (v_prop ->> 'investment_capacity')::integer,
    (v_prop ->> 'decision_authority')::integer,
    (v_prop ->> 'pain_severity')::integer,
    v_cfg.ready_threshold
  );

  v_sentence :=
    'Move 5 points of weight from '
    || replace(v_weak, '_', ' ')
    || ' to '
    || replace(v_strong, '_', ' ')
    || ' because '
    || replace(v_strong, '_', ' ')
    || ' separates closed from lost more strongly on the holdout sample of '
    || v_n::text
    || ' resolved leads.';

  INSERT INTO public.calibration_suggestions (
    org_id, kind, status, sample_n, evidence_sentence, payload
  ) VALUES (
    p_org_id, 'weights', 'pending', v_n, v_sentence,
    jsonb_build_object(
      'proposed', v_prop,
      'historical', v_hist,
      'factors', v_factors,
      'holdout', v_holdout
    )
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'pending', 'id', v_id, 'kind', 'weights');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_org_score_config(
  p_org_id uuid,
  p_timeline integer,
  p_investment integer,
  p_authority integer,
  p_pain integer,
  p_threshold integer,
  p_speed integer,
  p_ghost_soft integer,
  p_ghost_hard integer,
  p_source public.score_config_source DEFAULT 'settings',
  p_suggestion_id uuid DEFAULT NULL,
  p_holdout_percent numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source public.score_config_source;
  v_suggestion uuid;
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to change scoring settings';
  END IF;
  IF p_timeline + p_investment + p_authority + p_pain <> 100 THEN
    RAISE EXCEPTION 'weights must add to 100';
  END IF;
  IF p_timeline < 0 OR p_investment < 0 OR p_authority < 0 OR p_pain < 0
     OR p_timeline > 100 OR p_investment > 100 OR p_authority > 100 OR p_pain > 100 THEN
    RAISE EXCEPTION 'weights must be between 0 and 100';
  END IF;
  IF p_threshold < 0 OR p_threshold > 100 THEN
    RAISE EXCEPTION 'ready threshold must be between 0 and 100';
  END IF;
  IF p_speed < 1 OR p_speed > 24 * 60 THEN
    RAISE EXCEPTION 'speed-to-lead minutes must be between 1 and 1440';
  END IF;
  IF p_ghost_soft < 1 OR p_ghost_hard < 1 OR p_ghost_soft >= p_ghost_hard THEN
    RAISE EXCEPTION 'the approaching-ghost window must be shorter than the ghost window';
  END IF;
  IF p_holdout_percent IS NOT NULL AND (p_holdout_percent < 0 OR p_holdout_percent > 20) THEN
    RAISE EXCEPTION 'holdout percent must be between 0 and 20';
  END IF;

  -- Callers cannot forge calibration_apply provenance. Only apply_calibration_suggestion
  -- sets vistrial.allow_calibration_apply for this transaction.
  IF current_setting('vistrial.allow_calibration_apply', true) = '1' THEN
    v_source := 'calibration_apply';
    v_suggestion := p_suggestion_id;
  ELSE
    v_source := 'settings';
    v_suggestion := NULL;
  END IF;

  PERFORM set_config('vistrial.actor_member_id', COALESCE(public.user_member_id(p_org_id)::text, ''), true);
  PERFORM set_config('vistrial.score_config_source', v_source::text, true);
  PERFORM set_config('vistrial.score_suggestion_id', COALESCE(v_suggestion::text, ''), true);

  UPDATE public.score_configs
  SET
    timeline_weight = p_timeline,
    investment_capacity_weight = p_investment,
    decision_authority_weight = p_authority,
    pain_severity_weight = p_pain,
    ready_threshold = p_threshold,
    speed_to_lead_minutes = p_speed,
    ghost_days_soft = p_ghost_soft,
    ghost_days_hard = p_ghost_hard,
    updated_at = now()
  WHERE org_id = p_org_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'scoring config missing';
  END IF;

  IF p_holdout_percent IS NOT NULL THEN
    UPDATE public.organizations
    SET holdout_percent = p_holdout_percent, updated_at = now()
    WHERE id = p_org_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_calibration_suggestion(p_org_id uuid, p_suggestion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.calibration_suggestions%ROWTYPE;
  v_cfg public.score_configs%ROWTYPE;
  v_prop jsonb;
  v_scores_before bigint;
  v_scores_after bigint;
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to apply a scoring suggestion';
  END IF;

  SELECT * INTO v_row
  FROM public.calibration_suggestions
  WHERE id = p_suggestion_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion missing';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'suggestion is not pending';
  END IF;
  IF v_row.kind NOT IN ('weights', 'threshold') THEN
    RAISE EXCEPTION 'this suggestion is not a config change';
  END IF;

  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  SELECT count(*) INTO v_scores_before FROM public.readiness_scores WHERE org_id = p_org_id;

  v_prop := COALESCE(v_row.payload -> 'proposed', '{}'::jsonb);

  PERFORM set_config('vistrial.allow_calibration_apply', '1', true);

  PERFORM public.save_org_score_config(
    p_org_id,
    COALESCE((v_prop ->> 'timeline')::integer, v_cfg.timeline_weight),
    COALESCE((v_prop ->> 'investment_capacity')::integer, v_cfg.investment_capacity_weight),
    COALESCE((v_prop ->> 'decision_authority')::integer, v_cfg.decision_authority_weight),
    COALESCE((v_prop ->> 'pain_severity')::integer, v_cfg.pain_severity_weight),
    COALESCE((v_prop ->> 'ready_threshold')::integer, v_cfg.ready_threshold),
    v_cfg.speed_to_lead_minutes,
    v_cfg.ghost_days_soft,
    v_cfg.ghost_days_hard,
    'calibration_apply',
    p_suggestion_id
  );

  PERFORM set_config('vistrial.allow_calibration_apply', '', true);

  UPDATE public.calibration_suggestions
  SET
    status = 'applied',
    applied_at = now(),
    applied_by_member_id = public.user_member_id(p_org_id)
  WHERE id = p_suggestion_id;

  SELECT count(*) INTO v_scores_after FROM public.readiness_scores WHERE org_id = p_org_id;
  IF v_scores_after <> v_scores_before THEN
    RAISE EXCEPTION 'applying a suggestion must not write score history';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'suggestion_id', p_suggestion_id,
    'scores_unchanged', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_calibration_suggestion(p_org_id uuid, p_suggestion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.calibration_suggestions
  SET
    status = 'dismissed',
    dismissed_at = now(),
    dismissed_by_member_id = public.user_member_id(p_org_id)
  WHERE id = p_suggestion_id AND org_id = p_org_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_org_holdout_percent(p_org_id uuid, p_percent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'not authorized to change the holdout';
  END IF;
  IF p_percent < 0 OR p_percent > 20 THEN
    RAISE EXCEPTION 'holdout percent must be between 0 and 20';
  END IF;
  UPDATE public.organizations
  SET holdout_percent = p_percent, updated_at = now()
  WHERE id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_extraction_sample_audit(p_org_id uuid, p_limit integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  rec record;
  v_field text;
  v_value text;
  v_transcript text;
BEGIN
  FOR rec IN
    SELECT e.id, e.call_id, e.model_version, e.summary, e.stated_objection, e.budget_signal,
           e.timeline_signal, e.decision_process, e.next_step_agreed, e.quotes, c.raw_transcript
    FROM public.call_extractions e
    JOIN public.calls c ON c.id = e.call_id AND c.org_id = e.org_id
    WHERE e.org_id = p_org_id
      AND c.raw_transcript IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.extraction_audits a
        WHERE a.extraction_id = e.id AND a.org_id = e.org_id
      )
    ORDER BY random()
    LIMIT GREATEST(p_limit, 0)
  LOOP
    v_transcript := lower(rec.raw_transcript);
    FOREACH v_field IN ARRAY ARRAY[
      'summary','stated_objection','budget_signal','timeline_signal','decision_process','next_step_agreed'
    ]
    LOOP
      v_value := CASE v_field
        WHEN 'summary' THEN rec.summary
        WHEN 'stated_objection' THEN rec.stated_objection
        WHEN 'budget_signal' THEN rec.budget_signal
        WHEN 'timeline_signal' THEN rec.timeline_signal
        WHEN 'decision_process' THEN rec.decision_process
        ELSE rec.next_step_agreed
      END;
      -- Empty is not a pass. Only non-empty extractions are checked against
      -- the transcript, so the rate is "of extracted text, how often it appears."
      IF v_value IS NULL OR length(trim(v_value)) = 0 THEN
        CONTINUE;
      END IF;
      INSERT INTO public.extraction_audits (
        org_id, extraction_id, call_id, field_name, extracted_value, grounded, model_version
      ) VALUES (
        p_org_id, rec.id, rec.call_id, v_field, v_value,
        position(lower(left(trim(v_value), 40)) IN v_transcript) > 0,
        rec.model_version
      );
    END LOOP;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.calibration_cross_client_context(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_min integer := public.benchmark_min_cohort();
  v_rows jsonb;
  v_opted_out boolean;
  v_self_n integer;
  v_self_k integer;
  v_median numeric;
  v_contrast text;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT
    public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume),
    p.aggregate_opt_out
  INTO v_key, v_opted_out
  FROM public.business_profiles p
  WHERE p.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', b.metric,
    'median_value', b.median_value,
    'org_count', b.org_count,
    'sample_n', b.sample_n
  ) ORDER BY b.metric), '[]'::jsonb)
  INTO v_rows
  FROM public.calibration_benchmarks b
  WHERE b.cohort_key = v_key
    AND b.org_count >= v_min
    AND b.sample_n >= public.reporting_diag_min();

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE r.closed)::integer
  INTO v_self_n, v_self_k
  FROM public.calibration_mature_resolved(p_org_id) r
  WHERE r.is_holdout AND r.score IS NOT NULL;

  SELECT b.median_value INTO v_median
  FROM public.calibration_benchmarks b
  WHERE b.cohort_key = v_key
    AND b.metric = 'holdout_close_rate'
  LIMIT 1;

  IF v_key IS NOT NULL
     AND COALESCE(v_self_n, 0) >= public.reporting_diag_min()
     AND v_median IS NOT NULL
     AND abs((v_self_k::numeric / v_self_n) - v_median) >= 0.10 THEN
    v_contrast :=
      'This workspace''s holdout close rate sits apart from the median of similar businesses. That is context about the market, not a recommendation to change this workspace''s scoring.';
  END IF;

  RETURN jsonb_build_object(
    'opted_out', COALESCE(v_opted_out, false),
    'min_orgs', v_min,
    'rows', v_rows,
    'contrast', v_contrast,
    'plain',
      'Figures from similar businesses are context. They are not a reason to change this workspace''s scoring. Only this workspace''s holdout curve can justify a weight change.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_calibration_benchmarks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_added integer := 0;
BEGIN
  DELETE FROM public.calibration_benchmarks;

  WITH contributing AS (
    SELECT
      p.org_id,
      public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume) AS cohort_key,
      p.offer_type,
      public.profile_price_band(p.price_point_cents) AS price_band
    FROM public.business_profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.aggregate_opt_out = false
      AND p.offer_type IS NOT NULL
      AND p.price_point_cents IS NOT NULL
      AND p.monthly_lead_volume IS NOT NULL
      AND o.activated_at IS NOT NULL
      AND o.holdout_percent > 0
  ),
  per_org AS (
    SELECT
      c.cohort_key,
      c.offer_type,
      c.price_band,
      c.org_id,
      count(*)::integer AS n,
      count(*) FILTER (WHERE r.closed)::numeric / NULLIF(count(*), 0) AS close_rate,
      avg(r.score) FILTER (WHERE r.closed) - avg(r.score) FILTER (WHERE NOT r.closed) AS score_delta
    FROM contributing c
    JOIN LATERAL public.calibration_mature_resolved(c.org_id) r ON true
    WHERE r.is_holdout AND r.score IS NOT NULL
    GROUP BY c.cohort_key, c.offer_type, c.price_band, c.org_id
    HAVING count(*) >= public.reporting_diag_min()
  )
  INSERT INTO public.calibration_benchmarks (
    cohort_key, metric, offer_type, price_band, org_count, median_value, sample_n
  )
  SELECT
    p.cohort_key,
    m.metric,
    p.offer_type,
    p.price_band,
    count(DISTINCT p.org_id)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY m.value)::numeric, 4),
    sum(p.n)::integer
  FROM per_org p
  CROSS JOIN LATERAL (
    VALUES
      ('holdout_close_rate', p.close_rate),
      ('holdout_score_delta', p.score_delta)
  ) AS m(metric, value)
  WHERE m.value IS NOT NULL
  GROUP BY p.cohort_key, m.metric, p.offer_type, p.price_band
  HAVING count(DISTINCT p.org_id) >= public.benchmark_min_cohort()
     AND sum(p.n) >= public.reporting_diag_min();

  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_count := v_count + COALESCE(v_added, 0);

  WITH contributing AS (
    SELECT
      p.org_id,
      public.profile_cohort_key(p.offer_type, p.price_point_cents, p.monthly_lead_volume) AS cohort_key,
      p.offer_type,
      public.profile_price_band(p.price_point_cents) AS price_band
    FROM public.business_profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.aggregate_opt_out = false
      AND p.offer_type IS NOT NULL
      AND p.price_point_cents IS NOT NULL
      AND p.monthly_lead_volume IS NOT NULL
      AND o.activated_at IS NOT NULL
      AND o.holdout_percent > 0
  ),
  per_org AS (
    SELECT
      c.cohort_key,
      c.offer_type,
      c.price_band,
      c.org_id,
      o.type::text AS objection_type,
      count(*)::numeric AS n,
      count(*) FILTER (WHERE NOT r.closed)::numeric AS fatal_n
    FROM contributing c
    JOIN LATERAL public.calibration_mature_resolved(c.org_id) r ON true
    JOIN public.objections o ON o.lead_id = r.lead_id AND o.org_id = c.org_id
    WHERE r.is_holdout
    GROUP BY c.cohort_key, c.offer_type, c.price_band, c.org_id, o.type
  ),
  with_share AS (
    SELECT
      p.*,
      p.n / NULLIF(sum(p.n) OVER (PARTITION BY p.org_id), 0) AS share
    FROM per_org p
  )
  INSERT INTO public.calibration_benchmarks (
    cohort_key, metric, offer_type, price_band, org_count, median_value, sample_n
  )
  SELECT
    p.cohort_key,
    m.metric,
    p.offer_type,
    p.price_band,
    count(DISTINCT p.org_id)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY m.value)::numeric, 4),
    sum(p.n)::integer
  FROM with_share p
  CROSS JOIN LATERAL (
    VALUES
      ('objection_share_' || p.objection_type, p.share),
      ('objection_fatal_share_' || p.objection_type, p.fatal_n / NULLIF(p.n, 0))
  ) AS m(metric, value)
  WHERE m.value IS NOT NULL
  GROUP BY p.cohort_key, m.metric, p.offer_type, p.price_band
  HAVING count(DISTINCT p.org_id) >= public.benchmark_min_cohort()
     AND sum(p.n) >= public.reporting_diag_min();

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_count + COALESCE(v_added, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.load_calibration_report(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holdout jsonb;
  v_all jsonb;
  v_hold jsonb;
  v_cfg public.score_configs%ROWTYPE;
  v_pending jsonb;
  v_voice jsonb;
  v_mature integer;
  v_well boolean;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  v_holdout := public.calibration_holdout_state(p_org_id);
  v_all := public.calibration_band_curve(p_org_id, false);
  v_hold := public.calibration_band_curve(p_org_id, true);
  SELECT count(*)::integer INTO v_mature
  FROM public.calibration_mature_resolved(p_org_id);

  v_well := COALESCE((v_holdout ->> 'enabled')::boolean, false)
    AND NOT COALESCE((v_holdout ->> 'too_small')::boolean, true)
    AND COALESCE((v_hold ->> 'monotonic')::boolean, false)
    AND COALESCE((v_hold ->> 'shown_count')::integer, 0) >= 2;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'status', s.status,
    'sample_n', s.sample_n,
    'evidence_sentence', s.evidence_sentence,
    'withheld_reason', s.withheld_reason,
    'payload', s.payload,
    'created_at', s.created_at,
    'applied_at', s.applied_at,
    'applied_by_member_id', s.applied_by_member_id
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_pending
  FROM public.calibration_suggestions s
  WHERE s.org_id = p_org_id
    AND s.status IN ('pending', 'withheld')
    AND s.created_at > now() - interval '30 days';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'kind', v.kind,
    'phrase', v.phrase,
    'evidence', v.evidence,
    'status', v.status
  ) ORDER BY v.created_at DESC), '[]'::jsonb)
  INTO v_voice
  FROM public.voice_profile_suggestions v
  WHERE v.org_id = p_org_id AND v.status = 'pending';

  RETURN jsonb_build_object(
    'holdout', v_holdout,
    'mature_resolved_n', COALESCE(v_mature, 0),
    'min_n', public.reporting_diag_min(),
    'current_weights', jsonb_build_object(
      'timeline', v_cfg.timeline_weight,
      'investment_capacity', v_cfg.investment_capacity_weight,
      'decision_authority', v_cfg.decision_authority_weight,
      'pain_severity', v_cfg.pain_severity_weight,
      'ready_threshold', v_cfg.ready_threshold
    ),
    'all_leads_curve', v_all,
    'holdout_curve', v_hold,
    'factor_validity_all', public.calibration_factor_validity(p_org_id, false),
    'factor_validity_holdout', public.calibration_factor_validity(p_org_id, true),
    'threshold', public.calibration_threshold_placement(p_org_id),
    'extraction', public.calibration_extraction_report(p_org_id),
    'drafts', public.calibration_draft_report(p_org_id),
    'cross_client', public.calibration_cross_client_context(p_org_id),
    'suggestions', v_pending,
    'voice_suggestions', v_voice,
    'well_calibrated', v_well,
    'working_plain', CASE
      WHEN v_well THEN
        'The score is lining up with who actually closes on the holdout sample. Leave the weights.'
      ELSE NULL
    END,
    'honesty', 'A higher score among leads that closed is association, not proof the score caused the close.',
    'all_leads_caveat', CASE
      WHEN COALESCE((v_holdout ->> 'too_small')::boolean, true) THEN
        'The all-leads curve is biased by who got called first. It is shown so you can see the distortion. It is not validation.'
      ELSE
        'The gap between the holdout curve and the all-leads curve is how much calling-by-score is shaping the picture.'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_ops_calibration()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'platform admin only' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'platform admin only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.priority, x.name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      o.id,
      o.name,
      o.slug,
      o.holdout_percent,
      o.holdout_percent <= 0 AS holdout_disabled,
      COALESCE((hs.h ->> 'mature_resolved_n')::integer, 0) AS holdout_n,
      COALESCE((hs.h ->> 'too_small')::boolean, true) AS holdout_too_small,
      COALESCE((cs.c ->> 'monotonic')::boolean, false) AS holdout_monotonic,
      COALESCE((cs.c ->> 'shown_count')::integer, 0) AS shown_bands,
      (
        o.holdout_percent > 0
        AND COALESCE((hs.h ->> 'mature_resolved_n')::integer, 0) >= public.reporting_diag_min()
        AND COALESCE((cs.c ->> 'shown_count')::integer, 0) >= 2
        AND NOT COALESCE((cs.c ->> 'monotonic')::boolean, false)
      ) AS stopped_predicting,
      CASE
        WHEN o.holdout_percent <= 0 THEN 2
        WHEN COALESCE((hs.h ->> 'mature_resolved_n')::integer, 0) >= public.reporting_diag_min()
          AND COALESCE((cs.c ->> 'shown_count')::integer, 0) >= 2
          AND NOT COALESCE((cs.c ->> 'monotonic')::boolean, false) THEN 0
        WHEN COALESCE((hs.h ->> 'too_small')::boolean, true) THEN 3
        ELSE 4
      END AS priority
    FROM public.organizations o
    CROSS JOIN LATERAL (SELECT public.calibration_holdout_state(o.id) AS h) hs
    CROSS JOIN LATERAL (SELECT public.calibration_band_curve(o.id, true) AS c) cs
    WHERE o.offboarded_at IS NULL
  ) x;

  RETURN jsonb_build_object(
    'clients', v_rows,
    'stopped_predicting_n', (
      SELECT count(*) FROM jsonb_array_elements(v_rows) e
      WHERE COALESCE((e ->> 'stopped_predicting')::boolean, false)
    ),
    'holdout_disabled_n', (
      SELECT count(*) FROM jsonb_array_elements(v_rows) e
      WHERE COALESCE((e ->> 'holdout_disabled')::boolean, false)
    )
  );
END;
$$;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'calibration',
  '15 5 * * *',
  86400,
  7200,
  'Open /api/cron/calibration and calibration_suggestions freshness. Confirm holdout_percent is on for clients whose scores should be checked.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
VALUES ('calibration', now(), now())
ON CONFLICT (job_name) DO NOTHING;

REVOKE ALL ON FUNCTION public.calibration_mature_resolved(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_holdout_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_band_curve(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_factor_validity(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_threshold_placement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_extraction_report(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_draft_report(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_profile_shift(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_historical_effect(uuid, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_calibration_suggestions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_extraction_sample_audit(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_calibration_benchmarks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_score_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_lead_holdout() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.load_calibration_report(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_score_config_change(uuid, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_org_score_config(uuid, integer, integer, integer, integer, integer, integer, integer, integer, public.score_config_source, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_calibration_suggestion(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_calibration_suggestion(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_org_holdout_percent(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calibration_cross_client_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_ops_calibration() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calibration_score_band(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calibration_band_lo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calibration_recompute_total(integer, integer, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.load_calibration_report(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_score_config_change(uuid, integer, integer, integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_org_score_config(uuid, integer, integer, integer, integer, integer, integer, integer, integer, public.score_config_source, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_calibration_suggestion(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_calibration_suggestion(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_org_holdout_percent(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calibration_cross_client_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_ops_calibration() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calibration_score_band(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calibration_recompute_total(integer, integer, integer, integer, integer, integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_calibration_suggestions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_extraction_sample_audit(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_calibration_benchmarks() TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_mature_resolved(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_holdout_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_band_curve(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_factor_validity(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_threshold_placement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_extraction_report(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_draft_report(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_profile_shift(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calibration_historical_effect(uuid, integer, integer, integer, integer, integer) TO service_role;

GRANT USAGE ON TYPE public.score_config_source TO authenticated, service_role;
GRANT USAGE ON TYPE public.calibration_suggestion_kind TO authenticated, service_role;
GRANT USAGE ON TYPE public.calibration_suggestion_status TO authenticated, service_role;




