CREATE OR REPLACE FUNCTION public.load_case_experience(p_org_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_window integer := LEAST(GREATEST(COALESCE((p_filter ->> 'windowMinutes')::integer, 15), 1), 10080);
  v_sort text := COALESCE(p_filter ->> 'sort', 'urgency');
  v_dir text := CASE WHEN p_filter ->> 'dir' = 'asc' THEN 'asc' ELSE 'desc' END;
  v_q text := NULLIF(btrim(COALESCE(p_filter ->> 'q', '')), '');
  v_offset integer := LEAST(GREATEST(COALESCE((p_filter ->> 'offset')::integer, 0), 0), 100000);
  v_rows jsonb;
  v_order text := CASE WHEN p_filter ->> 'orderMode' = 'oldest' THEN 'oldest' ELSE 'best' END;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF v_sort NOT IN ('urgency', 'last_touch', 'readiness', 'created', 'name', 'best') THEN
    v_sort := 'urgency';
  END IF;

  WITH base AS (
    SELECT
      l.id,
      l.org_id,
      COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), NULLIF(btrim(l.email), ''), 'Unnamed lead') AS name,
      l.email,
      l.phone,
      l.source,
      l.status::text AS status,
      COALESCE(als.score, l.current_score) AS score,
      l.opted_in_at,
      l.created_at,
      l.last_touch_at,
      l.first_human_touch_at,
      l.pipeline_stage,
      l.assigned_setter_id,
      l.assigned_closer_id,
      l.do_not_contact,
      setter.display_name AS setter_name,
      closer.display_name AS closer_name,
      cf.summary AS headline,
      COALESCE(als.tier, cf.band) AS band,
      cf.status AS file_status,
      cf.next_step,
      cf.built_at,
      EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id) AS opted_out,
      CASE
        WHEN l.do_not_contact
          OR EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id)
          OR l.status IN ('closed_won', 'closed_lost') THEN 'not_applicable'
        WHEN l.first_human_touch_at IS NOT NULL
          AND l.first_human_touch_at <= l.opted_in_at + make_interval(mins => v_window) THEN 'on_time'
        WHEN l.first_human_touch_at IS NOT NULL THEN 'missed'
        WHEN now() >= l.opted_in_at + make_interval(mins => v_window) THEN 'missed'
        WHEN now() >= l.opted_in_at + make_interval(mins => GREATEST(v_window * 7 / 10, 1)) THEN 'at_risk'
        ELSE 'on_time'
      END AS response_state,
      EXISTS (
        SELECT 1 FROM public.agent_activity_runs r
        WHERE r.org_id = l.org_id AND r.lead_id = l.id
          AND r.status IN ('queued', 'working', 'waiting_person', 'waiting_provider')
      ) AS agent_open,
      EXISTS (
        SELECT 1 FROM public.objections ob
        WHERE ob.org_id = l.org_id AND ob.lead_id = l.id AND NOT ob.resolved
      ) AS has_objection,
      (
        SELECT t.type::text FROM public.touches t
        WHERE t.org_id = l.org_id AND t.lead_id = l.id
        ORDER BY t.occurred_at DESC LIMIT 1
      ) AS last_touch_kind,
      (
        SELECT a.body FROM public.lead_plan_actions a
        WHERE a.org_id = l.org_id AND a.lead_id = l.id AND a.status = 'open'
        LIMIT 1
      ) AS person_action
    FROM public.leads l
    LEFT JOIN public.case_files cf ON cf.org_id = l.org_id AND cf.lead_id = l.id
    LEFT JOIN public.assay_lead_scores als ON als.org_id = l.org_id AND als.lead_id = l.id
    LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
    LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.merged_into IS NULL
  ), filtered AS (
    SELECT b.*,
      CASE b.response_state
        WHEN 'missed' THEN 0
        WHEN 'at_risk' THEN 1
        WHEN 'on_time' THEN 2
        ELSE 3
      END AS urgency_rank
    FROM base b
    WHERE (v_q IS NULL
        OR b.name ILIKE '%' || v_q || '%'
        OR COALESCE(b.email, '') ILIKE '%' || v_q || '%'
        OR COALESCE(b.phone, '') ILIKE '%' || v_q || '%'
        OR COALESCE(b.headline, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.lead_notes n
          WHERE n.org_id = b.org_id AND n.lead_id = b.id AND n.body ILIKE '%' || v_q || '%'
        ))
      AND (NULLIF(p_filter ->> 'status', '') IS NULL OR b.status = p_filter ->> 'status')
      AND (NULLIF(p_filter ->> 'source', '') IS NULL OR b.source = p_filter ->> 'source')
      AND (NULLIF(p_filter ->> 'assignee', '') IS NULL
        OR (p_filter ->> 'assignee' = 'unassigned' AND b.assigned_setter_id IS NULL AND b.assigned_closer_id IS NULL)
        OR (p_filter ->> 'assignee' = 'me' AND (b.assigned_setter_id::text = p_filter ->> 'memberId' OR b.assigned_closer_id::text = p_filter ->> 'memberId'))
        OR b.assigned_setter_id::text = p_filter ->> 'assignee'
        OR b.assigned_closer_id::text = p_filter ->> 'assignee')
      AND (NULLIF(p_filter ->> 'response', '') IS NULL OR b.response_state = p_filter ->> 'response')
      AND (COALESCE((p_filter ->> 'flagged')::boolean, false) = false OR b.agent_open OR b.file_status = 'needs_review' OR b.file_status = 'held')
      AND (COALESCE((p_filter ->> 'needsReview')::boolean, false) = false OR b.file_status IN ('needs_review', 'held'))
      AND (COALESCE((p_filter ->> 'unresolvedObjection')::boolean, false) = false OR b.has_objection)
      AND (COALESCE((p_filter ->> 'optOut')::boolean, false) = false OR b.opted_out OR b.do_not_contact)
      AND (NULLIF(p_filter ->> 'band', '') IS NULL OR lower(COALESCE(b.band, '')) = lower(p_filter ->> 'band')
        OR (p_filter ->> 'band' = 'unscored' AND b.score IS NULL AND b.band IS NULL))
      AND (NULLIF(p_filter ->> 'createdFrom', '') IS NULL OR b.created_at >= (p_filter ->> 'createdFrom')::timestamptz)
      AND (NULLIF(p_filter ->> 'createdTo', '') IS NULL OR b.created_at < ((p_filter ->> 'createdTo')::date + 1)::timestamptz)
      AND (NULLIF(p_filter ->> 'touchFrom', '') IS NULL OR b.last_touch_at >= (p_filter ->> 'touchFrom')::timestamptz)
      AND (NULLIF(p_filter ->> 'touchTo', '') IS NULL OR b.last_touch_at < ((p_filter ->> 'touchTo')::date + 1)::timestamptz)
      AND (NULLIF(p_filter ->> 'factKey', '') IS NULL OR EXISTS (
        SELECT 1 FROM public.case_file_fields f
        WHERE f.org_id = b.org_id AND f.lead_id = b.id AND f.field_key = p_filter ->> 'factKey'
          AND COALESCE(f.value #>> '{}', f.value::text) ILIKE '%' || COALESCE(p_filter ->> 'factValue', '') || '%'
      ))
      AND (NULLIF(p_filter ->> 'view', '') IS NULL
        OR (p_filter ->> 'view' = 'needs_attention' AND (b.response_state IN ('missed', 'at_risk') OR b.file_status IN ('needs_review', 'held')))
        OR (p_filter ->> 'view' = 'hot' AND lower(COALESCE(b.band, '')) = 'hot')
        OR (p_filter ->> 'view' = 'waiting' AND b.status = 'follow_up')
        OR (p_filter ->> 'view' = 'unassigned' AND b.assigned_setter_id IS NULL AND b.assigned_closer_id IS NULL)
        OR (p_filter ->> 'view' = 'agent_updated' AND b.built_at > now() - interval '2 days')
        OR (p_filter ->> 'view' = 'do_not_contact' AND (b.opted_out OR b.do_not_contact)))
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page) - 'ord' ORDER BY page.ord), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT numbered.*
    FROM (
      SELECT filtered.*, row_number() OVER (
        ORDER BY
          CASE WHEN v_sort IN ('urgency', 'best') AND (do_not_contact OR opted_out) THEN 1 ELSE 0 END ASC,
          CASE WHEN v_sort = 'urgency' AND v_dir = 'desc' THEN urgency_rank END ASC,
          CASE WHEN v_sort = 'urgency' AND v_dir = 'asc' THEN urgency_rank END DESC,
          CASE WHEN v_sort = 'urgency' AND v_order = 'best' THEN COALESCE(score, -1) END DESC,
          CASE WHEN v_sort = 'best' THEN COALESCE(score, -1) END DESC,
          CASE WHEN v_sort = 'readiness' AND v_dir = 'desc' THEN COALESCE(score, -1) END DESC,
          CASE WHEN v_sort = 'readiness' AND v_dir = 'asc' THEN COALESCE(score, -1) END ASC,
          CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN created_at END DESC,
          CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN created_at END ASC,
          CASE WHEN v_sort = 'name' AND v_dir = 'asc' THEN lower(name) END ASC,
          CASE WHEN v_sort = 'name' AND v_dir = 'desc' THEN lower(name) END DESC,
          CASE WHEN v_sort IN ('urgency', 'last_touch') AND v_dir = 'desc' THEN COALESCE(last_touch_at, '-infinity'::timestamptz) END DESC,
          CASE WHEN v_sort IN ('urgency', 'last_touch') AND v_dir = 'asc' THEN COALESCE(last_touch_at, 'infinity'::timestamptz) END ASC,
          id DESC
      ) AS ord
      FROM filtered
    ) numbered
    WHERE numbered.ord > v_offset AND numbered.ord <= v_offset + v_limit + 1
  ) page;

  v_rows := COALESCE(v_rows, '[]'::jsonb);
  RETURN jsonb_build_object(
    'rows', CASE WHEN jsonb_array_length(v_rows) > v_limit
      THEN (SELECT COALESCE(jsonb_agg(elem ORDER BY n), '[]'::jsonb) FROM jsonb_array_elements(v_rows) WITH ORDINALITY t(elem, n) WHERE n <= v_limit)
      ELSE v_rows END,
    'hasMore', jsonb_array_length(v_rows) > v_limit
  );
END;
$$;


REVOKE ALL ON FUNCTION public.load_case_experience(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_case_experience(uuid, jsonb, integer) TO authenticated, service_role;
