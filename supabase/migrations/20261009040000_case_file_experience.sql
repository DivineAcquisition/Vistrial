-- Case file experience: do-not-contact, reversible merges, notes, saved views,
-- a person's next action, list settings, and workspace-scoped search.
-- Existing lead, touch, and case-file tables stay. Nothing here writes to a CRM.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_reason text,
  ADD COLUMN IF NOT EXISTS do_not_contact_by uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS do_not_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into uuid;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS list_density text NOT NULL DEFAULT 'comfortable';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_list_density') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_list_density CHECK (list_density IN ('comfortable', 'dense'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_merged_into_other') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_merged_into_other CHECK (merged_into IS NULL OR merged_into <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_org_open_touch_idx
  ON public.leads (org_id, last_touch_at DESC)
  WHERE merged_into IS NULL AND NOT is_test;

-- Hide a merged lead from the existing case list. Direct links still resolve.
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
  l.first_human_touch_at,
  l.pipeline_stage,
  l.assigned_setter_id,
  l.assigned_closer_id,
  setter.display_name AS assigned_setter_name,
  closer.display_name AS assigned_closer_name
FROM public.leads l
LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
WHERE NOT l.is_test AND l.merged_into IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  visibility text NOT NULL CHECK (visibility IN ('shared', 'internal')),
  author_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON public.lead_notes (org_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, member_id, name)
);

CREATE TABLE IF NOT EXISTS public.lead_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  survivor_lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  merged_lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  merged_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  reverse_reason text,
  CHECK (survivor_lead_id <> merged_lead_id)
);

CREATE TABLE IF NOT EXISTS public.lead_plan_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'snoozed', 'replaced')),
  snoozed_until timestamptz,
  source text NOT NULL DEFAULT 'person' CHECK (source IN ('person', 'scribe')),
  created_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_plan_actions_one_open
  ON public.lead_plan_actions (lead_id) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- List settings the screens need, without handing over the whole configuration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.case_list_settings(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_values jsonb;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  v_values := public.config_effective_at(p_org_id) -> 'values';
  RETURN jsonb_build_object(
    'windowMinutes', COALESCE((v_values ->> 'response.first_touch_minutes')::integer, 15),
    'timezone', COALESCE(v_values ->> 'identity.timezone', 'America/New_York'),
    'bands', COALESCE(v_values -> 'qualification.scoring_bands', '[]'::jsonb),
    'facts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', f ->> 'key', 'label', f ->> 'label'))
      FROM jsonb_array_elements(COALESCE(v_values -> 'industry.case_facts', '[]'::jsonb)) f
      WHERE COALESCE(f ->> 'key', '') <> ''
    ), '[]'::jsonb),
    'countedTouches', COALESCE(v_values -> 'response.counted_touch_types', '["call","text","email"]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.case_list_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_list_settings(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The working list. Security invoker, so lead visibility stays with RLS.
-- ---------------------------------------------------------------------------

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
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF v_sort NOT IN ('urgency', 'last_touch', 'readiness', 'created', 'name') THEN
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
      l.current_score AS score,
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
      cf.band,
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
          CASE WHEN v_sort = 'urgency' AND v_dir = 'desc' THEN urgency_rank END ASC,
          CASE WHEN v_sort = 'urgency' AND v_dir = 'asc' THEN urgency_rank END DESC,
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

CREATE OR REPLACE FUNCTION public.case_view_counts(p_org_id uuid, p_window integer DEFAULT 15)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'needs_attention', count(*) FILTER (WHERE
      (l.do_not_contact IS FALSE AND NOT EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id)
        AND l.status NOT IN ('closed_won', 'closed_lost')
        AND l.first_human_touch_at IS NULL
        AND l.opted_in_at <= now() - make_interval(mins => GREATEST(p_window * 7 / 10, 1)))
      OR cf.status IN ('needs_review', 'held')),
    'hot', count(*) FILTER (WHERE lower(COALESCE(cf.band, '')) = 'hot'),
    'waiting', count(*) FILTER (WHERE l.status = 'follow_up'),
    'unassigned', count(*) FILTER (WHERE l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL),
    'agent_updated', count(*) FILTER (WHERE cf.built_at > now() - interval '2 days'),
    'do_not_contact', count(*) FILTER (WHERE l.do_not_contact OR EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id))
  )
  FROM public.leads l
  LEFT JOIN public.case_files cf ON cf.org_id = l.org_id AND cf.lead_id = l.id
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
    AND p_org_id IN (SELECT public.user_org_ids());
$$;

REVOKE ALL ON FUNCTION public.case_view_counts(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_view_counts(uuid, integer) TO authenticated, service_role;

-- Meaning search stays inside one workspace and inside what the caller can see.
-- Members get the lead, not the passage text.
CREATE OR REPLACE FUNCTION public.case_meaning_search(
  p_org_id uuid,
  p_embedding extensions.vector(768),
  p_limit integer DEFAULT 12
)
RETURNS TABLE (lead_id uuid, passage_id uuid, call_id uuid, speaker text, excerpt text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT e.lead_id, p.id, p.call_id, p.speaker,
    CASE
      WHEN p_org_id IN (SELECT public.user_staff_org_ids())
        OR public.is_platform_admin()
        OR public.user_has_org_role(p_org_id, VARIADIC ARRAY['owner'::org_role, 'operator'::org_role, 'setter'::org_role, 'closer'::org_role])
      THEN left(p.body, 180)
      ELSE NULL
    END,
    1 - (e.embedding <=> p_embedding)
  FROM public.scribe_embeddings e
  JOIN public.transcript_passages p ON p.id = e.passage_id AND p.org_id = e.org_id
  JOIN public.leads l ON l.id = e.lead_id AND l.org_id = e.org_id
  WHERE e.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND l.merged_into IS NULL
    AND (
      p_org_id NOT IN (SELECT public.user_operator_org_ids())
      OR e.lead_id IN (SELECT public.operator_visible_lead_ids())
    )
  ORDER BY e.embedding <=> p_embedding
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 25);
$$;

REVOKE ALL ON FUNCTION public.case_meaning_search(uuid, extensions.vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_meaning_search(uuid, extensions.vector, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Do not contact, merge, and export logging. Each checks the caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_lead_do_not_contact(p_lead_id uuid, p_on boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_member uuid;
BEGIN
  SELECT l.org_id INTO v_org FROM public.leads l WHERE l.id = p_lead_id;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_org IN (SELECT public.user_operator_org_ids()) AND p_lead_id NOT IN (SELECT public.operator_visible_lead_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT m.id INTO v_member FROM public.org_members m
  WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.active LIMIT 1;

  IF NOT p_on THEN
    IF NOT (public.is_platform_admin() OR v_org IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(v_org, VARIADIC ARRAY['owner'::org_role])) THEN
      RAISE EXCEPTION 'Only an owner or the Vistrial team can clear do not contact.' USING ERRCODE = '42501';
    END IF;
    IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
      RAISE EXCEPTION 'A reason is required to clear do not contact.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.leads
    SET do_not_contact = false, do_not_contact_reason = left(btrim(p_reason), 500), do_not_contact_by = v_member, do_not_contact_at = now()
    WHERE id = p_lead_id AND org_id = v_org;
  ELSE
    UPDATE public.leads
    SET do_not_contact = true,
        do_not_contact_reason = NULLIF(left(btrim(COALESCE(p_reason, '')), 500), ''),
        do_not_contact_by = v_member,
        do_not_contact_at = now()
    WHERE id = p_lead_id AND org_id = v_org;
    UPDATE public.follow_up_drafts
    SET status = 'discarded', discarded_reason = 'do_not_contact'
    WHERE org_id = v_org AND lead_id = p_lead_id AND status = 'pending';
    UPDATE public.approval_items
    SET status = 'dismissed', dismiss_reason = 'Marked do not contact.', decided_at = now()
    WHERE org_id = v_org AND status = 'pending' AND lead_ids @> ARRAY[p_lead_id];
  END IF;

  PERFORM public.ws_log(v_org, CASE WHEN p_on THEN 'lead.do_not_contact' ELSE 'lead.do_not_contact_cleared' END,
    'leads', p_lead_id::text, jsonb_build_object('reason', NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '')), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.set_lead_do_not_contact(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_do_not_contact(uuid, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_leads(p_survivor uuid, p_merged uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_other uuid;
  v_member uuid;
  v_id uuid;
  v_snap jsonb;
BEGIN
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Say why these are the same person.' USING ERRCODE = '22023';
  END IF;
  SELECT org_id, to_jsonb(l) INTO v_org, v_snap FROM public.leads l WHERE l.id = p_merged;
  SELECT org_id INTO v_other FROM public.leads WHERE id = p_survivor;
  IF v_org IS NULL OR v_org IS DISTINCT FROM v_other THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin() OR v_org IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(v_org, VARIADIC ARRAY['owner'::org_role])) THEN
    RAISE EXCEPTION 'Only an owner or the Vistrial team can merge.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE id IN (p_survivor, p_merged) AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'One of these leads is already merged.' USING ERRCODE = '22023';
  END IF;
  SELECT m.id INTO v_member FROM public.org_members m WHERE m.org_id = v_org AND m.user_id = auth.uid() AND m.active LIMIT 1;
  UPDATE public.leads SET merged_into = p_survivor, updated_at = now() WHERE id = p_merged AND org_id = v_org;
  INSERT INTO public.lead_merges (org_id, survivor_lead_id, merged_lead_id, snapshot, reason, merged_by_member_id)
  VALUES (v_org, p_survivor, p_merged, v_snap, left(btrim(p_reason), 500), v_member)
  RETURNING id INTO v_id;
  PERFORM public.ws_log(v_org, 'lead.merged', 'lead_merges', v_id::text,
    jsonb_build_object('survivor', p_survivor, 'merged', p_merged), auth.uid());
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_leads(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unmerge_lead(p_merge_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.lead_merges;
  v_member uuid;
BEGIN
  SELECT * INTO v_row FROM public.lead_merges WHERE id = p_merge_id;
  IF v_row.id IS NULL OR v_row.org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin() OR v_row.org_id IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(v_row.org_id, VARIADIC ARRAY['owner'::org_role])) THEN
    RAISE EXCEPTION 'Only an owner or the Vistrial team can undo a merge.' USING ERRCODE = '42501';
  END IF;
  IF v_row.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This merge was already undone.' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Say why this merge should be undone.' USING ERRCODE = '22023';
  END IF;
  SELECT m.id INTO v_member FROM public.org_members m WHERE m.org_id = v_row.org_id AND m.user_id = auth.uid() AND m.active LIMIT 1;
  UPDATE public.leads SET merged_into = NULL, updated_at = now() WHERE id = v_row.merged_lead_id AND org_id = v_row.org_id;
  UPDATE public.lead_merges
  SET reversed_at = now(), reversed_by_member_id = v_member, reverse_reason = left(btrim(p_reason), 500)
  WHERE id = p_merge_id;
  PERFORM public.ws_log(v_row.org_id, 'lead.unmerged', 'lead_merges', p_merge_id::text, jsonb_build_object('reason', left(btrim(p_reason), 500)), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.unmerge_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_lead(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.case_record_export(p_org_id uuid, p_what text, p_target text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin() OR p_org_id IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(p_org_id, VARIADIC ARRAY['owner'::org_role])) THEN
    RAISE EXCEPTION 'You cannot export.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ws_log(p_org_id, 'case.exported', 'leads', p_target, jsonb_build_object('what', left(COALESCE(p_what, 'list'), 80)), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.case_record_export(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_record_export(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row security
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_plan_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_notes_select ON public.lead_notes;
CREATE POLICY lead_notes_select ON public.lead_notes FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (visibility = 'shared' OR org_id IN (SELECT public.user_staff_org_ids()) OR public.is_platform_admin())
  );
DROP POLICY IF EXISTS ws_operator_lead_scope ON public.lead_notes;
CREATE POLICY ws_operator_lead_scope ON public.lead_notes AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT (org_id IN (SELECT public.user_operator_org_ids()))) OR (lead_id IN (SELECT public.operator_visible_lead_ids())));
DROP POLICY IF EXISTS lead_notes_insert ON public.lead_notes;
CREATE POLICY lead_notes_insert ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND lead_id IN (SELECT id FROM public.leads WHERE org_id = lead_notes.org_id)
    AND author_member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid() AND org_id = lead_notes.org_id AND active)
    AND (visibility = 'shared' OR org_id IN (SELECT public.user_staff_org_ids()) OR public.is_platform_admin())
  );
GRANT SELECT, INSERT ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;

DROP POLICY IF EXISTS lead_saved_views_select ON public.lead_saved_views;
CREATE POLICY lead_saved_views_select ON public.lead_saved_views FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (shared OR member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid() AND org_id = lead_saved_views.org_id))
  );
DROP POLICY IF EXISTS lead_saved_views_write ON public.lead_saved_views;
CREATE POLICY lead_saved_views_write ON public.lead_saved_views FOR ALL TO authenticated
  USING (member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid() AND org_id = lead_saved_views.org_id))
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND member_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid() AND org_id = lead_saved_views.org_id AND active)
    AND (NOT shared OR public.is_platform_admin() OR org_id IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(org_id, VARIADIC ARRAY['owner'::org_role]))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_saved_views TO authenticated;
GRANT ALL ON public.lead_saved_views TO service_role;

DROP POLICY IF EXISTS lead_merges_select ON public.lead_merges;
CREATE POLICY lead_merges_select ON public.lead_merges FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (public.is_platform_admin() OR org_id IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(org_id, VARIADIC ARRAY['owner'::org_role]))
  );
GRANT SELECT ON public.lead_merges TO authenticated;
GRANT ALL ON public.lead_merges TO service_role;

DROP POLICY IF EXISTS lead_plan_actions_select ON public.lead_plan_actions;
CREATE POLICY lead_plan_actions_select ON public.lead_plan_actions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS ws_operator_lead_scope ON public.lead_plan_actions;
CREATE POLICY ws_operator_lead_scope ON public.lead_plan_actions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (org_id IN (SELECT public.user_operator_org_ids()))) OR (lead_id IN (SELECT public.operator_visible_lead_ids())));
DROP POLICY IF EXISTS lead_plan_actions_write ON public.lead_plan_actions;
CREATE POLICY lead_plan_actions_write ON public.lead_plan_actions FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND lead_id IN (SELECT id FROM public.leads WHERE org_id = lead_plan_actions.org_id))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()) AND lead_id IN (SELECT id FROM public.leads WHERE org_id = lead_plan_actions.org_id));
GRANT SELECT, INSERT, UPDATE ON public.lead_plan_actions TO authenticated;
GRANT ALL ON public.lead_plan_actions TO service_role;
