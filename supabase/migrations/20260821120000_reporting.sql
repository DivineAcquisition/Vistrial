-- Prompt 11: reporting, baseline backfill, outcome metric, cached aggregates.
-- Product choices (stated, not guessed):
--   * Sales cycle defaults to 60 days (high-ticket). Configurable per org.
--   * Baseline lookback defaults to 365 days (twelve months). Configurable.
--   * Percentage / per-hundred rates require n >= 30. Diagnostics require n >= 20.
--     Below that the rate is withheld and plain language is used. Eleven leads
--     is not a finding.
--   * Rates truncate toward zero. Deltas truncate in the unflattering direction.
--   * Closed-won is revenue_log (live) or baseline_revenue (backfill) only.
--   * A lead belongs to the period of its opt-in / CRM created date, never close date.
--   * Activation is set when backfill completes or an admin skips it, not at OAuth.
--   * Self-reported, backfilled, and live figures are never blended.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.baseline_run_status AS ENUM (
  'queued',
  'running',
  'completed',
  'failed',
  'skipped'
);

CREATE TYPE public.baseline_grade AS ENUM ('usable', 'partial', 'unusable');

CREATE TYPE public.reporting_job_kind AS ENUM (
  'aggregate',
  'cohort_mature',
  'baseline_backfill'
);

CREATE TYPE public.reporting_job_status AS ENUM (
  'running',
  'completed',
  'failed'
);

CREATE TYPE public.reporting_cohort_side AS ENUM ('live', 'baseline');

CREATE TYPE public.reporting_cohort_status AS ENUM ('maturing', 'mature');

CREATE TYPE public.reporting_range_key AS ENUM (
  'since_activation',
  'last_30d',
  'last_90d',
  'custom'
);

-- ---------------------------------------------------------------------------
-- Org settings
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN sales_cycle_days integer NOT NULL DEFAULT 60,
  ADD COLUMN baseline_lookback_days integer NOT NULL DEFAULT 365;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_sales_cycle_days_range
    CHECK (sales_cycle_days BETWEEN 14 AND 365),
  ADD CONSTRAINT organizations_baseline_lookback_days_range
    CHECK (baseline_lookback_days BETWEEN 30 AND 730);

COMMENT ON COLUMN public.organizations.sales_cycle_days IS
  'Days a lead cohort must age before it enters the headline outcome metric. Default 60.';

COMMENT ON COLUMN public.organizations.baseline_lookback_days IS
  'How far the CRM baseline backfill reaches. Default 365.';

COMMENT ON COLUMN public.organizations.activated_at IS
  'When this workspace became live. Set once when the CRM baseline backfill completes or an admin skips it. Not created_at, and not the OAuth connection moment.';

-- ---------------------------------------------------------------------------
-- Baseline (structurally separate from live tables)
-- ---------------------------------------------------------------------------

CREATE TABLE public.baseline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status public.baseline_run_status NOT NULL DEFAULT 'queued',
  grade public.baseline_grade,
  grade_reasons text[] NOT NULL DEFAULT '{}',
  lookback_days integer NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  contacts_seen integer NOT NULL DEFAULT 0,
  contacts_with_created_date integer NOT NULL DEFAULT 0,
  contacts_with_activity integer NOT NULL DEFAULT 0,
  opportunities_seen integer NOT NULL DEFAULT 0,
  opportunities_with_value integer NOT NULL DEFAULT 0,
  payments_seen integer NOT NULL DEFAULT 0,
  appointments_seen integer NOT NULL DEFAULT 0,
  messages_seen integer NOT NULL DEFAULT 0,
  discontinuity_detected boolean NOT NULL DEFAULT false,
  discontinuity_month date,
  usable_month_count integer,
  triggered_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  triggered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  claimed_at timestamptz,
  error_text text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  replaced_run_id uuid REFERENCES public.baseline_runs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.baseline_runs IS
  'One CRM history pull. Re-runs replace baseline row tables rather than appending. Automatic on CRM connect.';

CREATE INDEX baseline_runs_org_created_idx
  ON public.baseline_runs (org_id, created_at DESC);

CREATE INDEX baseline_runs_claim_idx
  ON public.baseline_runs (claimed_at, id)
  WHERE status IN ('queued', 'running');

CREATE TABLE public.baseline_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.baseline_runs (id) ON DELETE CASCADE,
  ghl_contact_id text NOT NULL,
  created_at_crm timestamptz,
  source text,
  campaign text,
  first_human_touch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseline_leads_org_contact_key UNIQUE (org_id, ghl_contact_id)
);

COMMENT ON TABLE public.baseline_leads IS
  'Pre-activation CRM contacts. Never written into live leads. Opt-in is created_at_crm.';

CREATE INDEX baseline_leads_org_created_idx
  ON public.baseline_leads (org_id, created_at_crm);

CREATE INDEX baseline_leads_run_idx
  ON public.baseline_leads (run_id);

CREATE TABLE public.baseline_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.baseline_runs (id) ON DELETE CASCADE,
  baseline_lead_id uuid NOT NULL REFERENCES public.baseline_leads (id) ON DELETE CASCADE,
  type public.touch_type NOT NULL,
  channel public.touch_channel NOT NULL,
  direction public.touch_direction NOT NULL,
  ghl_user_id text,
  occurred_at timestamptz NOT NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseline_touches_summary_meta_only CHECK (
    summary IS NULL OR char_length(summary) <= 160
  )
);

COMMENT ON TABLE public.baseline_touches IS
  'Activity metadata only. Message bodies are never pulled or stored.';

CREATE INDEX baseline_touches_lead_time_idx
  ON public.baseline_touches (baseline_lead_id, occurred_at);

CREATE TABLE public.baseline_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.baseline_runs (id) ON DELETE CASCADE,
  baseline_lead_id uuid NOT NULL REFERENCES public.baseline_leads (id) ON DELETE CASCADE,
  scheduled_at timestamptz,
  occurred_at timestamptz,
  outcome public.call_outcome,
  ghl_appointment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX baseline_calls_lead_idx
  ON public.baseline_calls (baseline_lead_id);

CREATE TABLE public.baseline_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.baseline_runs (id) ON DELETE CASCADE,
  baseline_lead_id uuid REFERENCES public.baseline_leads (id) ON DELETE SET NULL,
  amount_cents bigint,
  currency text NOT NULL DEFAULT 'usd',
  occurred_at timestamptz NOT NULL,
  source text NOT NULL,
  ghl_opportunity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseline_revenue_amount_positive CHECK (
    amount_cents IS NULL OR amount_cents > 0
  ),
  CONSTRAINT baseline_revenue_source_check CHECK (
    source IN ('opportunity', 'payment')
  )
);

COMMENT ON TABLE public.baseline_revenue IS
  'Won CRM opportunities or payments. amount_cents may be null when the CRM only records that a deal closed.';

CREATE INDEX baseline_revenue_org_lead_idx
  ON public.baseline_revenue (org_id, baseline_lead_id);

CREATE TABLE public.self_reported_baselines (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  leads_per_month integer NOT NULL,
  clients_closed_per_month integer NOT NULL,
  stated_by_member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE RESTRICT,
  stated_at timestamptz NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT self_reported_leads_positive CHECK (leads_per_month >= 1),
  CONSTRAINT self_reported_closes_range CHECK (
    clients_closed_per_month >= 0 AND clients_closed_per_month <= leads_per_month * 20
  )
);

COMMENT ON TABLE public.self_reported_baselines IS
  'Client-stated prior figures. Permanently labeled self-reported. Never blended with backfill or live.';

-- ---------------------------------------------------------------------------
-- Caches, jobs, cohorts
-- ---------------------------------------------------------------------------

CREATE TABLE public.reporting_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_kind public.reporting_job_kind NOT NULL,
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  status public.reporting_job_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_count integer NOT NULL DEFAULT 0,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_text text
);

CREATE INDEX reporting_job_runs_kind_started_idx
  ON public.reporting_job_runs (job_kind, started_at DESC);

CREATE TABLE public.reporting_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  range_key public.reporting_range_key NOT NULL,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  job_run_id uuid REFERENCES public.reporting_job_runs (id) ON DELETE SET NULL,
  CONSTRAINT reporting_snapshots_org_range_key UNIQUE (org_id, range_key)
);

COMMENT ON TABLE public.reporting_snapshots IS
  'Cached panel payloads computed in the database. last-computed is computed_at.';

CREATE TABLE public.reporting_cohorts (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  side public.reporting_cohort_side NOT NULL,
  period_start date NOT NULL,
  lead_count integer NOT NULL DEFAULT 0,
  closed_count integer NOT NULL DEFAULT 0,
  status public.reporting_cohort_status NOT NULL,
  matured_at timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, side, period_start)
);

COMMENT ON TABLE public.reporting_cohorts IS
  'Monthly opt-in cohorts. Maturation is moved by the scheduled job; headline reads mature only.';

-- ---------------------------------------------------------------------------
-- Live reporting indexes (read path). Writes stay indexed on org_id leading.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS leads_org_opted_in_idx
  ON public.leads (org_id, opted_in_at);

CREATE INDEX IF NOT EXISTS leads_org_ghost_untouched_idx
  ON public.leads (org_id)
  WHERE status = 'ghost' AND first_human_touch_at IS NULL;

CREATE INDEX IF NOT EXISTS calls_org_scheduled_idx
  ON public.calls (org_id, scheduled_at);

CREATE INDEX IF NOT EXISTS calls_org_outcome_idx
  ON public.calls (org_id, outcome);

CREATE INDEX IF NOT EXISTS revenue_log_org_lead_idx
  ON public.revenue_log (org_id, lead_id);

CREATE INDEX IF NOT EXISTS objections_org_type_idx
  ON public.objections (org_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS follow_up_reply_org_time_idx
  ON public.follow_up_reply_signals (org_id, replied_at);

CREATE INDEX IF NOT EXISTS follow_up_drafts_org_branch_idx
  ON public.follow_up_drafts (org_id, branch, created_at);

CREATE INDEX IF NOT EXISTS follow_up_sequence_org_halt_idx
  ON public.follow_up_sequence_runs (org_id, halt_reason)
  WHERE halt_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS readiness_scores_org_lead_created_idx
  ON public.readiness_scores (org_id, lead_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS. Revenue-derived tables follow the revenue policy: owner/admin only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.baseline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baseline_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_reported_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY baseline_runs_select
  ON public.baseline_runs FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY baseline_leads_select
  ON public.baseline_leads FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY baseline_touches_select
  ON public.baseline_touches FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY baseline_calls_select
  ON public.baseline_calls FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY baseline_revenue_select
  ON public.baseline_revenue FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY self_reported_select
  ON public.self_reported_baselines FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY self_reported_write
  ON public.self_reported_baselines FOR ALL TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY reporting_snapshots_select
  ON public.reporting_snapshots FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY reporting_cohorts_select
  ON public.reporting_cohorts FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));
CREATE POLICY reporting_job_runs_select
  ON public.reporting_job_runs FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR public.user_has_org_role(org_id, 'owner', 'admin')
  );

GRANT SELECT ON
  public.baseline_runs,
  public.baseline_leads,
  public.baseline_touches,
  public.baseline_calls,
  public.baseline_revenue,
  public.reporting_snapshots,
  public.reporting_cohorts,
  public.reporting_job_runs
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_reported_baselines TO authenticated;
GRANT ALL ON
  public.baseline_runs,
  public.baseline_leads,
  public.baseline_touches,
  public.baseline_calls,
  public.baseline_revenue,
  public.self_reported_baselines,
  public.reporting_job_runs,
  public.reporting_snapshots,
  public.reporting_cohorts
  TO service_role;

CREATE TRIGGER baseline_runs_set_updated_at
  BEFORE UPDATE ON public.baseline_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access + numeric helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reporting_caller_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER runs as the function owner (postgres). current_user is
  -- therefore not the caller. A JWT sub means a signed-in user: only owner /
  -- admin of this org. No JWT means cron, OAuth admin, or a SQL console.
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        public.user_has_org_role(
          p_org_id,
          VARIADIC ARRAY['owner'::public.org_role, 'admin'::public.org_role]
        )
      ELSE
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_rate_min()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

CREATE OR REPLACE FUNCTION public.reporting_diag_min()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 20 $$;

CREATE OR REPLACE FUNCTION public.reporting_rate(
  p_k bigint,
  p_n bigint,
  p_min integer DEFAULT 30,
  p_per_hundred boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'k', COALESCE(p_k, 0),
    'n', COALESCE(p_n, 0),
    'too_small', COALESCE(p_n, 0) < p_min,
    'sample_label', COALESCE(p_k, 0)::text || ' of ' || COALESCE(p_n, 0)::text,
    'per_hundred', CASE
      WHEN NOT p_per_hundred THEN NULL
      WHEN p_n IS NULL OR p_n = 0 OR p_n < p_min THEN NULL
      ELSE trunc((p_k::numeric * 100 / p_n) * 10) / 10
    END,
    'pct', CASE
      WHEN p_per_hundred THEN NULL
      WHEN p_n IS NULL OR p_n = 0 OR p_n < p_min THEN NULL
      ELSE trunc((p_k::numeric * 100 / p_n) * 10) / 10
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.reporting_trunc_delta(p_delta numeric, p_scale integer DEFAULT 1)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_factor numeric;
BEGIN
  IF p_delta IS NULL THEN
    RETURN NULL;
  END IF;
  v_factor := 10 ^ p_scale;
  IF p_delta >= 0 THEN
    RETURN trunc(p_delta * v_factor) / v_factor;
  END IF;
  RETURN - (ceil(abs(p_delta) * v_factor) / v_factor);
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_require_access(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT public.reporting_caller_allowed(p_org_id) THEN
    RAISE EXCEPTION 'reporting is owner/admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Activation / backfill control
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_baseline_backfill(
  p_org_id uuid,
  p_member_id uuid DEFAULT NULL,
  p_replace boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_existing_status public.baseline_run_status;
  v_lookback integer;
  v_id uuid;
  v_replaced uuid;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT baseline_lookback_days INTO v_lookback
  FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_missing';
  END IF;

  SELECT id, status INTO v_existing, v_existing_status
  FROM public.baseline_runs
  WHERE org_id = p_org_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_existing IS NOT NULL AND v_existing_status IN ('queued', 'running') THEN
    RETURN v_existing;
  END IF;

  IF v_existing IS NOT NULL AND NOT p_replace AND v_existing_status IN ('completed', 'skipped') THEN
    RETURN v_existing;
  END IF;

  IF p_replace THEN
    v_replaced := v_existing;
    DELETE FROM public.baseline_leads WHERE org_id = p_org_id;
    DELETE FROM public.baseline_touches WHERE org_id = p_org_id;
    DELETE FROM public.baseline_calls WHERE org_id = p_org_id;
    DELETE FROM public.baseline_revenue WHERE org_id = p_org_id;
  END IF;

  INSERT INTO public.baseline_runs (
    org_id,
    status,
    lookback_days,
    window_start,
    window_end,
    triggered_by_member_id,
    replaced_run_id,
    progress
  ) VALUES (
    p_org_id,
    'queued',
    v_lookback,
    now() - make_interval(days => v_lookback),
    now(),
    p_member_id,
    v_replaced,
    jsonb_build_object('phase', 'queued')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
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
  v_at timestamptz;
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

  SELECT public.mark_org_activated(p_org_id) INTO v_at;
  RETURN v_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_baseline_run()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.baseline_runs
  SET status = 'running',
      started_at = COALESCE(started_at, now()),
      claimed_at = now()
  WHERE id = (
    SELECT r.id
    FROM public.baseline_runs r
    WHERE r.status IN ('queued', 'running')
      AND (r.claimed_at IS NULL OR r.claimed_at < now() - interval '2 minutes')
    ORDER BY r.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_baseline_run(
  p_run_id uuid,
  p_activate boolean DEFAULT true
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
  IF p_activate THEN
    PERFORM public.mark_org_activated(v_org);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_baseline_run(p_run_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.baseline_runs
  SET status = 'failed',
      finished_at = now(),
      claimed_at = NULL,
      error_text = p_error,
      progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object('phase', 'failed')
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_self_reported_baseline(
  p_org_id uuid,
  p_leads_per_month integer,
  p_clients_closed_per_month integer,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  v_member := public.user_member_id(p_org_id);
  IF v_member IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'reporting is owner/admin only' USING ERRCODE = '42501';
  END IF;
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') AND v_member IS NULL THEN
    SELECT id INTO v_member
    FROM public.org_members
    WHERE org_id = p_org_id AND role = 'owner' AND active = true
    ORDER BY created_at
    LIMIT 1;
  END IF;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'member_missing';
  END IF;

  INSERT INTO public.self_reported_baselines (
    org_id, leads_per_month, clients_closed_per_month, stated_by_member_id, stated_at, note
  ) VALUES (
    p_org_id, p_leads_per_month, p_clients_closed_per_month, v_member, now(), p_note
  )
  ON CONFLICT (org_id) DO UPDATE
  SET leads_per_month = excluded.leads_per_month,
      clients_closed_per_month = excluded.clients_closed_per_month,
      stated_by_member_id = excluded.stated_by_member_id,
      stated_at = now(),
      note = excluded.note;
END;
$$;

-- Grade a completed (or ready-to-complete) run from the stats already on the row
-- plus monthly volume in baseline_leads.
CREATE OR REPLACE FUNCTION public.reporting_grade_baseline(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.baseline_runs%ROWTYPE;
  v_date_pct numeric;
  v_activity_pct numeric;
  v_first_busy date;
  v_disc boolean := false;
  v_disc_month date;
  v_reasons text[] := '{}';
  v_grade public.baseline_grade;
  v_usable_months integer := 0;
BEGIN
  SELECT * INTO r FROM public.baseline_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_date_pct := CASE WHEN r.contacts_seen > 0
    THEN r.contacts_with_created_date::numeric / r.contacts_seen ELSE 0 END;
  v_activity_pct := CASE WHEN r.contacts_seen > 0
    THEN r.contacts_with_activity::numeric / r.contacts_seen ELSE 0 END;

  -- Sharp jump in monthly volume between the first and last contact months.
  -- A lookback that is simply longer than the CRM's history is not a jump:
  -- that shows up as fewer usable months, not as a discontinuity.
  WITH bounds AS (
    SELECT
      date_trunc('month', min(created_at_crm)) AS first_m,
      date_trunc('month', max(created_at_crm)) AS last_m
    FROM public.baseline_leads
    WHERE run_id = p_run_id AND created_at_crm IS NOT NULL
  ),
  months AS (
    SELECT generate_series(first_m, last_m, interval '1 month')::date AS m
    FROM bounds
    WHERE first_m IS NOT NULL
  ),
  counts AS (
    SELECT months.m, count(b.id)::numeric AS n
    FROM months
    LEFT JOIN public.baseline_leads b
      ON b.run_id = p_run_id
     AND date_trunc('month', b.created_at_crm)::date = months.m
    GROUP BY months.m
  ),
  jumps AS (
    SELECT
      c.m,
      c.n,
      (SELECT max(p.n) FROM counts p WHERE p.m < c.m) AS prior_max
    FROM counts c
  )
  SELECT m INTO v_disc_month
  FROM jumps
  WHERE prior_max IS NOT NULL
    AND n >= 8
    AND n >= 4 * GREATEST(prior_max, 1)
  ORDER BY m
  LIMIT 1;

  IF v_disc_month IS NOT NULL THEN
    v_disc := true;
    v_first_busy := v_disc_month;
    v_reasons := v_reasons || ARRAY[
      'CRM volume jumps in ' || to_char(v_disc_month, 'YYYY-MM')
      || ', partway through the lookback window'
    ];
  END IF;

  SELECT count(*)::integer INTO v_usable_months
  FROM (
    SELECT date_trunc('month', created_at_crm)::date AS m
    FROM public.baseline_leads
    WHERE run_id = p_run_id
      AND created_at_crm IS NOT NULL
      AND (NOT v_disc OR date_trunc('month', created_at_crm)::date >= v_first_busy)
    GROUP BY 1
  ) s;

  IF r.contacts_seen < 30 THEN
    v_reasons := v_reasons || ARRAY['Fewer than 30 historical contacts'];
  END IF;
  IF v_date_pct < 0.40 THEN
    v_reasons := v_reasons || ARRAY[
      'Only ' || round(v_date_pct * 100) || '% of contacts have a resolvable creation date'
    ];
  ELSIF v_date_pct < 0.70 THEN
    v_reasons := v_reasons || ARRAY[
      round(v_date_pct * 100) || '% of contacts have a resolvable creation date'
    ];
  END IF;
  IF v_activity_pct < 0.10 THEN
    v_reasons := v_reasons || ARRAY[
      'Only ' || round(v_activity_pct * 100) || '% of contacts have any activity record'
    ];
  ELSIF v_activity_pct < 0.40 THEN
    v_reasons := v_reasons || ARRAY[
      round(v_activity_pct * 100) || '% of contacts have any activity record'
    ];
  END IF;
  IF r.opportunities_seen = 0 AND r.payments_seen = 0 THEN
    v_reasons := v_reasons || ARRAY['No opportunity or payment records, so closes cannot be counted'];
  ELSIF r.opportunities_with_value = 0 AND r.payments_seen = 0 THEN
    v_reasons := v_reasons || ARRAY['Closes can be counted but not valued'];
  END IF;
  IF v_usable_months < 3 THEN
    v_reasons := v_reasons || ARRAY['Fewer than three months of usable history'];
  ELSIF v_usable_months < 6 THEN
    v_reasons := v_reasons || ARRAY['Fewer than six months of usable history'];
  END IF;

  IF r.contacts_seen < 30
     OR v_date_pct < 0.40
     OR v_activity_pct < 0.10
     OR v_usable_months < 3
     OR (r.opportunities_seen = 0 AND r.payments_seen = 0) THEN
    v_grade := 'unusable';
  ELSIF v_date_pct < 0.70
     OR v_activity_pct < 0.40
     OR v_disc
     OR v_usable_months < 6
     OR (r.opportunities_with_value = 0 AND r.payments_seen = 0) THEN
    v_grade := 'partial';
  ELSE
    v_grade := 'usable';
    IF array_length(v_reasons, 1) IS NULL THEN
      v_reasons := ARRAY['History covers the window with resolvable dates and activity'];
    END IF;
  END IF;

  UPDATE public.baseline_runs
  SET grade = v_grade,
      grade_reasons = v_reasons,
      discontinuity_detected = v_disc,
      discontinuity_month = v_disc_month,
      usable_month_count = v_usable_months
  WHERE id = p_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Outcome + panel compute
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reporting_org_state(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_self public.self_reported_baselines%ROWTYPE;
  v_job public.reporting_job_runs%ROWTYPE;
  v_conn_status text;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_missing';
  END IF;

  SELECT * INTO v_run
  FROM public.baseline_runs
  WHERE org_id = p_org_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  SELECT * INTO v_self FROM public.self_reported_baselines WHERE org_id = p_org_id;

  SELECT * INTO v_job
  FROM public.reporting_job_runs
  WHERE job_kind = 'aggregate'
    AND (org_id = p_org_id OR org_id IS NULL)
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT status::text INTO v_conn_status
  FROM public.ghl_connections
  WHERE org_id = p_org_id;

  RETURN jsonb_build_object(
    'org_id', o.id,
    'org_name', o.name,
    'org_slug', o.slug,
    'timezone', o.timezone,
    'activated_at', o.activated_at,
    'sales_cycle_days', o.sales_cycle_days,
    'baseline_lookback_days', o.baseline_lookback_days,
    'crm_connected', COALESCE(v_conn_status, 'missing'),
    'last_job_status', v_job.status,
    'last_job_started_at', v_job.started_at,
    'last_job_finished_at', v_job.finished_at,
    'last_job_error', v_job.error_text,
    'job_stale', CASE
      WHEN o.activated_at IS NULL THEN false
      WHEN v_job.id IS NULL THEN true
      WHEN v_job.status = 'failed' THEN true
      WHEN v_job.status = 'running' AND v_job.started_at < now() - interval '2 hours' THEN true
      WHEN v_job.status = 'completed' AND COALESCE(v_job.finished_at, v_job.started_at) < now() - interval '3 hours'
        THEN true
      ELSE false
    END,
    'backfill', CASE WHEN v_run.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_run.id,
      'status', v_run.status,
      'grade', v_run.grade,
      'grade_reasons', to_jsonb(v_run.grade_reasons),
      'window_start', v_run.window_start,
      'window_end', v_run.window_end,
      'lookback_days', v_run.lookback_days,
      'progress', v_run.progress,
      'triggered_at', v_run.triggered_at,
      'triggered_by_member_id', v_run.triggered_by_member_id,
      'started_at', v_run.started_at,
      'finished_at', v_run.finished_at,
      'error_text', v_run.error_text,
      'replaced_run_id', v_run.replaced_run_id,
      'quality', jsonb_build_object(
        'contacts_seen', v_run.contacts_seen,
        'contacts_with_created_date', v_run.contacts_with_created_date,
        'contacts_with_activity', v_run.contacts_with_activity,
        'opportunities_seen', v_run.opportunities_seen,
        'opportunities_with_value', v_run.opportunities_with_value,
        'payments_seen', v_run.payments_seen,
        'appointments_seen', v_run.appointments_seen,
        'messages_seen', v_run.messages_seen,
        'discontinuity_detected', v_run.discontinuity_detected,
        'discontinuity_month', v_run.discontinuity_month,
        'usable_month_count', v_run.usable_month_count
      )
    ) END,
    'self_reported', CASE WHEN v_self.org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'leads_per_month', v_self.leads_per_month,
      'clients_closed_per_month', v_self.clients_closed_per_month,
      'stated_at', v_self.stated_at,
      'stated_by_member_id', v_self.stated_by_member_id,
      'note', v_self.note,
      'label', 'self-reported'
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_outcome(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_self public.self_reported_baselines%ROWTYPE;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  v_live_n bigint := 0;
  v_live_k bigint := 0;
  v_mat_n bigint := 0;
  v_mat_k bigint := 0;
  v_base_n bigint := 0;
  v_base_k bigint := 0;
  v_headline jsonb;
  v_maturing jsonb;
  v_baseline jsonb;
  v_comparison jsonb;
  v_after numeric;
  v_before numeric;
  v_delta numeric;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_self FROM public.self_reported_baselines WHERE org_id = p_org_id;

  v_cutoff := now() - make_interval(days => o.sales_cycle_days);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_to));

  IF o.activated_at IS NOT NULL THEN
    SELECT count(*),
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.revenue_log r
               WHERE r.org_id = l.org_id AND r.lead_id = l.id
             )
           )
    INTO v_live_n, v_live_k
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;

    SELECT count(*),
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.revenue_log r
               WHERE r.org_id = l.org_id AND r.lead_id = l.id
             )
           )
    INTO v_mat_n, v_mat_k
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at > v_cutoff;
  END IF;

  v_headline := public.reporting_rate(v_live_k, v_live_n, public.reporting_rate_min(), true)
    || jsonb_build_object(
      'window_start', v_live_start,
      'window_end', p_to,
      'mature_cutoff', v_cutoff,
      'clamped_from_activation', p_from < COALESCE(o.activated_at, p_from)
    );
  v_maturing := public.reporting_rate(v_mat_k, v_mat_n, public.reporting_rate_min(), true)
    || jsonb_build_object(
      'label', 'Maturing — these leads have not had a full sales cycle yet and are not in the headline.'
    );

  v_baseline := NULL;
  v_comparison := NULL;
  IF v_run.grade IN ('usable', 'partial') THEN
    SELECT count(*),
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.baseline_revenue r
               WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
             )
           )
    INTO v_base_n, v_base_k
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id
      AND b.run_id = v_run.id
      AND b.created_at_crm IS NOT NULL
      AND b.created_at_crm >= v_run.window_start
      AND b.created_at_crm < COALESCE(o.activated_at, v_run.window_end)
      AND b.created_at_crm <= v_cutoff
      AND (
        NOT v_run.discontinuity_detected
        OR v_run.discontinuity_month IS NULL
        OR b.created_at_crm >= v_run.discontinuity_month::timestamptz
      );

    v_baseline := public.reporting_rate(v_base_k, v_base_n, public.reporting_rate_min(), true)
      || jsonb_build_object(
        'kind', 'backfilled',
        'grade', v_run.grade,
        'caveats', to_jsonb(v_run.grade_reasons),
        'window_start', v_run.window_start,
        'window_end', COALESCE(o.activated_at, v_run.window_end),
        'label', 'Vistrial measurement from CRM history'
      );

    v_after := (v_headline ->> 'per_hundred')::numeric;
    v_before := (v_baseline ->> 'per_hundred')::numeric;
    IF v_after IS NOT NULL AND v_before IS NOT NULL THEN
      v_delta := public.reporting_trunc_delta(v_after - v_before, 1);
      v_comparison := jsonb_build_object(
        'shown', true,
        'from', 'backfilled',
        'delta_per_hundred', v_delta,
        'improved', v_delta > 0,
        'unchanged', v_delta = 0,
        'too_small', false
      );
    ELSIF (v_headline ->> 'too_small')::boolean OR (v_baseline ->> 'too_small')::boolean THEN
      v_comparison := jsonb_build_object(
        'shown', false,
        'from', 'backfilled',
        'too_small', true,
        'plain', 'The sample is too small for the difference to mean anything.'
      );
    END IF;
  ELSIF v_run.grade = 'unusable' THEN
    v_comparison := jsonb_build_object(
      'shown', false,
      'from', 'none',
      'plain', 'No pre-activation comparison is shown. The CRM history was graded unusable.'
    );
  ELSIF v_run.id IS NULL THEN
    v_comparison := jsonb_build_object(
      'shown', false,
      'from', 'none',
      'plain', 'No pre-activation comparison is shown. Baseline history has not been pulled yet.'
    );
  END IF;

  RETURN jsonb_build_object(
    'lineage', 'leads.opted_in_at + revenue_log (after); baseline_leads.created_at_crm + baseline_revenue (before)',
    'attribution', 'Vistrial did not close these deals. The client''s team did.',
    'correlation_caveat', 'A change after activation is not proof that Vistrial caused it. Other changes the client made may be in the same window.',
    'activated_at', o.activated_at,
    'sales_cycle_days', o.sales_cycle_days,
    'headline', v_headline,
    'maturing', v_maturing,
    'baseline', v_baseline,
    'self_reported', CASE WHEN v_self.org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'leads_per_month', v_self.leads_per_month,
      'clients_closed_per_month', v_self.clients_closed_per_month,
      'label', 'self-reported',
      'stated_at', v_self.stated_at,
      'note', 'The client''s claim, not a Vistrial measurement. Not blended with live or backfilled figures.'
    ) END,
    'comparison', v_comparison
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_coverage(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_window integer;
  v_live_start timestamptz;
  v_n bigint;
  v_touched bigint;
  v_within bigint;
  v_median numeric;
  v_worst numeric;
  v_breach bigint;
  v_ghost bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT speed_to_lead_minutes INTO v_window
  FROM public.score_configs WHERE org_id = p_org_id;
  v_window := COALESCE(v_window, 15);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT
    count(*),
    count(*) FILTER (WHERE first_human_touch_at IS NOT NULL),
    count(*) FILTER (
      WHERE first_human_touch_at IS NOT NULL
        AND first_human_touch_at <= opted_in_at + make_interval(mins => v_window)
    ),
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)) / 60.0
    ) FILTER (WHERE first_human_touch_at IS NOT NULL),
    max(EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)) / 60.0)
      FILTER (WHERE first_human_touch_at IS NOT NULL),
    count(*) FILTER (
      WHERE first_human_touch_at IS NULL
        AND now() > opted_in_at + make_interval(mins => v_window)
        AND status NOT IN ('closed_won', 'closed_lost', 'ghost')
    ),
    count(*) FILTER (WHERE status = 'ghost' AND first_human_touch_at IS NULL)
  INTO v_n, v_touched, v_within, v_median, v_worst, v_breach, v_ghost
  FROM public.leads
  WHERE org_id = p_org_id
    AND opted_in_at >= v_live_start
    AND opted_in_at < p_to;

  RETURN jsonb_build_object(
    'lineage', 'leads.first_human_touch_at, leads.opted_in_at, score_configs.speed_to_lead_minutes',
    'speed_to_lead_minutes', v_window,
    'n', COALESCE(v_n, 0),
    'ever_touched', public.reporting_rate(v_touched, v_n, public.reporting_rate_min(), false),
    'within_window', public.reporting_rate(v_within, v_n, public.reporting_rate_min(), false),
    'median_minutes', CASE WHEN v_median IS NULL THEN NULL ELSE trunc(v_median * 10) / 10 END,
    'worst_case_minutes', CASE WHEN v_worst IS NULL THEN NULL ELSE trunc(v_worst * 10) / 10 END,
    'currently_in_breach', COALESCE(v_breach, 0),
    'ghosted_no_touch', COALESCE(v_ghost, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_throughput(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_sources jsonb;
  v_booked bigint;
  v_held bigint;
  v_noshow bigint;
  v_funnel jsonb;
  v_n bigint;
  v_touched bigint;
  v_closed bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.n DESC, s.source), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT COALESCE(nullif(source, ''), '(none)') AS source, count(*)::bigint AS n
    FROM public.leads
    WHERE org_id = p_org_id AND opted_in_at >= v_live_start AND opted_in_at < p_to
    GROUP BY 1
  ) s;

  SELECT count(*),
         count(*) FILTER (WHERE first_human_touch_at IS NOT NULL),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
           )
         )
  INTO v_n, v_touched, v_closed
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT count(DISTINCT l.id) INTO v_booked
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    AND (
      l.status IN ('call_booked', 'no_show', 'follow_up', 'objection_hold', 'closed_won', 'closed_lost')
      OR EXISTS (SELECT 1 FROM public.calls c WHERE c.lead_id = l.id AND c.scheduled_at IS NOT NULL)
    );

  SELECT count(DISTINCT l.id) INTO v_held
  FROM public.leads l
  JOIN public.calls c ON c.lead_id = l.id AND c.org_id = l.org_id AND c.outcome = 'held'
  WHERE l.org_id = p_org_id AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT count(DISTINCT l.id) INTO v_noshow
  FROM public.leads l
  JOIN public.calls c ON c.lead_id = l.id AND c.org_id = l.org_id AND c.outcome = 'no_show'
  WHERE l.org_id = p_org_id AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  v_funnel := jsonb_build_array(
    jsonb_build_object('stage', 'opted_in', 'n', v_n)
      || public.reporting_rate(v_closed, v_n, public.reporting_rate_min(), true),
    jsonb_build_object('stage', 'human_touched', 'n', v_touched)
      || public.reporting_rate(v_closed, v_touched, public.reporting_rate_min(), true),
    jsonb_build_object('stage', 'call_booked', 'n', v_booked)
      || public.reporting_rate(v_closed, v_booked, public.reporting_rate_min(), true),
    jsonb_build_object('stage', 'call_held', 'n', v_held)
      || public.reporting_rate(v_closed, v_held, public.reporting_rate_min(), true),
    jsonb_build_object('stage', 'closed_won', 'n', v_closed)
      || public.reporting_rate(v_closed, v_closed, public.reporting_rate_min(), true)
  );

  RETURN jsonb_build_object(
    'lineage', 'leads (opt-in in range) + calls.outcome + revenue_log',
    'leads_in_by_source', v_sources,
    'calls_booked', v_booked,
    'calls_held', v_held,
    'calls_no_showed', v_noshow,
    'show_rate', public.reporting_rate(
      v_held,
      (
        SELECT count(DISTINCT l.id)
        FROM public.leads l
        JOIN public.calls c ON c.lead_id = l.id AND c.org_id = l.org_id
        WHERE l.org_id = p_org_id
          AND l.opted_in_at >= v_live_start
          AND l.opted_in_at < p_to
          AND c.outcome IN ('held', 'no_show')
      ),
      public.reporting_rate_min(),
      false
    ),
    'close_rate_by_stage', v_funnel
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_team(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.display_name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      m.id,
      m.display_name,
      m.role,
      (
        SELECT count(DISTINCT t.lead_id)
        FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id AND l.org_id = t.org_id
        WHERE t.org_id = p_org_id
          AND t.actor_member_id = m.id
          AND t.type = 'human'
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS leads_worked,
      (
        SELECT count(*)
        FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id
        WHERE t.org_id = p_org_id
          AND t.actor_member_id = m.id
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS touches_logged,
      (
        SELECT count(*)
        FROM public.calls c
        JOIN public.leads l ON l.id = c.lead_id
        WHERE c.org_id = p_org_id
          AND c.ran_by_member_id = m.id
          AND c.outcome = 'held'
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS calls_held,
      (
        SELECT count(DISTINCT r.lead_id)
        FROM public.revenue_log r
        JOIN public.leads l ON l.id = r.lead_id
        WHERE r.org_id = p_org_id
          AND r.closed_by_member_id = m.id
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS closes,
      (
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_human_touch_at - l.opted_in_at)) / 60.0
        )
        FROM public.leads l
        JOIN public.touches t ON t.lead_id = l.id AND t.org_id = l.org_id
          AND t.type = 'human' AND t.actor_member_id = m.id
          AND t.occurred_at = l.first_human_touch_at
        WHERE l.org_id = p_org_id
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
          AND l.first_human_touch_at IS NOT NULL
      ) AS median_first_touch_minutes
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.active = true
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'touches.actor_member_id, calls.ran_by_member_id, revenue_log.closed_by_member_id',
    'presentation', 'workload and coverage, not a ranking',
    'operators', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_follow_up(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_generated bigint;
  v_approved bigint;
  v_rejected bigint;
  v_sent bigint;
  v_edit jsonb;
  v_reply jsonb;
  v_halt jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT
    count(*) FILTER (WHERE e.kind IN ('generated', 'regenerated')),
    count(*) FILTER (WHERE e.kind = 'approved'),
    count(*) FILTER (WHERE e.kind = 'rejected'),
    count(*) FILTER (WHERE e.kind = 'sent')
  INTO v_generated, v_approved, v_rejected, v_sent
  FROM public.follow_up_events e
  JOIN public.follow_up_drafts d ON d.id = e.draft_id
  JOIN public.leads l ON l.id = d.lead_id AND l.org_id = e.org_id
  WHERE e.org_id = p_org_id
    AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.branch), '[]'::jsonb)
  INTO v_edit
  FROM (
    SELECT d.branch::text AS branch,
           count(*) FILTER (WHERE d.edit_distance IS NOT NULL)::bigint AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY d.edit_distance)
             FILTER (WHERE d.edit_distance IS NOT NULL) AS median_edit_distance
    FROM public.follow_up_drafts d
    JOIN public.leads l ON l.id = d.lead_id
    WHERE d.org_id = p_org_id
      AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    GROUP BY d.branch
  ) e;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.branch, x.sequence_position), '[]'::jsonb)
  INTO v_reply
  FROM (
    SELECT
      d.branch::text AS branch,
      d.sequence_position,
      count(*) FILTER (WHERE d.status = 'sent')::bigint AS sent,
      count(r.id)::bigint AS replies,
      public.reporting_rate(
        count(r.id)::bigint,
        count(*) FILTER (WHERE d.status = 'sent')::bigint,
        public.reporting_diag_min(),
        false
      ) AS reply_rate
    FROM public.follow_up_drafts d
    JOIN public.leads l ON l.id = d.lead_id
    LEFT JOIN public.follow_up_reply_signals r ON r.draft_id = d.id
    WHERE d.org_id = p_org_id
      AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    GROUP BY d.branch, d.sequence_position
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(h) ORDER BY h.n DESC, h.halt_reason), '[]'::jsonb)
  INTO v_halt
  FROM (
    SELECT s.halt_reason::text AS halt_reason, count(*)::bigint AS n
    FROM public.follow_up_sequence_runs s
    JOIN public.leads l ON l.id = s.lead_id
    WHERE s.org_id = p_org_id
      AND s.halt_reason IS NOT NULL
      AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    GROUP BY s.halt_reason
  ) h;

  RETURN jsonb_build_object(
    'lineage', 'follow_up_drafts, follow_up_events, follow_up_reply_signals, follow_up_sequence_runs.halt_reason',
    'generated', v_generated,
    'approved', v_approved,
    'rejected', v_rejected,
    'sent', v_sent,
    'median_edit_distance_by_branch', v_edit,
    'reply_rate_by_branch_position', v_reply,
    'halt_reasons', v_halt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_objections(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_rows jsonb;
  v_n bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT count(DISTINCT o2.lead_id) INTO v_n
  FROM public.objections o2
  JOIN public.leads l ON l.id = o2.lead_id
  WHERE o2.org_id = p_org_id
    AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.n DESC, t.type), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      ob.type::text AS type,
      count(*)::bigint AS n,
      count(*) FILTER (
        WHERE l.status = 'closed_lost'
          AND NOT EXISTS (
            SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
          )
      )::bigint AS lost_n,
      public.reporting_rate(
        count(*) FILTER (
          WHERE l.status = 'closed_lost'
            AND NOT EXISTS (
              SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
            )
        )::bigint,
        count(*)::bigint,
        public.reporting_diag_min(),
        false
      ) AS lost_rate,
      (
        SELECT COALESCE(jsonb_agg(q.verbatim), '[]'::jsonb)
        FROM (
          SELECT ob2.verbatim
          FROM public.objections ob2
          JOIN public.leads l2 ON l2.id = ob2.lead_id
          WHERE ob2.org_id = p_org_id
            AND ob2.type = ob.type
            AND l2.opted_in_at >= v_live_start AND l2.opted_in_at < p_to
          ORDER BY ob2.created_at DESC
          LIMIT 3
        ) q
      ) AS quotes,
      (
        SELECT COALESCE(jsonb_agg(row_to_json(tm) ORDER BY tm.display_name), '[]'::jsonb)
        FROM (
          SELECT m.display_name, count(*)::bigint AS n
          FROM public.objections ob3
          JOIN public.leads l3 ON l3.id = ob3.lead_id
          LEFT JOIN public.calls c3 ON c3.id = ob3.call_id
          LEFT JOIN public.org_members m ON m.id = COALESCE(c3.ran_by_member_id, l3.assigned_closer_id)
          WHERE ob3.org_id = p_org_id
            AND ob3.type = ob.type
            AND l3.opted_in_at >= v_live_start AND l3.opted_in_at < p_to
            AND m.id IS NOT NULL
          GROUP BY m.display_name
        ) tm
      ) AS by_member
    FROM public.objections ob
    JOIN public.leads l ON l.id = ob.lead_id
    WHERE ob.org_id = p_org_id
      AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    GROUP BY ob.type
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'objections joined to leads (outcome) and calls.ran_by_member_id',
    'lead_n', COALESCE(v_n, 0),
    'too_small', COALESCE(v_n, 0) < public.reporting_diag_min(),
    'rows', CASE WHEN COALESCE(v_n, 0) < public.reporting_diag_min() THEN '[]'::jsonb ELSE v_rows END,
    'suppressed_plain', CASE
      WHEN COALESCE(v_n, 0) < public.reporting_diag_min()
      THEN 'Not enough objection rows in this range to treat the pattern as a finding.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_sources(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_cfg public.score_configs%ROWTYPE;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  v_org_rate numeric;
  v_rows jsonb;
  v_flag jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));
  v_cutoff := now() - make_interval(days => o.sales_cycle_days);

  SELECT (public.reporting_compute_outcome(p_org_id, p_from, p_to) #>> '{headline,per_hundred}')::numeric
  INTO v_org_rate;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.n DESC, s.source, s.campaign), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      COALESCE(nullif(l.source, ''), '(none)') AS source,
      COALESCE(nullif(l.campaign, ''), '(none)') AS campaign,
      count(*)::bigint AS n,
      count(*) FILTER (WHERE l.opted_in_at <= v_cutoff)::bigint AS mature_n,
      avg(ls.total) AS avg_readiness,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.calls c
          WHERE c.lead_id = l.id AND c.outcome = 'held'
        )
      )::bigint AS held_n,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.calls c
          WHERE c.lead_id = l.id AND c.outcome = 'no_show'
        )
      )::bigint AS noshow_n,
      count(*) FILTER (
        WHERE l.opted_in_at <= v_cutoff
          AND EXISTS (
            SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
          )
      )::bigint AS closed_n
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT rs.total
      FROM public.readiness_scores rs
      WHERE rs.lead_id = l.id
      ORDER BY rs.created_at DESC
      LIMIT 1
    ) ls ON true
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
    GROUP BY 1, 2
  ) raw,
  LATERAL (
    SELECT
      raw.*,
      CASE WHEN raw.avg_readiness IS NULL THEN NULL ELSE trunc(raw.avg_readiness * 10) / 10 END
        AS avg_readiness_trunc,
      public.reporting_rate(raw.held_n, raw.held_n + raw.noshow_n, public.reporting_diag_min(), false)
        AS show_rate,
      public.reporting_rate(raw.closed_n, raw.mature_n, public.reporting_rate_min(), true)
        AS clients_per_hundred,
      (
        raw.avg_readiness IS NOT NULL
        AND raw.avg_readiness >= COALESCE(v_cfg.ready_threshold, 60)
        AND (public.reporting_rate(raw.closed_n, raw.mature_n, public.reporting_rate_min(), true) ->> 'per_hundred') IS NOT NULL
        AND v_org_rate IS NOT NULL
        AND (public.reporting_rate(raw.closed_n, raw.mature_n, public.reporting_rate_min(), true) ->> 'per_hundred')::numeric
          < v_org_rate
      ) AS high_readiness_low_close
  ) s;

  SELECT elem INTO v_flag
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem
  WHERE COALESCE((elem ->> 'high_readiness_low_close')::boolean, false)
  ORDER BY (elem ->> 'n')::bigint DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'lineage', 'leads + readiness_scores + calls + revenue_log',
    'rows', v_rows,
    'high_readiness_low_close', v_flag
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_terminal(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_n bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  WITH classified AS (
    SELECT
      l.id,
      CASE
        WHEN l.first_human_touch_at IS NULL THEN 'never_touched'
        WHEN l.status = 'no_show'
          OR (
            EXISTS (
              SELECT 1 FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'no_show'
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'held'
            )
          )
        THEN 'no_show'
        WHEN l.status = 'ghost'
          AND (
            SELECT count(*) FROM public.calls c WHERE c.lead_id = l.id AND c.outcome = 'held'
          ) = 1
        THEN 'ghosted_after_one_call'
        WHEN EXISTS (
          SELECT 1 FROM public.objections ob
          WHERE ob.lead_id = l.id AND ob.resolved = false
        ) AND l.status IN ('closed_lost', 'objection_hold', 'ghost')
        THEN 'objection_unresolved'
        WHEN l.status = 'closed_lost' THEN 'explicit_no'
        ELSE 'other_terminal'
      END AS cause
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.status IN ('ghost', 'closed_lost', 'no_show')
      AND NOT EXISTS (
        SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
      )
  )
  SELECT count(*),
         COALESCE(
           jsonb_agg(jsonb_build_object('cause', cause, 'n', n) ORDER BY n DESC, cause),
           '[]'::jsonb
         )
  INTO v_n, v_rows
  FROM (
    SELECT cause, count(*)::bigint AS n FROM classified GROUP BY cause
  ) s;

  RETURN jsonb_build_object(
    'lineage', 'leads.status, leads.first_human_touch_at, calls.outcome, objections.resolved, revenue_log',
    'n', COALESCE(v_n, 0),
    'too_small', COALESCE(v_n, 0) < public.reporting_diag_min(),
    'rows', CASE WHEN COALESCE(v_n, 0) < public.reporting_diag_min() THEN '[]'::jsonb ELSE v_rows END,
    'suppressed_plain', CASE
      WHEN COALESCE(v_n, 0) < public.reporting_diag_min()
      THEN 'Not enough terminal outcomes in this range to treat the split as a finding.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_speed(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_window integer;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  v_rows jsonb;
  v_n bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT speed_to_lead_minutes INTO v_window FROM public.score_configs WHERE org_id = p_org_id;
  v_window := COALESCE(v_window, 15);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));
  v_cutoff := now() - make_interval(days => o.sales_cycle_days);

  WITH bucketed AS (
    SELECT
      CASE
        WHEN first_human_touch_at IS NULL THEN 'never'
        WHEN first_human_touch_at <= opted_in_at + make_interval(mins => v_window) THEN 'within_window'
        WHEN first_human_touch_at <= opted_in_at + interval '1 hour' THEN 'one_hour'
        WHEN first_human_touch_at <= opted_in_at + interval '4 hours' THEN 'four_hours'
        WHEN first_human_touch_at <= opted_in_at + interval '24 hours' THEN 'one_day'
        ELSE 'over_one_day'
      END AS bucket,
      EXISTS (
        SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
      ) AS closed
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff
  )
  SELECT count(*),
         COALESCE(jsonb_agg(row_to_json(s) ORDER BY array_position(
           ARRAY['within_window','one_hour','four_hours','one_day','over_one_day','never'],
           s.bucket
         )), '[]'::jsonb)
  INTO v_n, v_rows
  FROM (
    SELECT
      bucket,
      count(*)::bigint AS n,
      count(*) FILTER (WHERE closed)::bigint AS closed,
      public.reporting_rate(
        count(*) FILTER (WHERE closed)::bigint,
        count(*)::bigint,
        public.reporting_diag_min(),
        true
      ) AS close_rate
    FROM bucketed
    GROUP BY bucket
  ) s;

  RETURN jsonb_build_object(
    'lineage', 'leads.first_human_touch_at - leads.opted_in_at, revenue_log, score_configs.speed_to_lead_minutes',
    'speed_to_lead_minutes', v_window,
    'n', COALESCE(v_n, 0),
    'too_small', COALESCE(v_n, 0) < public.reporting_diag_min(),
    'correlation_caveat', 'This is a segmentation of this workspace''s own data, not a claim that speed caused the close.',
    'rows', CASE WHEN COALESCE(v_n, 0) < public.reporting_diag_min() THEN '[]'::jsonb ELSE v_rows END,
    'suppressed_plain', CASE
      WHEN COALESCE(v_n, 0) < public.reporting_diag_min()
      THEN 'Not enough mature leads in this range to segment close rate by speed-to-lead.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_ingestion(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received bigint;
  v_processed bigint;
  v_dead bigint;
  v_types jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'processed' OR processed),
    count(*) FILTER (WHERE status = 'dead')
  INTO v_received, v_processed, v_dead
  FROM public.webhook_events
  WHERE org_id = p_org_id
    AND received_at >= p_from
    AND received_at < p_to;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.n DESC), '[]'::jsonb)
  INTO v_types
  FROM (
    SELECT event_type, count(*)::bigint AS n
    FROM public.webhook_events
    WHERE org_id = p_org_id AND received_at >= p_from AND received_at < p_to
    GROUP BY event_type
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'webhook_events',
    'note', 'Counted by event received_at in the selected range, not by lead opt-in.',
    'received', COALESCE(v_received, 0),
    'processed', COALESCE(v_processed, 0),
    'dead', COALESCE(v_dead, 0),
    'by_type', v_types
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_contribution(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cov jsonb;
  v_out jsonb;
  v_fu jsonb;
  v_live_start timestamptz;
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_touched bigint;
  v_n bigint;
  v_base_cov numeric;
  v_items jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));
  v_cov := public.reporting_compute_coverage(p_org_id, p_from, p_to);
  v_out := public.reporting_compute_outcome(p_org_id, p_from, p_to);
  v_fu := public.reporting_compute_follow_up(p_org_id, p_from, p_to);
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;

  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_n, v_touched
  FROM public.leads
  WHERE org_id = p_org_id AND opted_in_at >= v_live_start AND opted_in_at < p_to;

  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'claim', 'Leads in this range that received a human touch',
    'n', v_touched,
    'of', v_n,
    'measurable', true
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'claim', 'Leads that went ghost with no human touch',
    'n', (v_cov ->> 'ghosted_no_touch')::bigint,
    'measurable', true
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'claim', 'Follow-up drafts the team sent after review',
    'n', (v_fu ->> 'sent')::bigint,
    'measurable', true
  ));

  IF v_run.grade IN ('usable', 'partial') THEN
    SELECT
      CASE WHEN count(*) = 0 THEN NULL
      ELSE trunc((count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)::numeric * 100 / count(*)) * 10) / 10
      END
    INTO v_base_cov
    FROM public.baseline_leads
    WHERE org_id = p_org_id AND run_id = v_run.id AND created_at_crm IS NOT NULL;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'claim', 'Human-touch coverage after activation versus backfilled history',
      'after_pct', v_cov #>> '{ever_touched,pct}',
      'baseline_pct', v_base_cov,
      'measurable', v_cov #>> '{ever_touched,pct}' IS NOT NULL AND v_base_cov IS NOT NULL,
      'note', 'Coverage is something this product measures. It is not a close and not revenue.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'lineage', 'leads.first_human_touch_at, baseline_leads, follow_up_drafts',
    'never_credits_revenue', true,
    'never_credits_closes', true,
    'attribution', 'Vistrial surfaced, scored, briefed, and drafted. The closer closed.',
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_readiness(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_dist jsonb;
  v_moved bigint;
  v_n bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT count(*) INTO v_n
  FROM public.leads l
  WHERE l.org_id = p_org_id AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    AND l.current_score IS NOT NULL;

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.bucket), '[]'::jsonb)
  INTO v_dist
  FROM (
    SELECT
      s.bucket,
      ((s.bucket - 1) * 10)::text
        || '–' ||
        CASE WHEN s.bucket = 10 THEN '100' ELSE (s.bucket * 10)::text END
        AS label,
      s.n
    FROM (
      SELECT
        CASE WHEN l.current_score >= 100 THEN 10 ELSE width_bucket(l.current_score, 0, 100, 10) END AS bucket,
        count(*)::bigint AS n
      FROM public.leads l
      WHERE l.org_id = p_org_id
        AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
        AND l.current_score IS NOT NULL
      GROUP BY 1
    ) s
  ) d;

  SELECT count(DISTINCT rs.lead_id) INTO v_moved
  FROM public.readiness_scores rs
  JOIN public.leads l ON l.id = rs.lead_id
  WHERE rs.org_id = p_org_id
    AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    AND rs.lead_id IN (
      SELECT lead_id FROM public.readiness_scores
      WHERE org_id = p_org_id
      GROUP BY lead_id
      HAVING count(*) >= 2
    );

  RETURN jsonb_build_object(
    'lineage', 'readiness_scores, leads.current_score',
    'n', COALESCE(v_n, 0),
    'distribution', v_dist,
    'leads_with_score_movement', COALESCE(v_moved, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_reporting_panel(
  p_org_id uuid,
  p_panel text,
  p_from timestamptz,
  p_to timestamptz,
  p_range_key public.reporting_range_key DEFAULT 'custom'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap public.reporting_snapshots%ROWTYPE;
  v_payload jsonb;
  v_source text := 'live';
  v_computed timestamptz := now();
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  IF p_range_key <> 'custom' THEN
    SELECT * INTO v_snap
    FROM public.reporting_snapshots
    WHERE org_id = p_org_id AND range_key = p_range_key;
    IF FOUND AND v_snap.payload ? p_panel THEN
      v_payload := v_snap.payload -> p_panel;
      v_source := 'cache';
      v_computed := v_snap.computed_at;
      RETURN v_payload || jsonb_build_object(
        'last_computed_at', v_computed,
        'source', v_source,
        'range_start', v_snap.range_start,
        'range_end', v_snap.range_end,
        'range_key', p_range_key
      );
    END IF;
  END IF;

  v_payload := CASE p_panel
    WHEN 'meta' THEN public.reporting_org_state(p_org_id)
    WHEN 'outcome' THEN public.reporting_compute_outcome(p_org_id, p_from, p_to)
    WHEN 'coverage' THEN public.reporting_compute_coverage(p_org_id, p_from, p_to)
    WHEN 'throughput' THEN public.reporting_compute_throughput(p_org_id, p_from, p_to)
    WHEN 'team' THEN public.reporting_compute_team(p_org_id, p_from, p_to)
    WHEN 'follow_up' THEN public.reporting_compute_follow_up(p_org_id, p_from, p_to)
    WHEN 'objections' THEN public.reporting_compute_objections(p_org_id, p_from, p_to)
    WHEN 'sources' THEN public.reporting_compute_sources(p_org_id, p_from, p_to)
    WHEN 'terminal' THEN public.reporting_compute_terminal(p_org_id, p_from, p_to)
    WHEN 'speed' THEN public.reporting_compute_speed(p_org_id, p_from, p_to)
    WHEN 'ingestion' THEN public.reporting_compute_ingestion(p_org_id, p_from, p_to)
    WHEN 'contribution' THEN public.reporting_compute_contribution(p_org_id, p_from, p_to)
    WHEN 'readiness' THEN public.reporting_compute_readiness(p_org_id, p_from, p_to)
    ELSE NULL
  END;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'unknown reporting panel';
  END IF;

  RETURN v_payload || jsonb_build_object(
    'last_computed_at', v_computed,
    'source', v_source,
    'range_start', p_from,
    'range_end', p_to,
    'range_key', p_range_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_build_snapshot_payload(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  RETURN jsonb_build_object(
    'meta', public.reporting_org_state(p_org_id),
    'outcome', public.reporting_compute_outcome(p_org_id, p_from, p_to),
    'coverage', public.reporting_compute_coverage(p_org_id, p_from, p_to),
    'throughput', public.reporting_compute_throughput(p_org_id, p_from, p_to),
    'team', public.reporting_compute_team(p_org_id, p_from, p_to),
    'follow_up', public.reporting_compute_follow_up(p_org_id, p_from, p_to),
    'objections', public.reporting_compute_objections(p_org_id, p_from, p_to),
    'sources', public.reporting_compute_sources(p_org_id, p_from, p_to),
    'terminal', public.reporting_compute_terminal(p_org_id, p_from, p_to),
    'speed', public.reporting_compute_speed(p_org_id, p_from, p_to),
    'ingestion', public.reporting_compute_ingestion(p_org_id, p_from, p_to),
    'contribution', public.reporting_compute_contribution(p_org_id, p_from, p_to),
    'readiness', public.reporting_compute_readiness(p_org_id, p_from, p_to)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_refresh_org_snapshot(
  p_org_id uuid,
  p_job_run_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_now timestamptz := date_trunc('hour', now());
  v_count integer := 0;
  v_from timestamptz;
  v_to timestamptz;
  v_key public.reporting_range_key;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF o.activated_at IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_key IN ARRAY ARRAY[
    'since_activation'::public.reporting_range_key,
    'last_30d'::public.reporting_range_key,
    'last_90d'::public.reporting_range_key
  ] LOOP
    IF v_key = 'since_activation' THEN
      v_from := o.activated_at;
      v_to := v_now;
    ELSIF v_key = 'last_30d' THEN
      v_from := GREATEST(o.activated_at, v_now - interval '30 days');
      v_to := v_now;
    ELSE
      v_from := GREATEST(o.activated_at, v_now - interval '90 days');
      v_to := v_now;
    END IF;

    INSERT INTO public.reporting_snapshots (
      org_id, range_key, range_start, range_end, payload, computed_at, job_run_id
    ) VALUES (
      p_org_id,
      v_key,
      v_from,
      v_to,
      public.reporting_build_snapshot_payload(p_org_id, v_from, v_to),
      now(),
      p_job_run_id
    )
    ON CONFLICT (org_id, range_key) DO UPDATE
    SET range_start = excluded.range_start,
        range_end = excluded.range_end,
        payload = excluded.payload,
        computed_at = excluded.computed_at,
        job_run_id = excluded.job_run_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_mature_cohorts(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_cutoff date;
  v_count integer := 0;
  v_run uuid;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_cutoff := (now() - make_interval(days => o.sales_cycle_days))::date;

  IF o.activated_at IS NOT NULL THEN
    INSERT INTO public.reporting_cohorts (
      org_id, side, period_start, lead_count, closed_count, status, matured_at, computed_at
    )
    SELECT
      p_org_id,
      'live',
      s.period_start,
      s.lead_count,
      s.closed_count,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN 'mature'::public.reporting_cohort_status
        ELSE 'maturing'::public.reporting_cohort_status
      END,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN now()
        ELSE NULL
      END,
      now()
    FROM (
      SELECT
        date_trunc('month', l.opted_in_at AT TIME ZONE o.timezone)::date AS period_start,
        count(*)::integer AS lead_count,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id
          )
        )::integer AS closed_count
      FROM public.leads l
      WHERE l.org_id = p_org_id AND l.opted_in_at >= o.activated_at
      GROUP BY 1
    ) s
    ON CONFLICT (org_id, side, period_start) DO UPDATE
    SET lead_count = excluded.lead_count,
        closed_count = excluded.closed_count,
        status = excluded.status,
        matured_at = CASE
          WHEN reporting_cohorts.status = 'maturing'
           AND excluded.status = 'mature'
          THEN now()
          ELSE reporting_cohorts.matured_at
        END,
        computed_at = now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  SELECT id INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id AND status = 'completed' AND grade IN ('usable', 'partial')
  ORDER BY created_at DESC, id DESC LIMIT 1;

  IF v_run IS NOT NULL THEN
    INSERT INTO public.reporting_cohorts (
      org_id, side, period_start, lead_count, closed_count, status, matured_at, computed_at
    )
    SELECT
      p_org_id,
      'baseline',
      s.period_start,
      s.lead_count,
      s.closed_count,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN 'mature'::public.reporting_cohort_status
        ELSE 'maturing'::public.reporting_cohort_status
      END,
      CASE
        WHEN (s.period_start + interval '1 month' - interval '1 day')::date <= v_cutoff
        THEN now() ELSE NULL
      END,
      now()
    FROM (
      SELECT
        date_trunc('month', b.created_at_crm AT TIME ZONE o.timezone)::date AS period_start,
        count(*)::integer AS lead_count,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.baseline_revenue r
            WHERE r.baseline_lead_id = b.id AND r.org_id = b.org_id
          )
        )::integer AS closed_count
      FROM public.baseline_leads b
      WHERE b.org_id = p_org_id AND b.run_id = v_run AND b.created_at_crm IS NOT NULL
      GROUP BY 1
    ) s
    ON CONFLICT (org_id, side, period_start) DO UPDATE
    SET lead_count = excluded.lead_count,
        closed_count = excluded.closed_count,
        status = excluded.status,
        matured_at = CASE
          WHEN reporting_cohorts.status = 'maturing' AND excluded.status = 'mature'
          THEN now() ELSE reporting_cohorts.matured_at
        END,
        computed_at = now();
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_caller_allowed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_require_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_baseline_backfill(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.skip_baseline_backfill(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_baseline_run() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_baseline_run(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_baseline_run(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_self_reported_baseline(uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_grade_baseline(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_org_activated(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.load_reporting_panel(uuid, text, timestamptz, timestamptz, public.reporting_range_key) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_refresh_org_snapshot(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_mature_cohorts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_build_snapshot_payload(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reporting_caller_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_require_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_rate(bigint, bigint, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_trunc_delta(numeric, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_baseline_backfill(uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.skip_baseline_backfill(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_baseline_run() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_baseline_run(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_baseline_run(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_self_reported_baseline(uuid, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_grade_baseline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_org_activated(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reporting_org_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_outcome(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_coverage(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_throughput(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_team(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_follow_up(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_objections(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_sources(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_terminal(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_speed(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_ingestion(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_contribution(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_compute_readiness(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_reporting_panel(uuid, text, timestamptz, timestamptz, public.reporting_range_key) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_build_snapshot_payload(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_refresh_org_snapshot(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_mature_cohorts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_rate_min() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_diag_min() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reporting_org_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_outcome(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_coverage(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_throughput(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_team(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_follow_up(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_objections(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_sources(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_terminal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_speed(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_ingestion(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_contribution(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_compute_readiness(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_rate(bigint, bigint, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_trunc_delta(numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_rate_min() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reporting_diag_min() FROM PUBLIC, anon;
