-- Assay: explainable lead scores, queue order, tasks, and draft requests.
-- Scoring rows are workspace data. Historic and rules-change jobs do not create tasks.

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'assay_hot';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'assay_jump';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'assay_quiet';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'assay_no_show';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'assay_summary';

CREATE TABLE IF NOT EXISTS public.assay_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  version integer NOT NULL,
  template_slug text NOT NULL,
  weights jsonb NOT NULL,
  tiers jsonb NOT NULL,
  decay_days integer NOT NULL,
  confidence_min text NOT NULL DEFAULT 'medium',
  triggers jsonb NOT NULL,
  caps jsonb NOT NULL,
  rules jsonb NOT NULL,
  note text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (org_id, version),
  CONSTRAINT assay_rule_versions_note_present CHECK (char_length(btrim(note)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS assay_rule_versions_one_active
  ON public.assay_rule_versions (org_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.assay_lead_scores (
  lead_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier text NOT NULL CHECK (tier IN ('hot', 'warm', 'cool', 'cold')),
  display_tier text NOT NULL CHECK (display_tier IN ('hot', 'warm', 'cool', 'cold', 'do_not_contact')),
  early boolean NOT NULL DEFAULT false,
  no_call boolean NOT NULL DEFAULT false,
  call_pending boolean NOT NULL DEFAULT false,
  fit integer NOT NULL,
  engagement integer NOT NULL,
  call_signals integer NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  unclear_call integer NOT NULL DEFAULT 0,
  rules_version_id uuid REFERENCES public.assay_rule_versions (id) ON DELETE SET NULL,
  fingerprint text NOT NULL,
  historic boolean NOT NULL DEFAULT false,
  scored_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assay_lead_scores_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assay_lead_scores_org_score_idx
  ON public.assay_lead_scores (org_id, score DESC);

CREATE TABLE IF NOT EXISTS public.assay_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  score integer NOT NULL,
  tier text NOT NULL,
  previous_score integer,
  previous_tier text,
  cause text NOT NULL,
  summary text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assay_score_history_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assay_score_history_lead_idx
  ON public.assay_score_history (org_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.assay_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  trigger text NOT NULL,
  score_before integer,
  score_after integer,
  task_id uuid,
  draft text NOT NULL DEFAULT 'none',
  owner_member_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assay_actions_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.assay_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live', 'historic', 'rules_change', 'nightly')),
  event_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'working', 'done', 'failed')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (org_id, event_key)
);

CREATE INDEX IF NOT EXISTS assay_jobs_pending_idx
  ON public.assay_jobs (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.assay_queue_prefs (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid PRIMARY KEY REFERENCES public.org_members (id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'best' CHECK (mode IN ('best', 'oldest'))
);

CREATE TABLE IF NOT EXISTS public.assay_call_signals (
  lead_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  call_id uuid,
  signals jsonb NOT NULL,
  call_at timestamptz,
  CONSTRAINT assay_call_signals_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.assay_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'dismissed')),
  summary jsonb NOT NULL,
  backtest jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.assay_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid,
  note text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assay_writeback (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  owner_confirmed_at timestamptz,
  target text NOT NULL DEFAULT 'field' CHECK (target IN ('field', 'tag')),
  field_key text,
  dry_run_completed_at timestamptz,
  kill_switch boolean NOT NULL DEFAULT false,
  last_write_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.assay_writeback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  tier text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assay_daily (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  day date NOT NULL,
  cap_hit text,
  PRIMARY KEY (org_id, day)
);

CREATE TABLE IF NOT EXISTS public.assay_workspace_state (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  last_decay_on date,
  last_learn_on date
);

ALTER TABLE public.assay_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_queue_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_writeback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_writeback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assay_workspace_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assay_scores_select ON public.assay_lead_scores;
CREATE POLICY assay_scores_select ON public.assay_lead_scores FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS assay_history_select ON public.assay_score_history;
CREATE POLICY assay_history_select ON public.assay_score_history FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS assay_rules_select ON public.assay_rule_versions;
CREATE POLICY assay_rules_select ON public.assay_rule_versions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS assay_actions_select ON public.assay_actions;
CREATE POLICY assay_actions_select ON public.assay_actions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS assay_signals_select ON public.assay_call_signals;
CREATE POLICY assay_signals_select ON public.assay_call_signals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS assay_daily_select ON public.assay_daily;
CREATE POLICY assay_daily_select ON public.assay_daily FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND public.is_platform_staff());
DROP POLICY IF EXISTS assay_proposals_select ON public.assay_proposals;
CREATE POLICY assay_proposals_select ON public.assay_proposals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND public.is_platform_staff());
DROP POLICY IF EXISTS assay_requests_select ON public.assay_change_requests;
CREATE POLICY assay_requests_select ON public.assay_change_requests FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS assay_requests_insert ON public.assay_change_requests;
CREATE POLICY assay_requests_insert ON public.assay_change_requests FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND (member_id IS NULL OR member_id = public.user_member_id(org_id))
  );
DROP POLICY IF EXISTS assay_prefs_all ON public.assay_queue_prefs;
CREATE POLICY assay_prefs_all ON public.assay_queue_prefs FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND member_id = public.user_member_id(org_id))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()) AND member_id = public.user_member_id(org_id));
DROP POLICY IF EXISTS assay_writeback_select ON public.assay_writeback;
CREATE POLICY assay_writeback_select ON public.assay_writeback FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.assay_lead_scores, public.assay_score_history, public.assay_rule_versions,
  public.assay_actions, public.assay_call_signals, public.assay_change_requests, public.assay_writeback,
  public.assay_queue_prefs
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assay_queue_prefs TO authenticated;
GRANT INSERT ON public.assay_change_requests TO authenticated;
GRANT ALL ON public.assay_rule_versions, public.assay_lead_scores, public.assay_score_history, public.assay_actions,
  public.assay_jobs, public.assay_queue_prefs, public.assay_call_signals, public.assay_proposals,
  public.assay_change_requests, public.assay_writeback, public.assay_writeback_log, public.assay_daily,
  public.assay_workspace_state
  TO service_role;

ALTER TABLE public.next_actions DROP CONSTRAINT IF EXISTS next_actions_source_kind_check;
ALTER TABLE public.next_actions
  ADD CONSTRAINT next_actions_source_kind_check
  CHECK (source_kind IN ('person', 'sentry', 'scribe', 'playbook', 'booking', 'service_team', 'assay'));

ALTER TABLE public.relay_jobs ADD COLUMN IF NOT EXISTS context_note text
  CHECK (context_note IS NULL OR char_length(context_note) <= 300);
ALTER TABLE public.relay_jobs DROP CONSTRAINT IF EXISTS relay_jobs_trigger_check;
ALTER TABLE public.relay_jobs ADD CONSTRAINT relay_jobs_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'sample', 'compass_request', 'assay_request', 'assay_no_show'));
ALTER TABLE public.relay_drafts DROP CONSTRAINT IF EXISTS relay_drafts_trigger_check;
ALTER TABLE public.relay_drafts ADD CONSTRAINT relay_drafts_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'follow_up', 'sample', 'compass_request', 'assay_request', 'assay_no_show'));

CREATE OR REPLACE FUNCTION public.assay_claim_jobs(p_limit integer DEFAULT 40)
RETURNS SETOF public.assay_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.assay_jobs j
  SET status = 'working'
  WHERE j.id IN (
    SELECT id FROM public.assay_jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.assay_claim_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assay_claim_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.alarm_band_leads(p_org_id uuid)
RETURNS TABLE(id uuid, opted_in_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.id, l.opted_in_at
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND NOT l.is_test
    AND NOT COALESCE(l.do_not_contact, false)
    AND NOT EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id)
    AND l.first_human_touch_at IS NULL
    AND l.opted_in_at <= now() - make_interval(
      mins => COALESCE((SELECT sc.speed_to_lead_minutes FROM public.score_configs sc WHERE sc.org_id = p_org_id), 15)
    )
  ORDER BY l.opted_in_at ASC, l.id ASC;
$$;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES ('assay', '* * * * *', 60, 180, 'Open /api/cron/assay. Confirm pending assay_jobs are draining and that historic jobs created no tasks.')
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr, interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds, check_first = EXCLUDED.check_first;

-- Carry the previous readiness number across so queues are not empty before the first Assay pass.
-- These rows are historic: they do not create tasks, alerts, or drafts.
INSERT INTO public.assay_lead_scores (
  lead_id, org_id, score, tier, display_tier, early, no_call, call_pending,
  fit, engagement, call_signals, reasons, fingerprint, historic, scored_at
)
SELECT
  l.id,
  l.org_id,
  LEAST(100, GREATEST(0, COALESCE(rs.total, l.current_score))),
  CASE
    WHEN COALESCE(rs.total, l.current_score) >= 75 THEN 'hot'
    WHEN COALESCE(rs.total, l.current_score) >= 50 THEN 'warm'
    WHEN COALESCE(rs.total, l.current_score) >= 25 THEN 'cool'
    ELSE 'cold'
  END,
  CASE
    WHEN COALESCE(l.do_not_contact, false)
      OR EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id)
    THEN 'do_not_contact'
    WHEN COALESCE(rs.total, l.current_score) >= 75 THEN 'hot'
    WHEN COALESCE(rs.total, l.current_score) >= 50 THEN 'warm'
    WHEN COALESCE(rs.total, l.current_score) >= 25 THEN 'cool'
    ELSE 'cold'
  END,
  true,
  true,
  false,
  0, 0, 0,
  '[]'::jsonb,
  'migrated',
  true,
  now()
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT rs.total
  FROM public.readiness_scores rs
  WHERE rs.lead_id = l.id AND rs.org_id = l.org_id
  ORDER BY rs.created_at DESC
  LIMIT 1
) rs ON true
WHERE NOT l.is_test
  AND COALESCE(rs.total, l.current_score) IS NOT NULL
ON CONFLICT (lead_id) DO NOTHING;

INSERT INTO public.assay_jobs (org_id, lead_id, mode, event_key)
SELECT l.org_id, l.id, 'historic', 'backfill:' || l.id::text
FROM public.leads l
WHERE NOT l.is_test
  AND l.status NOT IN ('closed_won', 'closed_lost')
ON CONFLICT (org_id, event_key) DO NOTHING;
