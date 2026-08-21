-- Prompt 12: onboarding sequence, activation gate, go-live test leads,
-- first-week health, and the DA staff console.
--
-- Product choices locked from existing code (not guesses):
-- 1. Activation is no longer set by backfill complete/skip. Those only resolve
--    the backfill prerequisite. complete_baseline_run defaults p_activate to
--    false. skip_baseline_backfill does not call mark_org_activated.
-- 2. DA staff create client orgs from /ops. Client setup step 1 still edits
--    name and timezone. Auth stays invite-only.
-- 3. Staff console is /ops (admin.vistrial.io in production). Access is
--    platform_admins / is_platform_admin(), independent of org_role.
-- 4. CRM "verified within the last hour" means ghl_connections.last_verified_at
--    within 60 minutes. The activate action re-verifies the token first.
-- 5. Speed-to-lead is "unusually wide" when speed_to_lead_minutes > 60.
-- 6. Field mapping is valid when it has been saved and at least one non-test
--    lead has a readiness_scores row.
-- 7. A worker is any active org_members row. Warning when fewer than two.
-- 8. Backfill hard requirement: completed, or skipped/unusable with
--    baseline_fallback in (self_reported, declined).
-- 9. Scoring defaults on org insert satisfy "saved and valid".
-- 10. Transcripts are not a blocker. transcript_choice is connected | manual.
-- 11. Voice examples are a warning, not a hard block.
-- 12. Override requires typing ACTIVATE plus a reason; never silent.
-- 13. Changing activated_at later requires the org slug plus a reason, and
--     sets vistrial.allow_activation_change so a direct UPDATE cannot do it.
-- 14. Go-live test leads use ghl_contact_id prefix vistrial-golive- and
--     leads.is_test. They are excluded from queue_rows, alarm_band_leads,
--     case_file_rows, and live reporting scans, then deleted.

-- ---------------------------------------------------------------------------
-- Test-lead flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS golive_run_id uuid;

CREATE INDEX IF NOT EXISTS leads_org_live_idx
  ON public.leads (org_id, opted_in_at)
  WHERE NOT is_test;

COMMENT ON COLUMN public.leads.is_test IS
  'Go-live verification lead. Excluded from the queue, case files, and live metrics. Deleted after the check.';

-- ---------------------------------------------------------------------------
-- Onboarding enums + tables
-- ---------------------------------------------------------------------------

CREATE TYPE public.onboarding_step AS ENUM (
  'organization',
  'crm',
  'backfill',
  'field_mapping',
  'scoring',
  'team',
  'transcripts',
  'voice',
  'review'
);

CREATE TYPE public.transcript_choice AS ENUM ('connected', 'manual');

CREATE TYPE public.baseline_fallback AS ENUM ('self_reported', 'declined');

CREATE TYPE public.golive_run_status AS ENUM ('running', 'passed', 'failed');

CREATE TABLE public.org_onboarding (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  last_visited_step public.onboarding_step NOT NULL DEFAULT 'organization',
  transcript_choice public.transcript_choice,
  baseline_fallback public.baseline_fallback,
  field_maps_saved_at timestamptz,
  voice_acknowledged_empty boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_invites DROP CONSTRAINT org_invites_role_invitable;
ALTER TABLE public.org_invites ADD CONSTRAINT org_invites_role_invitable CHECK (
  role = ANY (ARRAY['owner', 'admin', 'closer', 'setter']::public.org_role[])
);

COMMENT ON TABLE public.org_onboarding IS
  'Setup progress that cannot be derived from live config: transcript choice, unusable-backfill fallback, last visited step.';

CREATE TRIGGER org_onboarding_set_updated_at
  BEFORE UPDATE ON public.org_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  activated_at timestamptz NOT NULL,
  warnings_acknowledged text[] NOT NULL DEFAULT '{}',
  override boolean NOT NULL DEFAULT false,
  override_reason text,
  unmet_hard jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activation_events_override_reason CHECK (
    (NOT override) OR (override_reason IS NOT NULL AND char_length(btrim(override_reason)) >= 8)
  )
);

CREATE INDEX activation_events_org_idx ON public.activation_events (org_id, created_at DESC);

COMMENT ON TABLE public.activation_events IS
  'Who activated, when, which warnings they acknowledged, and whether they overrode unmet hard requirements.';

CREATE TABLE public.activation_timestamp_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  previous_at timestamptz,
  next_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activation_timestamp_changes_reason_present CHECK (char_length(btrim(reason)) >= 8)
);

CREATE INDEX activation_timestamp_changes_org_idx
  ON public.activation_timestamp_changes (org_id, created_at DESC);

COMMENT ON TABLE public.activation_timestamp_changes IS
  'Deliberate post-activation timestamp edits. Every historical outcome figure will shift.';

CREATE TABLE public.golive_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  status public.golive_run_status NOT NULL DEFAULT 'running',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  lead_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX golive_runs_org_idx ON public.golive_runs (org_id, created_at DESC);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_golive_run_fkey
  FOREIGN KEY (golive_run_id) REFERENCES public.golive_runs (id) ON DELETE SET NULL;

CREATE TABLE public.staff_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_access_log_action_present CHECK (char_length(btrim(action)) > 0)
);

CREATE INDEX staff_access_log_staff_idx ON public.staff_access_log (staff_user_id, created_at DESC);
CREATE INDEX staff_access_log_org_idx ON public.staff_access_log (org_id, created_at DESC);

COMMENT ON TABLE public.staff_access_log IS
  'Every cross-org staff access: who, what, when, which org. Inserts go through log_staff_access.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_timestamp_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golive_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_onboarding_select
  ON public.org_onboarding FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY org_onboarding_update
  ON public.org_onboarding FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY org_onboarding_insert
  ON public.org_onboarding FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY activation_events_select
  ON public.activation_events FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY activation_timestamp_changes_select
  ON public.activation_timestamp_changes FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.is_platform_admin()
  );

CREATE POLICY golive_runs_select
  ON public.golive_runs FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.is_platform_admin()
  );

CREATE POLICY golive_runs_insert
  ON public.golive_runs FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY golive_runs_update
  ON public.golive_runs FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY staff_access_log_select
  ON public.staff_access_log FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.org_onboarding FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.activation_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.activation_timestamp_changes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.golive_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.staff_access_log FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.org_onboarding TO authenticated;
GRANT SELECT ON TABLE public.activation_events TO authenticated;
GRANT SELECT ON TABLE public.activation_timestamp_changes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.golive_runs TO authenticated;
GRANT SELECT ON TABLE public.staff_access_log TO authenticated;

GRANT ALL ON TABLE public.org_onboarding TO service_role;
GRANT ALL ON TABLE public.activation_events TO service_role;
GRANT ALL ON TABLE public.activation_timestamp_changes TO service_role;
GRANT ALL ON TABLE public.golive_runs TO service_role;
GRANT ALL ON TABLE public.staff_access_log TO service_role;

-- ---------------------------------------------------------------------------
-- Seed onboarding row with the org
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_org_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_onboarding (org_id)
  VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_ensure_onboarding
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.ensure_org_onboarding();

INSERT INTO public.org_onboarding (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- activated_at cannot be patched from a client UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_activated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    IF current_setting('vistrial.allow_activation_change', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'activation timestamp changes go through change_activation_timestamp';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_guard_activated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_activated_at();

CREATE OR REPLACE FUNCTION public.mark_org_activated(p_org_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  PERFORM set_config('vistrial.allow_activation_change', '1', true);
  UPDATE public.organizations
  SET activated_at = COALESCE(activated_at, now())
  WHERE id = p_org_id
  RETURNING activated_at INTO v_at;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_org_activated(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_org_activated(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Backfill no longer activates
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.skip_baseline_backfill(uuid, uuid);

CREATE FUNCTION public.skip_baseline_backfill(
  p_org_id uuid,
  p_member_id uuid
)
RETURNS void
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
END;
$$;

REVOKE ALL ON FUNCTION public.skip_baseline_backfill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_baseline_backfill(uuid, uuid) TO authenticated, service_role;

-- CREATE OR REPLACE does not change an existing default. Reporting created
-- this with DEFAULT true; drop first so omitted p_activate cannot activate.
DROP FUNCTION IF EXISTS public.complete_baseline_run(uuid, boolean);

CREATE FUNCTION public.complete_baseline_run(
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
  IF p_activate THEN
    PERFORM public.mark_org_activated(v_org);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_baseline_run(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_baseline_run(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Exclude test leads from operator surfaces
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.queue_rows
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.org_id,
  COALESCE(
    NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    NULLIF(btrim(l.email), ''),
    'Unnamed lead'
  ) AS name,
  l.email,
  l.source,
  l.status,
  l.lead_type,
  score.total AS score,
  CASE
    WHEN score.id IS NULL THEN NULL
    WHEN (
      (score.timeline_raw IS NOT NULL)::integer
      + (score.investment_capacity_raw IS NOT NULL)::integer
      + (score.decision_authority_raw IS NOT NULL)::integer
      + (score.pain_severity_raw IS NOT NULL)::integer
    ) >= 4 THEN 'high'
    WHEN (
      (score.timeline_raw IS NOT NULL)::integer
      + (score.investment_capacity_raw IS NOT NULL)::integer
      + (score.decision_authority_raw IS NOT NULL)::integer
      + (score.pain_severity_raw IS NOT NULL)::integer
    ) = 3 THEN 'moderate'
    WHEN (
      (score.timeline_raw IS NOT NULL)::integer
      + (score.investment_capacity_raw IS NOT NULL)::integer
      + (score.decision_authority_raw IS NOT NULL)::integer
      + (score.pain_severity_raw IS NOT NULL)::integer
    ) = 2 THEN 'low'
    WHEN (
      (score.timeline_raw IS NOT NULL)::integer
      + (score.investment_capacity_raw IS NOT NULL)::integer
      + (score.decision_authority_raw IS NOT NULL)::integer
      + (score.pain_severity_raw IS NOT NULL)::integer
    ) = 1 THEN 'very_low'
    ELSE NULL
  END AS score_confidence,
  (
    (score.timeline_raw IS NOT NULL)::integer
    + (score.investment_capacity_raw IS NOT NULL)::integer
    + (score.decision_authority_raw IS NOT NULL)::integer
    + (score.pain_severity_raw IS NOT NULL)::integer
  ) AS known_factor_count,
  score.reasoning AS score_reasoning,
  l.opted_in_at,
  l.last_touch_at,
  l.first_human_touch_at,
  l.assigned_setter_id,
  l.assigned_closer_id,
  setter.display_name AS assigned_setter_name,
  closer.display_name AS assigned_closer_name,
  l.ghl_contact_id,
  CASE
    WHEN o.ghl_location_id IS NOT NULL AND l.ghl_contact_id IS NOT NULL THEN
      'https://app.gohighlevel.com/v2/location/'
      || o.ghl_location_id
      || '/conversations/all?contactId='
      || l.ghl_contact_id
    ELSE NULL
  END AS crm_url,
  na.id AS next_action_id,
  na.action_text AS next_action_text,
  na.due_at AS next_action_due_at,
  (na.due_at IS NOT NULL AND na.due_at < now()) AS next_action_overdue,
  (
    l.first_human_touch_at IS NULL
    AND l.opted_in_at <= now() - make_interval(
      mins => COALESCE(sc.speed_to_lead_minutes, 15)
    )
  ) AS in_alarm,
  CASE
    WHEN l.first_human_touch_at IS NULL
      AND l.opted_in_at <= now() - make_interval(
        mins => COALESCE(sc.speed_to_lead_minutes, 15)
      )
    THEN EXTRACT(
      EPOCH FROM (
        now()
        - (
          l.opted_in_at
          + make_interval(mins => COALESCE(sc.speed_to_lead_minutes, 15))
        )
      )
    )::bigint
    ELSE NULL
  END AS breach_seconds,
  CASE
    WHEN l.first_human_touch_at IS NULL
      AND (l.lead_type = 'ready_track' OR l.lead_type IS NULL)
      THEN 1
    WHEN na.due_at IS NOT NULL AND na.due_at < now()
      THEN 2
    WHEN l.lead_type = 'ready_track'
      THEN 3
    WHEN l.lead_type = 'nurture_track'
      THEN 4
    WHEN l.ghost_approaching_at IS NOT NULL
      THEN 5
    ELSE NULL
  END AS urgency_rank,
  CASE
    WHEN l.lead_type IN ('ready_track', 'nurture_track')
      AND NOT (
        l.first_human_touch_at IS NULL
        AND (l.lead_type = 'ready_track' OR l.lead_type IS NULL)
      )
      AND NOT (na.due_at IS NOT NULL AND na.due_at < now())
      THEN COALESCE(score.total, l.current_score, -1)
    ELSE 0
  END AS sort_score
FROM public.leads l
JOIN public.organizations o ON o.id = l.org_id
LEFT JOIN public.score_configs sc ON sc.org_id = l.org_id
LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
LEFT JOIN LATERAL (
  SELECT
    rs.id,
    rs.total,
    rs.reasoning,
    rs.timeline_raw,
    rs.investment_capacity_raw,
    rs.decision_authority_raw,
    rs.pain_severity_raw
  FROM public.readiness_scores rs
  WHERE rs.lead_id = l.id
    AND rs.org_id = l.org_id
  ORDER BY rs.created_at DESC
  LIMIT 1
) score ON true
LEFT JOIN LATERAL (
  SELECT n.id, n.action_text, n.due_at
  FROM public.next_actions n
  WHERE n.lead_id = l.id
    AND n.org_id = l.org_id
    AND n.completed_at IS NULL
  ORDER BY n.due_at ASC NULLS LAST, n.created_at ASC
  LIMIT 1
) na ON true
WHERE NOT l.is_test;

GRANT SELECT ON public.queue_rows TO authenticated, service_role;

CREATE OR REPLACE VIEW public.case_file_rows
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.org_id,
  COALESCE(
    NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    NULLIF(btrim(l.email), ''),
    'Unnamed lead'
  ) AS name,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.source,
  l.status,
  l.lead_type,
  l.current_score AS score,
  l.opted_in_at,
  l.last_touch_at,
  l.assigned_setter_id,
  l.assigned_closer_id,
  setter.display_name AS assigned_setter_name,
  closer.display_name AS assigned_closer_name
FROM public.leads l
LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
WHERE NOT l.is_test;

GRANT SELECT ON public.case_file_rows TO authenticated, service_role;

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
    AND l.first_human_touch_at IS NULL
    AND l.opted_in_at <= now() - make_interval(
      mins => COALESCE(
        (
          SELECT sc.speed_to_lead_minutes
          FROM public.score_configs sc
          WHERE sc.org_id = p_org_id
        ),
        15
      )
    )
  ORDER BY l.opted_in_at ASC, l.id ASC;
$$;

REVOKE ALL ON FUNCTION public.alarm_band_leads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alarm_band_leads(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.load_org_queue(
  p_org_id uuid,
  p_assigned text DEFAULT NULL,
  p_track text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_score_min integer DEFAULT NULL,
  p_score_max integer DEFAULT NULL,
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_assigned text;
  v_member uuid;
  v_limit integer;
  v_crm_status text;
  v_location text;
  v_lead_count bigint;
  v_alarm jsonb;
  v_queue jsonb;
  v_members jsonb;
  v_sources jsonb;
  v_unfiltered bigint;
  v_has_more boolean;
  v_cursor_u integer;
  v_cursor_s integer;
  v_cursor_t timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_pending jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  v_member := public.user_member_id(p_org_id);
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  v_assigned := NULLIF(p_assigned, '');
  IF v_assigned IS NULL THEN
    IF public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
      v_assigned := 'all';
    ELSE
      v_assigned := 'me_or_unassigned';
    END IF;
  END IF;

  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_u := NULLIF(p_cursor->>'u', '')::integer;
    v_cursor_s := NULLIF(p_cursor->>'s', '')::integer;
    v_cursor_t := NULLIF(p_cursor->>'t', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT c.status::text
  INTO v_crm_status
  FROM public.ghl_connections c
  WHERE c.org_id = p_org_id;

  SELECT o.ghl_location_id
  INTO v_location
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_crm_status IS NULL THEN
    v_crm_status := CASE WHEN v_location IS NOT NULL THEN 'active' ELSE 'missing' END;
  END IF;

  SELECT count(*) INTO v_lead_count
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND NOT l.is_test;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'displayName', m.display_name,
      'role', m.role
    ) ORDER BY m.display_name
  ), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  WHERE m.org_id = p_org_id
    AND m.active = true;

  SELECT COALESCE(jsonb_agg(src ORDER BY src), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT DISTINCT l.source AS src
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.source IS NOT NULL
      AND btrim(l.source) <> ''
  ) s;

  SELECT COALESCE(
    jsonb_agg(public.queue_row_to_json(q) ORDER BY q.opted_in_at ASC, q.id ASC),
    '[]'::jsonb
  )
  INTO v_alarm
  FROM public.queue_rows q
  WHERE q.org_id = p_org_id
    AND q.id IN (SELECT a.id FROM public.alarm_band_leads(p_org_id) a);

  SELECT count(*)
  INTO v_unfiltered
  FROM public.queue_rows q
  WHERE q.org_id = p_org_id
    AND q.status NOT IN ('closed_won', 'closed_lost', 'ghost')
    AND q.urgency_rank IS NOT NULL
    AND NOT q.in_alarm;

  SELECT COALESCE(
    jsonb_agg(
      public.queue_row_to_json(q)
      ORDER BY q.urgency_rank ASC, q.sort_score DESC, q.last_touch_at ASC NULLS FIRST, q.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT *
    FROM public.queue_rows q
    WHERE q.org_id = p_org_id
      AND NOT q.in_alarm
      AND q.status NOT IN ('closed_won', 'closed_lost', 'ghost')
      AND q.urgency_rank IS NOT NULL
      AND (
        v_assigned = 'all'
        OR (
          v_assigned = 'me'
          AND v_member IS NOT NULL
          AND (
            q.assigned_setter_id = v_member
            OR q.assigned_closer_id = v_member
          )
        )
        OR (
          v_assigned = 'unassigned'
          AND q.assigned_setter_id IS NULL
          AND q.assigned_closer_id IS NULL
        )
        OR (
          v_assigned = 'me_or_unassigned'
          AND (
            (
              v_member IS NOT NULL
              AND (
                q.assigned_setter_id = v_member
                OR q.assigned_closer_id = v_member
              )
            )
            OR (
              q.assigned_setter_id IS NULL
              AND q.assigned_closer_id IS NULL
            )
          )
        )
      )
      AND (
        p_track IS NULL
        OR p_track = ''
        OR (p_track = 'ready' AND q.lead_type = 'ready_track')
        OR (p_track = 'nurture' AND q.lead_type = 'nurture_track')
      )
      AND (
        p_status IS NULL
        OR p_status = ''
        OR q.status = p_status::public.lead_status
      )
      AND (
        p_source IS NULL
        OR p_source = ''
        OR q.source = p_source
      )
      AND (p_score_min IS NULL OR q.score >= p_score_min)
      AND (p_score_max IS NULL OR q.score <= p_score_max)
      AND (
        v_cursor_id IS NULL
        OR (q.urgency_rank, -q.sort_score, COALESCE(q.last_touch_at, '-infinity'::timestamptz), q.id)
          > (
            v_cursor_u,
            -COALESCE(v_cursor_s, 0),
            COALESCE(v_cursor_t, '-infinity'::timestamptz),
            v_cursor_id
          )
      )
    ORDER BY q.urgency_rank ASC, q.sort_score DESC, q.last_touch_at ASC NULLS FIRST, q.id ASC
    LIMIT v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_queue
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  ELSE
    v_queue := COALESCE(v_rows, '[]'::jsonb);
  END IF;

  v_pending := public.pending_follow_up_items(p_org_id, NULL);

  RETURN jsonb_build_object(
    'crmStatus', v_crm_status,
    'ghlLocationId', v_location,
    'orgLeadCount', v_lead_count,
    'unfilteredActionableCount', v_unfiltered,
    'alarm', COALESCE(v_alarm, '[]'::jsonb),
    'queue', COALESCE(v_queue, '[]'::jsonb),
    'pendingDrafts', COALESCE(v_pending, '[]'::jsonb),
    'hasMore', v_has_more,
    'members', COALESCE(v_members, '[]'::jsonb),
    'sources', COALESCE(v_sources, '[]'::jsonb)
  );
END;
$$;

-- Inspect a lead (including test leads) with the same urgency math as queue_rows.
CREATE OR REPLACE FUNCTION public.golive_inspect_lead(p_org_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window integer;
  l public.leads%ROWTYPE;
  v_score integer;
  v_in_alarm boolean;
  v_urgency integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.user_has_org_role(p_org_id, 'owner', 'admin')
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO l FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(speed_to_lead_minutes, 15) INTO v_window
  FROM public.score_configs WHERE org_id = p_org_id;
  v_window := COALESCE(v_window, 15);

  SELECT rs.total INTO v_score
  FROM public.readiness_scores rs
  WHERE rs.lead_id = l.id AND rs.org_id = l.org_id
  ORDER BY rs.created_at DESC
  LIMIT 1;

  v_in_alarm := l.first_human_touch_at IS NULL
    AND l.opted_in_at <= now() - make_interval(mins => v_window);

  v_urgency := CASE
    WHEN l.first_human_touch_at IS NULL
      AND (l.lead_type = 'ready_track' OR l.lead_type IS NULL) THEN 1
    WHEN l.lead_type = 'ready_track' THEN 3
    WHEN l.lead_type = 'nurture_track' THEN 4
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'id', l.id,
    'isTest', l.is_test,
    'source', l.source,
    'status', l.status,
    'score', COALESCE(v_score, l.current_score),
    'inAlarm', v_in_alarm,
    'urgencyRank', v_urgency,
    'firstHumanTouchAt', l.first_human_touch_at,
    'optedInAt', l.opted_in_at,
    'inQueueView', EXISTS (SELECT 1 FROM public.queue_rows q WHERE q.id = l.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.golive_inspect_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golive_inspect_lead(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Live reporting scans ignore test leads
-- ---------------------------------------------------------------------------

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
      AND NOT l.is_test
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
      AND NOT l.is_test
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
    AND NOT is_test
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
    WHERE org_id = p_org_id AND NOT is_test AND opted_in_at >= v_live_start AND opted_in_at < p_to
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
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT count(DISTINCT l.id) INTO v_booked
  FROM public.leads l
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
    AND (
      l.status IN ('call_booked', 'no_show', 'follow_up', 'objection_hold', 'closed_won', 'closed_lost')
      OR EXISTS (SELECT 1 FROM public.calls c WHERE c.lead_id = l.id AND c.scheduled_at IS NOT NULL)
    );

  SELECT count(DISTINCT l.id) INTO v_held
  FROM public.leads l
  JOIN public.calls c ON c.lead_id = l.id AND c.org_id = l.org_id AND c.outcome = 'held'
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

  SELECT count(DISTINCT l.id) INTO v_noshow
  FROM public.leads l
  JOIN public.calls c ON c.lead_id = l.id AND c.org_id = l.org_id AND c.outcome = 'no_show'
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to;

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
          AND NOT l.is_test
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

-- ---------------------------------------------------------------------------
-- Setup state + activation gate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.onboarding_manager_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        public.user_has_org_role(
          p_org_id,
          VARIADIC ARRAY['owner'::public.org_role, 'admin'::public.org_role]
        )
        OR public.is_platform_admin()
      ELSE
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_activation_gate(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_onb public.org_onboarding%ROWTYPE;
  v_conn public.ghl_connections%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_cfg public.score_configs%ROWTYPE;
  v_self public.self_reported_baselines%ROWTYPE;
  v_hard jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_ok boolean;
  v_crm_ok boolean;
  v_backfill_ok boolean;
  v_map_ok boolean;
  v_score_ok boolean;
  v_member_ok boolean;
  v_fallback_ok boolean;
  v_member_count integer;
  v_voice_n integer := 0;
  v_transcript_connected boolean;
BEGIN
  IF NOT public.onboarding_manager_allowed(p_org_id) THEN
    RAISE EXCEPTION 'setup is owner/admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'organization not found';
  END IF;
  SELECT * INTO v_onb FROM public.org_onboarding WHERE org_id = p_org_id;
  SELECT * INTO v_conn FROM public.ghl_connections WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs WHERE org_id = p_org_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_cfg FROM public.score_configs WHERE org_id = p_org_id;
  SELECT * INTO v_self FROM public.self_reported_baselines WHERE org_id = p_org_id;

  v_crm_ok := v_conn.status = 'active'
    AND v_conn.location_id IS NOT NULL
    AND v_conn.last_verified_at IS NOT NULL
    AND v_conn.last_verified_at >= now() - interval '1 hour';

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'crm_verified',
    'ok', v_crm_ok,
    'label', 'CRM connected and verified in the last hour',
    'fix_step', 'crm',
    'detail', CASE
      WHEN v_conn.status IS DISTINCT FROM 'active' THEN 'Connect GoHighLevel and pick a location.'
      WHEN v_conn.last_verified_at IS NULL OR v_conn.last_verified_at < now() - interval '1 hour'
        THEN 'Reconnect or re-verify the CRM token. Verification must be less than an hour old.'
      ELSE NULL
    END
  ));

  v_fallback_ok := v_onb.baseline_fallback IS NOT NULL
    OR v_self.org_id IS NOT NULL;
  IF v_run.status = 'completed' AND COALESCE(v_run.grade, 'unusable') IN ('usable', 'partial') THEN
    v_backfill_ok := true;
  ELSIF v_run.status IN ('completed', 'skipped') AND COALESCE(v_run.grade, 'unusable') = 'unusable' THEN
    v_backfill_ok := v_fallback_ok;
  ELSIF v_run.status = 'skipped' THEN
    v_backfill_ok := v_fallback_ok;
  ELSE
    v_backfill_ok := false;
  END IF;

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'backfill_resolved',
    'ok', v_backfill_ok,
    'label', 'Baseline backfill completed, or graded unusable with a fallback chosen or declined',
    'fix_step', 'backfill',
    'detail', CASE
      WHEN v_run.id IS NULL OR v_run.status IN ('queued', 'running') THEN 'Wait for the CRM history pull to finish, or skip it and choose a fallback.'
      WHEN v_run.status = 'failed' THEN 'The history pull failed. Re-run it, or skip it and choose a fallback.'
      WHEN NOT v_backfill_ok THEN 'The history pull is unusable. Enter a self-reported baseline or decline the fallback.'
      ELSE NULL
    END
  ));

  v_map_ok := v_onb.field_maps_saved_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.readiness_scores rs
      JOIN public.leads l ON l.id = rs.lead_id AND l.org_id = rs.org_id
      WHERE rs.org_id = p_org_id
        AND NOT l.is_test
    );

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'field_mapping',
    'ok', v_map_ok,
    'label', 'Field mapping saved and producing a valid score on at least one real lead',
    'fix_step', 'field_mapping',
    'detail', CASE
      WHEN v_onb.field_maps_saved_at IS NULL THEN 'Save the CRM field mapping, even if there are no custom fields to map.'
      ELSE 'Ingest at least one real lead and confirm it receives a readiness score.'
    END
  ));

  v_score_ok := v_cfg.org_id IS NOT NULL
    AND v_cfg.timeline_weight + v_cfg.investment_capacity_weight
        + v_cfg.decision_authority_weight + v_cfg.pain_severity_weight = 100
    AND v_cfg.ready_threshold BETWEEN 0 AND 100
    AND v_cfg.speed_to_lead_minutes > 0
    AND v_cfg.ghost_days_soft > 0
    AND v_cfg.ghost_days_hard > v_cfg.ghost_days_soft;

  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'scoring_config',
    'ok', v_score_ok,
    'label', 'Scoring configuration saved and valid',
    'fix_step', 'scoring',
    'detail', CASE WHEN v_score_ok THEN NULL ELSE 'Save scoring weights that sum to 100, with a ready threshold and ghost windows.' END
  ));

  SELECT count(*) INTO v_member_count
  FROM public.org_members
  WHERE org_id = p_org_id AND active = true;

  v_member_ok := v_member_count >= 1;
  v_hard := v_hard || jsonb_build_array(jsonb_build_object(
    'id', 'worker_member',
    'ok', v_member_ok,
    'label', 'At least one active member who can work leads',
    'fix_step', 'team',
    'detail', CASE WHEN v_member_ok THEN NULL ELSE 'Invite or activate a teammate who can work the queue.' END
  ));

  SELECT CASE
    WHEN jsonb_typeof(examples) = 'array' THEN jsonb_array_length(examples)
    ELSE 0
  END INTO v_voice_n
  FROM public.org_voice_profiles
  WHERE org_id = p_org_id;
  v_voice_n := COALESCE(v_voice_n, 0);

  v_transcript_connected := EXISTS (
    SELECT 1 FROM public.transcript_connections WHERE org_id = p_org_id
  );

  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'no_voice_examples',
    'applies', v_voice_n < 2,
    'label', 'No voice examples provided',
    'consequence', 'Follow-up drafts will read generic until two to five real messages are pasted.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'no_transcript_source',
    'applies', NOT v_transcript_connected AND v_onb.transcript_choice IS DISTINCT FROM 'connected',
    'label', 'No transcript recorder connected',
    'consequence', 'No extraction, pre-call briefs, or grounded follow-up until a recorder is connected or a transcript is pasted.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'thin_team',
    'applies', v_member_count < 2,
    'label', 'Fewer than two team members',
    'consequence', 'There is no coverage when the only operator is unavailable.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'wide_speed_to_lead',
    'applies', COALESCE(v_cfg.speed_to_lead_minutes, 15) > 60,
    'label', 'Speed-to-lead window is unusually wide',
    'consequence', 'The alarm will rarely fire. Leads can sit untouched for more than an hour before anyone is warned.'
  ));
  v_warn := v_warn || jsonb_build_array(jsonb_build_object(
    'id', 'partial_backfill',
    'applies', v_run.grade = 'partial',
    'label', 'Backfill graded partial',
    'consequence', 'The baseline comparison will carry a caveat. Treat the before-figure as directional, not exact.'
  ));

  SELECT bool_and((item->>'ok')::boolean) INTO v_ok
  FROM jsonb_array_elements(v_hard) item;

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'activated_at', o.activated_at,
    'can_activate', COALESCE(v_ok, false),
    'hard', v_hard,
    'warnings', v_warn,
    'member_count', v_member_count,
    'voice_example_count', v_voice_n,
    'transcript_choice', v_onb.transcript_choice,
    'baseline_fallback', v_onb.baseline_fallback,
    'last_visited_step', v_onb.last_visited_step
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_org_setup_state(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_onb public.org_onboarding%ROWTYPE;
  v_conn public.ghl_connections%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_gate jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_org_ok boolean;
  v_crm_ok boolean;
  v_backfill_ok boolean;
  v_map_ok boolean;
  v_score_ok boolean;
  v_team_ok boolean;
  v_transcript_ok boolean;
  v_voice_ok boolean;
BEGIN
  IF NOT public.onboarding_manager_allowed(p_org_id) THEN
    RAISE EXCEPTION 'setup is owner/admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO v_onb FROM public.org_onboarding WHERE org_id = p_org_id;
  SELECT * INTO v_conn FROM public.ghl_connections WHERE org_id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs WHERE org_id = p_org_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  v_gate := public.evaluate_activation_gate(p_org_id);

  v_org_ok := o.name IS NOT NULL AND btrim(o.name) <> '' AND o.timezone IS NOT NULL AND btrim(o.timezone) <> '';
  v_crm_ok := v_conn.status = 'active' AND v_conn.location_id IS NOT NULL;
  v_backfill_ok := (v_gate->'hard'->1->>'ok')::boolean;
  v_map_ok := (v_gate->'hard'->2->>'ok')::boolean;
  v_score_ok := (v_gate->'hard'->3->>'ok')::boolean;
  v_team_ok := (v_gate->'hard'->4->>'ok')::boolean;
  v_transcript_ok := v_onb.transcript_choice IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.transcript_connections WHERE org_id = p_org_id);
  v_voice_ok := COALESCE((v_gate->>'voice_example_count')::integer, 0) >= 2
    OR v_onb.voice_acknowledged_empty;

  v_steps := jsonb_build_array(
    jsonb_build_object('id', 'organization', 'complete', v_org_ok, 'locked', false),
    jsonb_build_object('id', 'crm', 'complete', v_crm_ok, 'locked', NOT v_org_ok),
    jsonb_build_object('id', 'backfill', 'complete', v_backfill_ok, 'locked', NOT v_crm_ok),
    jsonb_build_object('id', 'field_mapping', 'complete', v_map_ok, 'locked', NOT v_backfill_ok),
    jsonb_build_object('id', 'scoring', 'complete', v_score_ok AND v_map_ok, 'locked', NOT v_map_ok),
    jsonb_build_object('id', 'team', 'complete', v_team_ok AND v_score_ok AND v_map_ok, 'locked', NOT (v_score_ok AND v_map_ok)),
    jsonb_build_object('id', 'transcripts', 'complete', v_transcript_ok AND v_team_ok AND v_map_ok, 'locked', NOT (v_team_ok AND v_map_ok)),
    jsonb_build_object('id', 'voice', 'complete', v_voice_ok AND v_transcript_ok, 'locked', NOT v_transcript_ok),
    jsonb_build_object('id', 'review', 'complete', o.activated_at IS NOT NULL, 'locked', NOT v_voice_ok)
  );

  RETURN jsonb_build_object(
    'org', jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'slug', o.slug,
      'timezone', o.timezone,
      'activated_at', o.activated_at
    ),
    'last_visited_step', v_onb.last_visited_step,
    'steps', v_steps,
    'gate', v_gate,
    'backfill', CASE WHEN v_run.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_run.status,
      'grade', v_run.grade,
      'grade_reasons', to_jsonb(v_run.grade_reasons)
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_org(
  p_org_id uuid,
  p_member_id uuid,
  p_ack_warnings text[] DEFAULT '{}',
  p_override boolean DEFAULT false,
  p_override_phrase text DEFAULT NULL,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gate jsonb;
  v_warning jsonb;
  v_hard jsonb;
  v_unmet jsonb := '[]'::jsonb;
  v_at timestamptz;
  v_user uuid;
  v_item jsonb;
BEGIN
  IF NOT public.onboarding_manager_allowed(p_org_id) THEN
    RAISE EXCEPTION 'setup is owner/admin only' USING ERRCODE = '42501';
  END IF;

  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'activation requires a signed-in user';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id AND activated_at IS NOT NULL) THEN
    SELECT activated_at INTO v_at FROM public.organizations WHERE id = p_org_id;
    RETURN jsonb_build_object('ok', true, 'activated_at', v_at, 'already', true);
  END IF;

  v_gate := public.evaluate_activation_gate(p_org_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_gate->'hard')
  LOOP
    IF NOT COALESCE((v_item->>'ok')::boolean, false) THEN
      v_unmet := v_unmet || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_unmet) > 0 AND NOT p_override THEN
    RAISE EXCEPTION 'activation requirements are not met'
      USING ERRCODE = 'P0001', DETAIL = v_unmet::text;
  END IF;

  IF p_override THEN
    IF p_override_phrase IS DISTINCT FROM 'ACTIVATE' THEN
      RAISE EXCEPTION 'override requires typing ACTIVATE';
    END IF;
    IF p_override_reason IS NULL OR char_length(btrim(p_override_reason)) < 8 THEN
      RAISE EXCEPTION 'override requires a reason';
    END IF;
  END IF;

  FOR v_warning IN SELECT * FROM jsonb_array_elements(v_gate->'warnings')
  LOOP
    IF COALESCE((v_warning->>'applies')::boolean, false)
       AND NOT (v_warning->>'id' = ANY (COALESCE(p_ack_warnings, '{}'))) THEN
      RAISE EXCEPTION 'warning % must be acknowledged', v_warning->>'id';
    END IF;
  END LOOP;

  v_at := public.mark_org_activated(p_org_id);

  INSERT INTO public.activation_events (
    org_id, actor_user_id, actor_member_id, activated_at,
    warnings_acknowledged, override, override_reason, unmet_hard
  ) VALUES (
    p_org_id,
    v_user,
    p_member_id,
    v_at,
    COALESCE(p_ack_warnings, '{}'),
    p_override,
    CASE WHEN p_override THEN btrim(p_override_reason) ELSE NULL END,
    v_unmet
  );

  RETURN jsonb_build_object(
    'ok', true,
    'activated_at', v_at,
    'already', false,
    'override', p_override,
    'warnings_acknowledged', COALESCE(p_ack_warnings, '{}')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.change_activation_timestamp(
  p_org_id uuid,
  p_member_id uuid,
  p_confirm_slug text,
  p_next_at timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_user uuid;
  v_prev timestamptz;
BEGIN
  IF NOT public.onboarding_manager_allowed(p_org_id) THEN
    RAISE EXCEPTION 'setup is owner/admin only' USING ERRCODE = '42501';
  END IF;

  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'a signed-in user is required';
  END IF;

  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF o.slug IS DISTINCT FROM p_confirm_slug THEN
    RAISE EXCEPTION 'type the organization slug to confirm';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'a reason is required';
  END IF;
  IF p_next_at IS NULL THEN
    RAISE EXCEPTION 'the new activation timestamp is required';
  END IF;

  v_prev := o.activated_at;
  PERFORM set_config('vistrial.allow_activation_change', '1', true);
  UPDATE public.organizations
  SET activated_at = p_next_at
  WHERE id = p_org_id;

  INSERT INTO public.activation_timestamp_changes (
    org_id, actor_user_id, actor_member_id, previous_at, next_at, reason
  ) VALUES (
    p_org_id, v_user, p_member_id, v_prev, p_next_at, btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'previous_at', v_prev,
    'next_at', p_next_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- First-week health
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.first_week_health(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_from timestamptz;
  v_leads bigint := 0;
  v_touched bigint := 0;
  v_held bigint := 0;
  v_logged bigint := 0;
  v_approved bigint := 0;
  v_rejected bigint := 0;
  v_unmatched integer := 0;
  v_unmatched_oldest timestamptz;
  v_hours numeric;
  v_bypass text;
BEGIN
  IF NOT public.onboarding_manager_allowed(p_org_id) THEN
    RAISE EXCEPTION 'setup is owner/admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF o.activated_at IS NULL THEN
    RETURN jsonb_build_object('activated_at', NULL);
  END IF;

  v_from := o.activated_at;
  v_hours := EXTRACT(EPOCH FROM (now() - v_from)) / 3600.0;

  SELECT count(*),
         count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_leads, v_touched
  FROM public.leads
  WHERE org_id = p_org_id AND NOT is_test AND opted_in_at >= v_from;

  SELECT count(DISTINCT l.id),
         count(DISTINCT l.id) FILTER (
           WHERE EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.lead_id = l.id AND r.org_id = l.org_id)
              OR l.status IN ('closed_won', 'closed_lost', 'ghost', 'no_show', 'follow_up', 'objection_hold')
         )
  INTO v_held, v_logged
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND NOT l.is_test
    AND l.opted_in_at >= v_from
    AND EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.lead_id = l.id AND c.org_id = l.org_id AND c.outcome = 'held'
    );

  SELECT
    count(*) FILTER (WHERE status = 'approved'),
    count(*) FILTER (WHERE status = 'rejected')
  INTO v_approved, v_rejected
  FROM public.follow_up_drafts
  WHERE org_id = p_org_id
    AND created_at >= v_from
    AND status IN ('approved', 'rejected');

  SELECT count(*), min(received_at)
  INTO v_unmatched, v_unmatched_oldest
  FROM public.unmatched_transcripts
  WHERE org_id = p_org_id
    AND status = 'open';

  IF v_leads > 0 AND v_touched = 0 THEN
    v_bypass := 'Leads are arriving but no human touches are logged. The team is working in the CRM and not recording outcomes here. Every number this product produces will understate reality until they work the queue.';
  ELSIF v_held > 0 AND v_logged = 0 THEN
    v_bypass := 'Calls are being held but outcomes are not being logged. Attribution will collapse if this continues.';
  ELSE
    v_bypass := NULL;
  END IF;

  RETURN jsonb_build_object(
    'activated_at', o.activated_at,
    'hours_since_activation', trunc(v_hours * 10) / 10,
    'zero_ingest_warning', v_leads = 0 AND v_hours >= 24,
    'leads_ingested', v_leads,
    'touch_coverage', jsonb_build_object('k', v_touched, 'n', v_leads),
    'outcome_logging_rate', jsonb_build_object('k', v_logged, 'n', v_held),
    'drafts', jsonb_build_object('approved', v_approved, 'rejected', v_rejected),
    'unmatched_transcripts', jsonb_build_object(
      'count', v_unmatched,
      'oldest_received_at', v_unmatched_oldest
    ),
    'bypass', v_bypass
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff console
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_console_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL THEN public.is_platform_admin()
      ELSE
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    END;
$$;

CREATE OR REPLACE FUNCTION public.log_staff_access(
  p_action text,
  p_org_id uuid DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid;
BEGIN
  IF NOT public.staff_console_allowed() THEN
    RAISE EXCEPTION 'staff console is Vistrial staff only' USING ERRCODE = '42501';
  END IF;
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'staff access logging requires a signed-in user';
  END IF;
  INSERT INTO public.staff_access_log (staff_user_id, org_id, action, detail)
  VALUES (v_user, p_org_id, p_action, COALESCE(p_detail, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_org_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.staff_console_allowed() THEN
    RAISE EXCEPTION 'staff console is Vistrial staff only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.ingestion_priority, s.name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      o.id,
      o.name,
      o.slug,
      o.timezone,
      o.activated_at,
      o.created_at,
      c.status AS crm_status,
      c.last_verified_at,
      c.location_name,
      r.grade AS backfill_grade,
      r.status AS backfill_status,
      (
        SELECT max(w.received_at)
        FROM public.webhook_events w
        WHERE w.org_id = o.id
          AND w.status IS DISTINCT FROM 'rejected'
      ) AS last_event_at,
      (
        SELECT count(*)
        FROM public.webhook_events w
        WHERE w.org_id = o.id
          AND w.processed = false
          AND w.status = 'pending'
      ) AS unprocessed_events,
      (
        SELECT count(*)
        FROM public.leads l
        WHERE l.org_id = o.id
          AND NOT l.is_test
          AND (o.activated_at IS NULL OR l.opted_in_at >= o.activated_at)
      ) AS leads_since_activation,
      (
        SELECT count(*)
        FROM public.org_members m
        WHERE m.org_id = o.id AND m.active
      ) AS active_members,
      (
        SELECT CASE
          WHEN jsonb_typeof(p.examples) = 'array' THEN jsonb_array_length(p.examples)
          ELSE 0
        END
        FROM public.org_voice_profiles p
        WHERE p.org_id = o.id
      ) AS voice_examples,
      n.transcript_choice,
      n.field_maps_saved_at IS NOT NULL AS field_maps_saved,
      (
        SELECT (s.payload #>> '{outcome,headline,per_hundred}')::numeric
        FROM public.reporting_snapshots s
        WHERE s.org_id = o.id AND s.range_key = 'since_activation'
        LIMIT 1
      ) AS outcome_per_hundred,
      (
        SELECT (s.payload #>> '{outcome,headline,too_small}')::boolean
        FROM public.reporting_snapshots s
        WHERE s.org_id = o.id AND s.range_key = 'since_activation'
        LIMIT 1
      ) AS outcome_too_small,
      EXISTS (
        SELECT 1 FROM public.reporting_cohorts c
        WHERE c.org_id = o.id AND c.side = 'live' AND c.status = 'mature'
      ) AS outcome_mature,
      CASE
        WHEN c.status = 'active'
          AND o.activated_at IS NOT NULL
          AND o.activated_at <= now() - interval '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM public.webhook_events w
            WHERE w.org_id = o.id
              AND w.received_at >= now() - interval '24 hours'
              AND w.status IS DISTINCT FROM 'rejected'
          )
        THEN true
        WHEN c.status = 'broken' THEN true
        WHEN EXISTS (
          SELECT 1 FROM public.webhook_events w
          WHERE w.org_id = o.id
            AND w.processed = false
            AND w.status = 'pending'
            AND w.received_at <= now() - interval '15 minutes'
        ) THEN true
        ELSE false
      END AS ingestion_broken,
      CASE
        WHEN c.status = 'broken' THEN 0
        WHEN c.status = 'active'
          AND o.activated_at IS NOT NULL
          AND o.activated_at <= now() - interval '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM public.webhook_events w
            WHERE w.org_id = o.id
              AND w.received_at >= now() - interval '24 hours'
              AND w.status IS DISTINCT FROM 'rejected'
          )
        THEN 1
        WHEN EXISTS (
          SELECT 1 FROM public.webhook_events w
          WHERE w.org_id = o.id
            AND w.processed = false
            AND w.status = 'pending'
            AND w.received_at <= now() - interval '15 minutes'
        ) THEN 2
        WHEN o.activated_at IS NULL THEN 3
        ELSE 4
      END AS ingestion_priority
    FROM public.organizations o
    LEFT JOIN public.ghl_connections c ON c.org_id = o.id
    LEFT JOIN public.org_onboarding n ON n.org_id = o.id
    LEFT JOIN LATERAL (
      SELECT b.grade, b.status
      FROM public.baseline_runs b
      WHERE b.org_id = o.id
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 1
    ) r ON true
  ) s;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_client_org(
  p_name text,
  p_timezone text,
  p_slug text DEFAULT NULL,
  p_owner_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_slug text;
  v_base text;
  v_n integer := 1;
  v_id uuid;
  v_token text;
  v_invite uuid;
  v_member uuid;
  v_email text;
BEGIN
  IF NOT public.staff_console_allowed() THEN
    RAISE EXCEPTION 'staff console is Vistrial staff only' USING ERRCODE = '42501';
  END IF;

  v_name := btrim(p_name);
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'organization name is required';
  END IF;
  IF p_timezone IS NULL OR btrim(p_timezone) = '' THEN
    RAISE EXCEPTION 'timezone is required';
  END IF;

  v_base := lower(regexp_replace(COALESCE(NULLIF(btrim(p_slug), ''), v_name), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  IF v_base IS NULL OR v_base = '' THEN
    v_base := 'org';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, timezone)
  VALUES (v_name, v_slug, p_timezone)
  RETURNING id INTO v_id;

  v_email := NULLIF(lower(btrim(COALESCE(p_owner_email, ''))), '');
  IF v_email IS NOT NULL THEN
    SELECT m.id INTO v_member
    FROM public.org_members m
    WHERE m.org_id = v_id AND m.user_id = auth.uid()
    LIMIT 1;

    IF v_member IS NOT NULL THEN
      v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
      INSERT INTO public.org_invites (org_id, email, role, token, invited_by, expires_at)
      VALUES (
        v_id,
        v_email,
        'owner',
        v_token,
        v_member,
        now() + interval '14 days'
      )
      RETURNING id INTO v_invite;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_id,
    'slug', v_slug,
    'invite_token', v_token,
    'invite_id', v_invite
  );
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.onboarding_manager_allowed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_activation_gate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_org_setup_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_org(uuid, uuid, text[], boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_activation_timestamp(uuid, uuid, text, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.first_week_health(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_console_allowed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_staff_access(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_org_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_client_org(text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.onboarding_manager_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_activation_gate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.load_org_setup_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_org(uuid, uuid, text[], boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_activation_timestamp(uuid, uuid, text, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.first_week_health(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_console_allowed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_staff_access(text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_org_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_client_org(text, text, text, text) TO authenticated, service_role;
