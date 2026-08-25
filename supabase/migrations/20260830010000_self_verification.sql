-- Prompt 20: self-verification records, cost, reporting recompute, and DA audit.

ALTER TABLE public.call_extractions
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS verification_faults jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_attempt int NOT NULL DEFAULT 0;

ALTER TABLE public.call_extractions
  DROP CONSTRAINT IF EXISTS call_extractions_verification_status_check;

ALTER TABLE public.call_extractions
  ADD CONSTRAINT call_extractions_verification_status_check
  CHECK (verification_status IN ('unchecked', 'passed', 'needs_review'));

ALTER TABLE public.follow_up_drafts
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS verification_faults jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_attempt int NOT NULL DEFAULT 0;

ALTER TABLE public.follow_up_drafts
  DROP CONSTRAINT IF EXISTS follow_up_drafts_verification_status_check;

ALTER TABLE public.follow_up_drafts
  ADD CONSTRAINT follow_up_drafts_verification_status_check
  CHECK (verification_status IN ('unchecked', 'passed', 'needs_review'));

ALTER TABLE public.operator_run_confirmations
  ADD COLUMN IF NOT EXISTS verification_gate text NOT NULL DEFAULT 'confirm',
  ADD COLUMN IF NOT EXISTS verification_faults jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.operator_run_confirmations
  DROP CONSTRAINT IF EXISTS operator_run_confirmations_verification_gate_check;

ALTER TABLE public.operator_run_confirmations
  ADD CONSTRAINT operator_run_confirmations_verification_gate_check
  CHECK (verification_gate IN ('confirm', 'question'));

CREATE TABLE IF NOT EXISTS public.verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  task text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  attempt int NOT NULL DEFAULT 1,
  retry_happened boolean NOT NULL DEFAULT false,
  stage_caught text,
  final_state text NOT NULL,
  faults jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_invoked boolean NOT NULL DEFAULT false,
  model text,
  input_tokens int,
  output_tokens int,
  skipped_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_runs_task_check CHECK (
    task IN ('extraction', 'draft', 'agent_plan', 'agent_response', 'reporting')
  ),
  CONSTRAINT verification_runs_final_state_check CHECK (
    final_state IN ('passed', 'flagged', 'corrected', 'blocked', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS verification_runs_org_created_idx
  ON public.verification_runs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verification_runs_task_state_idx
  ON public.verification_runs (task, final_state, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.verification_runs (id) ON DELETE SET NULL,
  task text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_usage_org_created_idx
  ON public.verification_usage (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_task_settings (
  task text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  disabled_reason text,
  disabled_by uuid,
  disabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_task_settings_task_check CHECK (
    task IN ('extraction', 'draft', 'agent_plan', 'agent_response', 'reporting')
  )
);

INSERT INTO public.verification_task_settings (task, enabled)
VALUES
  ('extraction', true),
  ('draft', true),
  ('agent_plan', true),
  ('agent_response', true),
  ('reporting', true)
ON CONFLICT (task) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.verification_sample_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.verification_runs (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  task text NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  missed_fault_count int,
  reviewer_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS verification_sample_audits_pending_idx
  ON public.verification_sample_audits (reviewed, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_injected_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL,
  fault_type text NOT NULL,
  caught boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification_false_positives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  task text NOT NULL,
  subject_id uuid,
  run_id uuid REFERENCES public.verification_runs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_task_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_sample_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_injected_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_false_positives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verification_runs_select ON public.verification_runs;
CREATE POLICY verification_runs_select ON public.verification_runs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS verification_usage_select ON public.verification_usage;
CREATE POLICY verification_usage_select ON public.verification_usage
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS verification_task_settings_select ON public.verification_task_settings;
CREATE POLICY verification_task_settings_select ON public.verification_task_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS verification_sample_audits_select ON public.verification_sample_audits;
CREATE POLICY verification_sample_audits_select ON public.verification_sample_audits
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS verification_injected_runs_select ON public.verification_injected_runs;
CREATE POLICY verification_injected_runs_select ON public.verification_injected_runs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS verification_false_positives_select ON public.verification_false_positives;
CREATE POLICY verification_false_positives_select ON public.verification_false_positives
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.verification_runs TO authenticated;
GRANT SELECT ON public.verification_usage TO authenticated;
GRANT SELECT ON public.verification_task_settings TO authenticated;
GRANT SELECT ON public.verification_sample_audits TO authenticated;
GRANT SELECT ON public.verification_injected_runs TO authenticated;
GRANT SELECT ON public.verification_false_positives TO authenticated;

GRANT ALL ON public.verification_runs TO service_role;
GRANT ALL ON public.verification_usage TO service_role;
GRANT ALL ON public.verification_task_settings TO service_role;
GRANT ALL ON public.verification_sample_audits TO service_role;
GRANT ALL ON public.verification_injected_runs TO service_role;
GRANT ALL ON public.verification_false_positives TO service_role;

CREATE OR REPLACE FUNCTION public.reporting_recompute_outcome(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  n bigint := 0;
  k bigint := 0;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_cutoff := now() - make_interval(days => o.sales_cycle_days);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_to));

  -- Same window as reporting_compute_outcome. Independent path: JOIN + DISTINCT, not EXISTS.
  IF o.activated_at IS NOT NULL THEN
    SELECT count(*)::bigint INTO n
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;

    SELECT count(DISTINCT l.id)::bigint INTO k
    FROM public.leads l
    INNER JOIN public.revenue_log r
      ON r.lead_id = l.id
     AND r.org_id = l.org_id
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;
  END IF;

  RETURN public.reporting_rate(k, n, public.reporting_rate_min(), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_integrity_snapshot(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  closed_won_without_revenue int;
  phantom_touches int;
  score_drift int;
BEGIN
  IF p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not_org_member';
  END IF;

  SELECT count(*)::int INTO closed_won_without_revenue
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND l.status = 'closed_won'
    AND NOT EXISTS (
      SELECT 1 FROM public.revenue_log r
      WHERE r.lead_id = l.id AND r.org_id = l.org_id
    );

  SELECT count(*)::int INTO phantom_touches
  FROM public.touches t
  WHERE t.org_id = p_org_id
    AND t.occurred_at > now() + interval '1 hour';

  SELECT count(*)::int INTO score_drift
  FROM public.leads l
  LEFT JOIN LATERAL (
    SELECT s.total
    FROM public.readiness_scores s
    WHERE s.lead_id = l.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE l.org_id = p_org_id
    AND l.current_score IS DISTINCT FROM latest.total;

  RETURN jsonb_build_object(
    'closedWonWithoutRevenue', closed_won_without_revenue,
    'phantomTouches', phantom_touches,
    'scoreDrift', score_drift,
    'ok', closed_won_without_revenue = 0 AND phantom_touches = 0 AND score_drift = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_verification_task_enabled(
  p_task text,
  p_enabled boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin_required';
  END IF;

  IF p_task NOT IN ('extraction', 'draft', 'agent_plan', 'agent_response', 'reporting') THEN
    RAISE EXCEPTION 'unknown_verification_task';
  END IF;

  INSERT INTO public.verification_task_settings (task, enabled, disabled_reason, disabled_by, disabled_at, updated_at)
  VALUES (
    p_task,
    p_enabled,
    CASE WHEN p_enabled THEN NULL ELSE nullif(btrim(coalesce(p_reason, '')), '') END,
    CASE WHEN p_enabled THEN NULL ELSE auth.uid() END,
    CASE WHEN p_enabled THEN NULL ELSE now() END,
    now()
  )
  ON CONFLICT (task) DO UPDATE SET
    enabled = excluded.enabled,
    disabled_reason = excluded.disabled_reason,
    disabled_by = excluded.disabled_by,
    disabled_at = excluded.disabled_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_verification_false_positive(
  p_org_id uuid,
  p_task text,
  p_subject_id uuid DEFAULT NULL,
  p_run_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not_org_member';
  END IF;

  INSERT INTO public.verification_false_positives (org_id, task, subject_id, run_id)
  VALUES (p_org_id, p_task, p_subject_id, p_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_verification_sample_audit(
  p_id uuid,
  p_missed_fault_count int,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin_required';
  END IF;

  UPDATE public.verification_sample_audits
  SET
    reviewed = true,
    missed_fault_count = greatest(0, p_missed_fault_count),
    reviewer_id = auth.uid(),
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    reviewed_at = now()
  WHERE id = p_id
    AND reviewed = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sample_audit_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_recompute_outcome(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reporting_integrity_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_verification_task_enabled(text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_verification_false_positive(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_verification_sample_audit(uuid, int, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reporting_recompute_outcome(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reporting_integrity_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_verification_task_enabled(text, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_verification_false_positive(uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_verification_sample_audit(uuid, int, text) TO authenticated, service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'verification-audit',
  '40 5 * * *',
  86400,
  43200,
  'Open Operator → Verification. Confirm the injected-fault suite still catches fabricated quotes, wrong speakers, unsupported claims, and invented commitments. If pass rate is near 100% or catch rate is poor, turn that task off.'
)
ON CONFLICT (job_name) DO UPDATE SET
  cron_expr = excluded.cron_expr,
  interval_seconds = excluded.interval_seconds,
  grace_seconds = excluded.grace_seconds,
  check_first = excluded.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
VALUES ('verification-audit', now(), now())
ON CONFLICT (job_name) DO NOTHING;
