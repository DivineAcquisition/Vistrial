-- Queue triage: alarm band, composite urgency, outcome logging, and
-- operator writes (self-assign, human touches, next-action complete).

-- ---------------------------------------------------------------------------
-- Outcome on human touches (system/GHL ingest leaves this null)
-- ---------------------------------------------------------------------------

CREATE TYPE public.touch_outcome AS ENUM (
  'connected',
  'no_answer',
  'left_voicemail',
  'replied',
  'booked',
  'not_interested'
);

ALTER TABLE public.touches
  ADD COLUMN outcome public.touch_outcome;

COMMENT ON COLUMN public.touches.outcome IS
  'Operator-logged result of a human touch. Null on system and ingested rows.';

-- ---------------------------------------------------------------------------
-- Open next-action lookup for a lead (queue join)
-- ---------------------------------------------------------------------------

CREATE INDEX next_actions_open_lead_idx
  ON public.next_actions (lead_id, due_at)
  WHERE completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Self-assign: anyone may assign themselves; only owner/admin assign others
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION public.assign_org_lead(
  p_org_id uuid,
  p_lead_id uuid,
  p_setter_id uuid,
  p_closer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid;
  v_old_setter uuid;
  v_old_closer uuid;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized to reassign leads';
  END IF;

  v_self := public.user_member_id(p_org_id);

  SELECT assigned_setter_id, assigned_closer_id
  INTO v_old_setter, v_old_closer
  FROM public.leads
  WHERE id = p_lead_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;

  IF p_setter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_setter_id AND org_id = p_org_id AND active = true
  ) THEN
    RAISE EXCEPTION 'The setter must be an active member of this workspace.';
  END IF;

  IF p_closer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE id = p_closer_id AND org_id = p_org_id AND active = true
  ) THEN
    RAISE EXCEPTION 'The closer must be an active member of this workspace.';
  END IF;

  IF NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    IF v_self IS NULL THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF p_setter_id IS DISTINCT FROM v_old_setter
      AND p_setter_id IS DISTINCT FROM v_self THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
    IF p_closer_id IS DISTINCT FROM v_old_closer
      AND p_closer_id IS DISTINCT FROM v_self THEN
      RAISE EXCEPTION 'not authorized to reassign leads';
    END IF;
  END IF;

  UPDATE public.leads
  SET
    assigned_setter_id = p_setter_id,
    assigned_closer_id = p_closer_id
  WHERE id = p_lead_id
    AND org_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_org_lead(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_org_lead(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- Operators on the queue must be able to log a human touch. Actor is self
-- unless the caller is owner/admin (who may attribute another member).
CREATE POLICY touches_insert_members
  ON public.touches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND type = 'human'
    AND actor_member_id IS NOT NULL
    AND (
      actor_member_id = public.user_member_id(org_id)
      OR public.user_has_org_role(org_id, 'owner', 'admin')
    )
  );

CREATE POLICY next_actions_insert_members
  ON public.next_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY next_actions_update_members
  ON public.next_actions
  FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ---------------------------------------------------------------------------
-- Queue row view: one join surface for everything a row renders.
-- urgency_rank is computed here so ORDER BY stays in the database:
--   1 ready-track or unscored, no human touch yet
--   2 overdue next action
--   3 ready-track by score
--   4 nurture-track by score
--   5 approaching ghost
-- Unscored + untouched is bucket 1 so brand-new leads are not buried.
-- ---------------------------------------------------------------------------

CREATE VIEW public.queue_rows
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
) na ON true;

COMMENT ON VIEW public.queue_rows IS
  'Queue row surface: lead + latest score + open next action + assignment names. Sort keys live here so the client never reorders.';

GRANT SELECT ON public.queue_rows TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_row_to_json(r public.queue_rows)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'orgId', r.org_id,
    'name', r.name,
    'email', r.email,
    'source', r.source,
    'status', r.status,
    'leadType', r.lead_type,
    'score', r.score,
    'scoreConfidence', r.score_confidence,
    'knownFactorCount', r.known_factor_count,
    'scoreReasoning', r.score_reasoning,
    'optedInAt', r.opted_in_at,
    'lastTouchAt', r.last_touch_at,
    'firstHumanTouchAt', r.first_human_touch_at,
    'assignedSetterId', r.assigned_setter_id,
    'assignedCloserId', r.assigned_closer_id,
    'assignedSetterName', r.assigned_setter_name,
    'assignedCloserName', r.assigned_closer_name,
    'ghlContactId', r.ghl_contact_id,
    'crmUrl', r.crm_url,
    'nextAction', CASE
      WHEN r.next_action_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', r.next_action_id,
        'actionText', r.next_action_text,
        'dueAt', r.next_action_due_at,
        'overdue', r.next_action_overdue
      )
    END,
    'inAlarm', r.in_alarm,
    'breachSeconds', r.breach_seconds,
    'urgencyRank', r.urgency_rank,
    'sortScore', r.sort_score
  );
$$;

REVOKE ALL ON FUNCTION public.queue_row_to_json(public.queue_rows) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_row_to_json(public.queue_rows) TO authenticated, service_role;

-- Canonical alarm-band query. Predicate matches leads_never_touched_idx
-- (org_id, opted_in_at) WHERE first_human_touch_at IS NULL.
CREATE OR REPLACE FUNCTION public.alarm_band_leads(p_org_id uuid)
RETURNS TABLE(id uuid, opted_in_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.id, l.opted_in_at
  FROM public.leads l
  WHERE l.org_id = p_org_id
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

-- One round trip: alarm (unfiltered) + working page (filtered) + members + empty-state facts.
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
  WHERE l.org_id = p_org_id;

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

  RETURN jsonb_build_object(
    'crmStatus', v_crm_status,
    'ghlLocationId', v_location,
    'orgLeadCount', v_lead_count,
    'unfilteredActionableCount', v_unfiltered,
    'alarm', COALESCE(v_alarm, '[]'::jsonb),
    'queue', COALESCE(v_queue, '[]'::jsonb),
    'hasMore', v_has_more,
    'members', COALESCE(v_members, '[]'::jsonb),
    'sources', COALESCE(v_sources, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_queue(
  uuid, text, text, text, text, integer, integer, jsonb, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_queue(
  uuid, text, text, text, text, integer, integer, jsonb, integer
) TO authenticated, service_role;

-- Realtime: org-scoped lead/next-action/touch changes keep the open queue live.
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.next_actions REPLICA IDENTITY FULL;
ALTER TABLE public.touches REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.next_actions;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.touches;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;
