-- Case files: context-note writes, list filters for untouched/SLA breach,
-- lead file attachments, and timeline payloads without message bodies.

-- ---------------------------------------------------------------------------
-- Operators can save context notes. Column exists from mvp_spine.
-- ---------------------------------------------------------------------------

GRANT UPDATE (context_notes) ON public.leads TO authenticated;

COMMENT ON COLUMN public.leads.context_notes IS
  'Workspace-authored context for the case file. Distinct from objections and next actions. Not a CRM transcript.';

-- ---------------------------------------------------------------------------
-- Files attached to a lead. Contents stay off the case-file JSON payload.
-- ---------------------------------------------------------------------------

CREATE TABLE public.lead_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  contents text NOT NULL,
  uploaded_by_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_files_id_org_key UNIQUE (id, org_id),
  CONSTRAINT lead_files_lead_org_fkey
    FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT lead_files_uploader_org_fkey
    FOREIGN KEY (uploaded_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id)
    ON DELETE SET NULL,
  CONSTRAINT lead_files_name_present CHECK (btrim(file_name) <> ''),
  CONSTRAINT lead_files_type_present CHECK (btrim(content_type) <> ''),
  CONSTRAINT lead_files_size_range CHECK (byte_size > 0 AND byte_size <= 8388608),
  CONSTRAINT lead_files_contents_present CHECK (btrim(contents) <> '')
);

COMMENT ON TABLE public.lead_files IS
  'Operator-uploaded files on a lead. Call transcripts live on calls.raw_transcript, not here.';

CREATE INDEX lead_files_lead_created_idx
  ON public.lead_files (lead_id, created_at DESC);

ALTER TABLE public.lead_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_files_select
  ON public.lead_files
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY lead_files_insert
  ON public.lead_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND (
      uploaded_by_member_id IS NULL
      OR uploaded_by_member_id = public.user_member_id(org_id)
    )
  );

CREATE POLICY lead_files_delete
  ON public.lead_files
  FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.lead_files FROM PUBLIC, anon;
GRANT SELECT (id, org_id, lead_id, file_name, content_type, byte_size, uploaded_by_member_id, created_at)
  ON public.lead_files TO authenticated;
GRANT INSERT (
  id, org_id, lead_id, file_name, content_type, byte_size, contents,
  uploaded_by_member_id, created_at
) ON public.lead_files TO authenticated;
GRANT DELETE ON public.lead_files TO authenticated;
GRANT ALL ON TABLE public.lead_files TO service_role;

-- Contents are readable only through the download path (service or explicit select
-- of the contents column). Authenticated GRANT SELECT above omits contents so a
-- list query cannot dump file bytes. Download uses a column-specific grant:
GRANT SELECT (contents) ON public.lead_files TO authenticated;

-- ---------------------------------------------------------------------------
-- List rows include first-human-touch so untouched / SLA filters can use it.
-- Drop dependents first: CREATE OR REPLACE VIEW cannot insert columns mid-row.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.load_org_case_list(
  uuid, text, text, text, text, uuid, uuid, integer, integer, date, date, text, text, jsonb, integer
);
DROP FUNCTION IF EXISTS public.case_file_row_to_json(public.case_file_rows);
DROP VIEW IF EXISTS public.case_file_rows;

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
  l.first_human_touch_at,
  l.pipeline_stage,
  l.assigned_setter_id,
  l.assigned_closer_id,
  setter.display_name AS assigned_setter_name,
  closer.display_name AS assigned_closer_name
FROM public.leads l
LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
WHERE NOT l.is_test;

COMMENT ON VIEW public.case_file_rows IS
  'Case Files list row: identification + triage fields, including first human touch for SLA filters.';

GRANT SELECT ON public.case_file_rows TO authenticated, service_role;

CREATE FUNCTION public.case_file_row_to_json(r public.case_file_rows)
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
    'firstHumanTouchAt', r.first_human_touch_at,
    'pipelineStage', r.pipeline_stage,
    'assignedSetterId', r.assigned_setter_id,
    'assignedCloserId', r.assigned_closer_id,
    'assignedSetterName', r.assigned_setter_name,
    'assignedCloserName', r.assigned_closer_name
  );
$$;

REVOKE ALL ON FUNCTION public.case_file_row_to_json(public.case_file_rows) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_file_row_to_json(public.case_file_rows)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- List RPC: add zero-human-touch and time-to-first-touch breach filters.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.load_org_case_list(
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
  p_limit integer DEFAULT 50,
  p_zero_human_touch boolean DEFAULT false,
  p_ttft_breach boolean DEFAULT false
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
  v_speed integer;
  v_zero boolean;
  v_breach boolean;
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
  v_zero := COALESCE(p_zero_human_touch, false);
  v_breach := COALESCE(p_ttft_breach, false);

  SELECT COALESCE(sc.speed_to_lead_minutes, 15) INTO v_speed
  FROM public.score_configs sc
  WHERE sc.org_id = p_org_id;
  IF v_speed IS NULL THEN
    v_speed := 15;
  END IF;

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
        AND (NOT v_zero OR q.first_human_touch_at IS NULL)
        AND (
          NOT v_breach
          OR (
            q.first_human_touch_at IS NULL
            AND q.opted_in_at <= now() - make_interval(mins => v_speed)
          )
        )
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
  uuid, text, text, text, text, uuid, uuid, integer, integer, date, date, text, text, jsonb, integer, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_case_list(
  uuid, text, text, text, text, uuid, uuid, integer, integer, date, date, text, text, jsonb, integer, boolean, boolean
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Timeline: type, actor, channel, timestamp. Never message bodies.
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
SECURITY DEFINER
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
          ) IS TRUE AS supersedes_manual
        FROM public.lead_status_changes sc
        WHERE sc.org_id = p_org_id AND sc.lead_id = p_lead_id
      ) s
      LEFT JOIN public.org_members actor ON actor.id = s.actor_member_id

      UNION ALL

      SELECT jsonb_build_object(
        'kind', 'activity',
        'id', a.id,
        'at', a.occurred_at,
        'category', a.category,
        'activityKind', a.kind,
        'headline', a.headline,
        'actorName', a.actor_label,
        'result', a.result,
        'resultReason', a.result_reason,
        'retryable', a.retryable,
        'retryKind', a.retry_kind,
        'retryId', a.retry_id,
        'detail', a.detail - 'outboundBody' - 'emailSubject' - 'outbound_body'
      ),
      a.occurred_at,
      a.id
      FROM public.activity_stream_source(p_org_id, NULL, NULL) a
      WHERE a.lead_id = p_lead_id
        AND a.kind NOT IN (
          'reply_received',
          'outcome_logged',
          'appointment_booked',
          'appointment_noshow',
          'appointment_rescheduled',
          'appointment_cancelled',
          'call_completed',
          'status_changed',
          'contact_updated',
          'opportunity_updated',
          'webhook_other',
          'ghost_job',
          'job_ran'
        )
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

GRANT EXECUTE ON FUNCTION public.load_org_case_timeline(uuid, uuid, jsonb, integer)
  TO authenticated, service_role;
