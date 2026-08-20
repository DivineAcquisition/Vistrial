-- Case Files: full lead list, case file load, status integrity, timeline paging.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Indexes for list search/sort and timeline
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS leads_org_opted_in_idx
  ON public.leads (org_id, opted_in_at DESC);

CREATE INDEX IF NOT EXISTS leads_first_name_trgm_idx
  ON public.leads USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leads_last_name_trgm_idx
  ON public.leads USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leads_email_trgm_idx
  ON public.leads USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leads_phone_trgm_idx
  ON public.leads USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS revenue_log_lead_time_idx
  ON public.revenue_log (lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Manual and event status changes belong on the timeline, not as touches.
-- A touch would stamp last_touch_at and could clear the speed-to-lead alarm.
-- ---------------------------------------------------------------------------

CREATE TYPE public.status_change_source AS ENUM ('manual', 'event');

CREATE TABLE public.lead_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  from_status public.lead_status NOT NULL,
  to_status public.lead_status NOT NULL,
  source public.status_change_source NOT NULL,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_status_changes_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lead_status_changes IS
  'Append-only status history. Manual changes record who and when. Later events still win and appear after them.';

CREATE INDEX lead_status_changes_lead_time_idx
  ON public.lead_status_changes (lead_id, created_at DESC);

ALTER TABLE public.lead_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_status_changes_select
  ON public.lead_status_changes
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.lead_status_changes TO authenticated;
GRANT SELECT, INSERT ON public.lead_status_changes TO service_role;

CREATE OR REPLACE FUNCTION public.forbid_case_file_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'case file history is not deleted';
END;
$$;

CREATE TRIGGER touches_forbid_delete
  BEFORE DELETE ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE TRIGGER objections_forbid_delete
  BEFORE DELETE ON public.objections
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE TRIGGER lead_status_changes_forbid_delete
  BEFORE DELETE ON public.lead_status_changes
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE TRIGGER readiness_scores_forbid_delete
  BEFORE DELETE ON public.readiness_scores
  FOR EACH ROW EXECUTE FUNCTION public.forbid_case_file_delete();

CREATE OR REPLACE FUNCTION public.record_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.status_change_source;
  v_actor uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'closed_won'
    AND current_setting('vistrial.allow_closed_won', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'closed_won follows a recorded payment';
  END IF;

  IF current_setting('vistrial.status_source', true) = 'manual' THEN
    v_source := 'manual';
    v_actor := public.user_member_id(NEW.org_id);
  ELSE
    v_source := 'event';
    v_actor := NULL;
  END IF;

  INSERT INTO public.lead_status_changes (
    org_id, lead_id, from_status, to_status, source, actor_member_id, note
  ) VALUES (
    NEW.org_id,
    NEW.id,
    OLD.status,
    NEW.status,
    v_source,
    v_actor,
    NULLIF(current_setting('vistrial.status_note', true), '')
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_record_status_change
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_lead_status_change();

CREATE OR REPLACE FUNCTION public.revenue_marks_closed_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('vistrial.allow_closed_won', '1', true);
  PERFORM set_config('vistrial.status_source', 'event', true);
  UPDATE public.leads
  SET status = 'closed_won'
  WHERE id = NEW.lead_id
    AND org_id = NEW.org_id
    AND status IS DISTINCT FROM 'closed_won';
  RETURN NEW;
END;
$$;

CREATE TRIGGER revenue_log_marks_closed_won
  AFTER INSERT ON public.revenue_log
  FOR EACH ROW EXECUTE FUNCTION public.revenue_marks_closed_won();

CREATE OR REPLACE FUNCTION public.change_org_lead_status(
  p_org_id uuid,
  p_lead_id uuid,
  p_status public.lead_status,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_status = 'closed_won' THEN
    RAISE EXCEPTION 'closed_won follows a recorded payment';
  END IF;

  PERFORM set_config('vistrial.status_source', 'manual', true);
  PERFORM set_config('vistrial.status_note', COALESCE(p_note, ''), true);

  UPDATE public.leads
  SET status = p_status
  WHERE id = p_lead_id
    AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.change_org_lead_status(uuid, uuid, public.lead_status, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_org_lead_status(uuid, uuid, public.lead_status, text)
  TO authenticated, service_role;

-- Members may resolve objections. History stays; the row is never removed.
CREATE POLICY objections_update_members
  ON public.objections
  FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ---------------------------------------------------------------------------
-- List surface: every lead, one join, no per-row fetch.
-- Date range filters opted_in_at: it is always present, unlike last_touch_at.
-- Sort-by-status uses enum declaration order (pipeline), not recency.
-- ---------------------------------------------------------------------------

CREATE VIEW public.case_file_rows
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
LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id;

COMMENT ON VIEW public.case_file_rows IS
  'Case Files list row: identification + triage fields. Sort/filter stay in the database.';

GRANT SELECT ON public.case_file_rows TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.case_file_row_to_json(r public.case_file_rows)
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
    'phone', r.phone,
    'source', r.source,
    'status', r.status,
    'leadType', r.lead_type,
    'score', r.score,
    'optedInAt', r.opted_in_at,
    'lastTouchAt', r.last_touch_at,
    'assignedSetterId', r.assigned_setter_id,
    'assignedCloserId', r.assigned_closer_id,
    'assignedSetterName', r.assigned_setter_name,
    'assignedCloserName', r.assigned_closer_name
  );
$$;

REVOKE ALL ON FUNCTION public.case_file_row_to_json(public.case_file_rows) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_file_row_to_json(public.case_file_rows)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.load_org_case_list(
  p_org_id uuid,
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_track text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_setter_id uuid DEFAULT NULL,
  p_closer_id uuid DEFAULT NULL,
  p_score_min integer DEFAULT NULL,
  p_score_max integer DEFAULT NULL,
  p_opted_from date DEFAULT NULL,
  p_opted_to date DEFAULT NULL,
  p_sort text DEFAULT 'last_touch',
  p_dir text DEFAULT 'desc',
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
  v_limit integer;
  v_sort text;
  v_dir text;
  v_q text;
  v_digits text;
  v_crm_status text;
  v_location text;
  v_lead_count bigint;
  v_members jsonb;
  v_sources jsonb;
  v_rows jsonb;
  v_has_more boolean;
  v_cursor_id uuid;
  v_cursor_t timestamptz;
  v_cursor_s integer;
  v_cursor_st public.lead_status;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_sort := CASE
    WHEN p_sort IN ('last_touch', 'score', 'opted_in', 'status') THEN p_sort
    ELSE 'last_touch'
  END;
  v_dir := CASE WHEN lower(COALESCE(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_q := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_digits := NULLIF(regexp_replace(COALESCE(v_q, ''), '[^0-9]', '', 'g'), '');

  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
    v_cursor_t := NULLIF(p_cursor->>'t', '')::timestamptz;
    v_cursor_s := NULLIF(p_cursor->>'s', '')::integer;
    v_cursor_st := NULLIF(p_cursor->>'st', '')::public.lead_status;
  END IF;

  SELECT c.status::text INTO v_crm_status
  FROM public.ghl_connections c
  WHERE c.org_id = p_org_id;

  SELECT o.ghl_location_id INTO v_location
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_crm_status IS NULL THEN
    v_crm_status := CASE WHEN v_location IS NOT NULL THEN 'active' ELSE 'missing' END;
  END IF;

  SELECT count(*) INTO v_lead_count
  FROM public.leads l
  WHERE l.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', m.id, 'displayName', m.display_name, 'role', m.role)
    ORDER BY m.display_name
  ), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active = true;

  SELECT COALESCE(jsonb_agg(src ORDER BY src), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT DISTINCT l.source AS src
    FROM public.leads l
    WHERE l.org_id = p_org_id AND l.source IS NOT NULL AND btrim(l.source) <> ''
  ) s;

  SELECT COALESCE(jsonb_agg(
    public.case_file_row_to_json(q)
    ORDER BY
      CASE WHEN v_sort = 'last_touch' AND v_dir = 'desc' THEN COALESCE(q.last_touch_at, '-infinity'::timestamptz) END DESC,
      CASE WHEN v_sort = 'last_touch' AND v_dir = 'asc' THEN COALESCE(q.last_touch_at, 'infinity'::timestamptz) END ASC,
      CASE WHEN v_sort = 'score' AND v_dir = 'desc' THEN COALESCE(q.score, -1) END DESC,
      CASE WHEN v_sort = 'score' AND v_dir = 'asc' THEN COALESCE(q.score, -1) END ASC,
      CASE WHEN v_sort = 'opted_in' AND v_dir = 'desc' THEN q.opted_in_at END DESC,
      CASE WHEN v_sort = 'opted_in' AND v_dir = 'asc' THEN q.opted_in_at END ASC,
      CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN q.status END DESC,
      CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN q.status END ASC,
      CASE WHEN v_dir = 'desc' THEN q.id END DESC,
      CASE WHEN v_dir = 'asc' THEN q.id END ASC
  ), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM (
      SELECT *
      FROM public.case_file_rows q
      WHERE q.org_id = p_org_id
        AND (
          v_q IS NULL
          OR COALESCE(q.first_name, '') ILIKE '%' || v_q || '%'
          OR COALESCE(q.last_name, '') ILIKE '%' || v_q || '%'
          OR (
            q.first_name IS NOT NULL
            AND q.last_name IS NOT NULL
            AND (q.first_name || ' ' || q.last_name) ILIKE '%' || v_q || '%'
          )
          OR q.email ILIKE '%' || v_q || '%'
          OR q.phone ILIKE '%' || v_q || '%'
          OR (v_digits IS NOT NULL AND regexp_replace(COALESCE(q.phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
        )
        AND (p_status IS NULL OR p_status = '' OR q.status = p_status::public.lead_status)
        AND (
          p_track IS NULL OR p_track = ''
          OR (p_track = 'ready' AND q.lead_type = 'ready_track')
          OR (p_track = 'nurture' AND q.lead_type = 'nurture_track')
        )
        AND (p_source IS NULL OR p_source = '' OR q.source = p_source)
        AND (p_setter_id IS NULL OR q.assigned_setter_id = p_setter_id)
        AND (p_closer_id IS NULL OR q.assigned_closer_id = p_closer_id)
        AND (p_score_min IS NULL OR q.score >= p_score_min)
        AND (p_score_max IS NULL OR q.score <= p_score_max)
        AND (p_opted_from IS NULL OR q.opted_in_at >= p_opted_from::timestamptz)
        AND (p_opted_to IS NULL OR q.opted_in_at < (p_opted_to + 1)::timestamptz)
        AND (
          v_cursor_id IS NULL
          OR (
            v_sort = 'last_touch' AND v_dir = 'desc' AND (
              COALESCE(q.last_touch_at, '-infinity'::timestamptz), q.id
            ) < (COALESCE(v_cursor_t, '-infinity'::timestamptz), v_cursor_id)
          )
          OR (
            v_sort = 'last_touch' AND v_dir = 'asc' AND (
              COALESCE(q.last_touch_at, 'infinity'::timestamptz), q.id
            ) > (COALESCE(v_cursor_t, 'infinity'::timestamptz), v_cursor_id)
          )
          OR (
            v_sort = 'score' AND v_dir = 'desc' AND (
              COALESCE(q.score, -1), q.id
            ) < (COALESCE(v_cursor_s, -1), v_cursor_id)
          )
          OR (
            v_sort = 'score' AND v_dir = 'asc' AND (
              COALESCE(q.score, -1), q.id
            ) > (COALESCE(v_cursor_s, -1), v_cursor_id)
          )
          OR (
            v_sort = 'opted_in' AND v_dir = 'desc' AND (q.opted_in_at, q.id) < (v_cursor_t, v_cursor_id)
          )
          OR (
            v_sort = 'opted_in' AND v_dir = 'asc' AND (q.opted_in_at, q.id) > (v_cursor_t, v_cursor_id)
          )
          OR (
            v_sort = 'status' AND v_dir = 'desc' AND (q.status, q.id) < (v_cursor_st, v_cursor_id)
          )
          OR (
            v_sort = 'status' AND v_dir = 'asc' AND (q.status, q.id) > (v_cursor_st, v_cursor_id)
          )
        )
      ORDER BY
        CASE WHEN v_sort = 'last_touch' AND v_dir = 'desc' THEN COALESCE(q.last_touch_at, '-infinity'::timestamptz) END DESC,
        CASE WHEN v_sort = 'last_touch' AND v_dir = 'asc' THEN COALESCE(q.last_touch_at, 'infinity'::timestamptz) END ASC,
        CASE WHEN v_sort = 'score' AND v_dir = 'desc' THEN COALESCE(q.score, -1) END DESC,
        CASE WHEN v_sort = 'score' AND v_dir = 'asc' THEN COALESCE(q.score, -1) END ASC,
        CASE WHEN v_sort = 'opted_in' AND v_dir = 'desc' THEN q.opted_in_at END DESC,
        CASE WHEN v_sort = 'opted_in' AND v_dir = 'asc' THEN q.opted_in_at END ASC,
        CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN q.status END DESC,
        CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN q.status END ASC,
        CASE WHEN v_dir = 'desc' THEN q.id END DESC,
        CASE WHEN v_dir = 'asc' THEN q.id END ASC
      LIMIT v_limit + 1
    ) q
  ) q;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  END IF;

  RETURN jsonb_build_object(
    'crmStatus', v_crm_status,
    'ghlLocationId', v_location,
    'orgLeadCount', v_lead_count,
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more,
    'members', COALESCE(v_members, '[]'::jsonb),
    'sources', COALESCE(v_sources, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_case_list(
  uuid, text, text, text, text, uuid, uuid, integer, integer, date, date, text, text, jsonb, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_case_list(
  uuid, text, text, text, text, uuid, uuid, integer, integer, date, date, text, text, jsonb, integer
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Timeline page: touches + calls + status changes, reverse chronological.
-- Never includes message bodies.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.load_org_case_timeline(
  p_org_id uuid,
  p_lead_id uuid,
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_has_more boolean;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND org_id = p_org_id
  ) THEN
    RETURN NULL;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  IF p_cursor IS NOT NULL AND jsonb_typeof(p_cursor) = 'object' THEN
    v_cursor_at := NULLIF(p_cursor->>'at', '')::timestamptz;
    v_cursor_id := NULLIF(p_cursor->>'id', '')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(page.elem ORDER BY page.at DESC, page.id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT stream.elem, stream.at, stream.id
    FROM (
      SELECT jsonb_build_object(
        'kind', 'touch',
        'id', t.id,
        'at', t.occurred_at,
        'touchType', t.type,
        'channel', t.channel,
        'direction', t.direction,
        'outcome', t.outcome,
        'actorName', actor.display_name,
        'note', t.summary
      ) AS elem,
      t.occurred_at AS at,
      t.id AS id
      FROM public.touches t
      LEFT JOIN public.org_members actor ON actor.id = t.actor_member_id
      WHERE t.org_id = p_org_id AND t.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'call',
        'id', c.id,
        'at', COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
        'callType', c.type,
        'outcome', c.outcome,
        'actorName', runner.display_name,
        'durationSeconds', c.duration_seconds,
        'scheduledAt', c.scheduled_at,
        'occurredAt', c.occurred_at
      ),
      COALESCE(c.occurred_at, c.scheduled_at, c.created_at),
      c.id
      FROM public.calls c
      LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
      WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'status',
        'id', s.id,
        'at', s.created_at,
        'fromStatus', s.from_status,
        'toStatus', s.to_status,
        'source', s.source,
        'actorName', actor.display_name,
        'note', s.note,
        'supersedesManual', s.supersedes_manual
      ),
      s.created_at,
      s.id
      FROM (
        SELECT
          sc.*,
          (
            sc.source = 'event'
            AND LAG(sc.source) OVER (ORDER BY sc.created_at, sc.id) = 'manual'
          ) AS supersedes_manual
        FROM public.lead_status_changes sc
        WHERE sc.org_id = p_org_id AND sc.lead_id = p_lead_id
      ) s
      LEFT JOIN public.org_members actor ON actor.id = s.actor_member_id
    ) stream
    WHERE v_cursor_id IS NULL
      OR (stream.at, stream.id) < (v_cursor_at, v_cursor_id)
    ORDER BY stream.at DESC, stream.id DESC
    LIMIT v_limit + 1
  ) page;

  v_has_more := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)) > v_limit;
  IF v_has_more THEN
    SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb)
    INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, n)
    WHERE n <= v_limit;
  END IF;

  RETURN jsonb_build_object(
    'entries', COALESCE(v_rows, '[]'::jsonb),
    'hasMore', v_has_more
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_case_timeline(uuid, uuid, jsonb, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_case_timeline(uuid, uuid, jsonb, integer)
  TO authenticated, service_role;

-- One round trip for the case file page. Revenue is omitted unless owner/admin.
CREATE OR REPLACE FUNCTION public.load_org_case_file(
  p_org_id uuid,
  p_lead_id uuid,
  p_timeline_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_location text;
  v_crm_url text;
  v_setter_name text;
  v_closer_name text;
  v_score jsonb;
  v_history jsonb;
  v_objections jsonb;
  v_actions jsonb;
  v_calls jsonb;
  v_maps jsonb;
  v_revenue jsonb;
  v_members jsonb;
  v_timeline jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT o.ghl_location_id INTO v_location
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_location IS NOT NULL AND v_lead.ghl_contact_id IS NOT NULL THEN
    v_crm_url := 'https://app.gohighlevel.com/v2/location/'
      || v_location
      || '/conversations/all?contactId='
      || v_lead.ghl_contact_id;
  END IF;

  SELECT display_name INTO v_setter_name
  FROM public.org_members WHERE id = v_lead.assigned_setter_id;
  SELECT display_name INTO v_closer_name
  FROM public.org_members WHERE id = v_lead.assigned_closer_id;

  SELECT jsonb_build_object(
    'id', score.id,
    'total', score.total,
    'timeline', score.timeline_raw,
    'investmentCapacity', score.investment_capacity_raw,
    'decisionAuthority', score.decision_authority_raw,
    'painSeverity', score.pain_severity_raw,
    'reasoning', score.reasoning,
    'triggeredBy', score.triggered_by,
    'createdAt', score.created_at,
    'knownFactorCount', (
      (score.timeline_raw IS NOT NULL)::integer
      + (score.investment_capacity_raw IS NOT NULL)::integer
      + (score.decision_authority_raw IS NOT NULL)::integer
      + (score.pain_severity_raw IS NOT NULL)::integer
    ),
    'scoreConfidence', CASE
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
    END
  )
  INTO v_score
  FROM public.readiness_scores score
  WHERE score.lead_id = p_lead_id AND score.org_id = p_org_id
  ORDER BY score.created_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC, id DESC), '[]'::jsonb)
  INTO v_history
  FROM (
    SELECT
      jsonb_build_object(
        'id', rs.id,
        'total', rs.total,
        'previousTotal', LAG(rs.total) OVER (ORDER BY rs.created_at, rs.id),
        'timeline', rs.timeline_raw,
        'investmentCapacity', rs.investment_capacity_raw,
        'decisionAuthority', rs.decision_authority_raw,
        'painSeverity', rs.pain_severity_raw,
        'reasoning', rs.reasoning,
        'triggeredBy', rs.triggered_by,
        'createdAt', rs.created_at,
        'scoredByName', scorer.display_name
      ) AS item,
      rs.created_at,
      rs.id
    FROM public.readiness_scores rs
    LEFT JOIN public.org_members scorer ON scorer.id = rs.scored_by_member_id
    WHERE rs.lead_id = p_lead_id AND rs.org_id = p_org_id
  ) h;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'verbatim', o.verbatim,
      'callId', o.call_id,
      'callType', c.type,
      'callOccurredAt', c.occurred_at,
      'resolved', o.resolved,
      'resolvedAt', o.resolved_at,
      'resolvedNote', o.resolved_note,
      'createdAt', o.created_at
    ) ORDER BY o.resolved ASC, o.created_at DESC
  ), '[]'::jsonb)
  INTO v_objections
  FROM public.objections o
  LEFT JOIN public.calls c ON c.id = o.call_id
  WHERE o.lead_id = p_lead_id AND o.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'actionText', n.action_text,
      'dueAt', n.due_at,
      'completedAt', n.completed_at,
      'ownerMemberId', n.owner_member_id,
      'ownerName', owner.display_name,
      'createdBy', n.created_by,
      'overdue', n.completed_at IS NULL AND n.due_at IS NOT NULL AND n.due_at < now()
    ) ORDER BY n.completed_at NULLS FIRST, n.due_at ASC NULLS LAST, n.created_at ASC
  ), '[]'::jsonb)
  INTO v_actions
  FROM public.next_actions n
  LEFT JOIN public.org_members owner ON owner.id = n.owner_member_id
  WHERE n.lead_id = p_lead_id AND n.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'type', c.type,
      'scheduledAt', c.scheduled_at,
      'occurredAt', c.occurred_at,
      'durationSeconds', c.duration_seconds,
      'outcome', c.outcome,
      'ranByMemberId', c.ran_by_member_id,
      'ranByName', runner.display_name,
      'hasTranscript', c.raw_transcript IS NOT NULL,
      'hasExtraction', EXISTS (
        SELECT 1 FROM public.call_extractions e WHERE e.call_id = c.id
      )
    ) ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  ), '[]'::jsonb)
  INTO v_calls
  FROM public.calls c
  LEFT JOIN public.org_members runner ON runner.id = c.ran_by_member_id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fieldName', m.field_name,
      'factor', m.factor
    ) ORDER BY m.field_name
  ), '[]'::jsonb)
  INTO v_maps
  FROM public.score_field_maps m
  WHERE m.org_id = p_org_id;

  IF public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'amountCents', r.amount_cents,
        'currency', r.currency,
        'paymentType', r.payment_type,
        'processor', r.processor,
        'occurredAt', r.occurred_at,
        'closedByName', closer.display_name
      ) ORDER BY r.occurred_at DESC
    ), '[]'::jsonb)
    INTO v_revenue
    FROM public.revenue_log r
    LEFT JOIN public.org_members closer ON closer.id = r.closed_by_member_id
    WHERE r.org_id = p_org_id AND r.lead_id = p_lead_id;
  ELSE
    v_revenue := NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', m.id, 'displayName', m.display_name, 'role', m.role)
    ORDER BY m.display_name
  ), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active = true;

  v_timeline := public.load_org_case_timeline(p_org_id, p_lead_id, NULL, p_timeline_limit);

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'orgId', v_lead.org_id,
      'name', COALESCE(
        NULLIF(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
        NULLIF(btrim(v_lead.email), ''),
        'Unnamed lead'
      ),
      'firstName', v_lead.first_name,
      'lastName', v_lead.last_name,
      'email', v_lead.email,
      'phone', v_lead.phone,
      'source', v_lead.source,
      'campaign', v_lead.campaign,
      'status', v_lead.status,
      'leadType', v_lead.lead_type,
      'score', v_lead.current_score,
      'optedInAt', v_lead.opted_in_at,
      'lastTouchAt', v_lead.last_touch_at,
      'firstHumanTouchAt', v_lead.first_human_touch_at,
      'assignedSetterId', v_lead.assigned_setter_id,
      'assignedCloserId', v_lead.assigned_closer_id,
      'assignedSetterName', v_setter_name,
      'assignedCloserName', v_closer_name,
      'ghlContactId', v_lead.ghl_contact_id,
      'crmUrl', v_crm_url,
      'applicationAnswers', v_lead.application_answers
    ),
    'score', v_score,
    'scoreHistory', COALESCE(v_history, '[]'::jsonb),
    'objections', COALESCE(v_objections, '[]'::jsonb),
    'nextActions', COALESCE(v_actions, '[]'::jsonb),
    'calls', COALESCE(v_calls, '[]'::jsonb),
    'fieldMaps', COALESCE(v_maps, '[]'::jsonb),
    'revenue', v_revenue,
    'members', COALESCE(v_members, '[]'::jsonb),
    'timeline', COALESCE(v_timeline, jsonb_build_object('entries', '[]'::jsonb, 'hasMore', false))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_case_file(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_case_file(uuid, uuid, integer)
  TO authenticated, service_role;
