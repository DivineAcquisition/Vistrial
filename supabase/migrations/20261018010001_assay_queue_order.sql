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
  COALESCE(als.score, score.total) AS score,
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
    WHEN COALESCE(l.do_not_contact, false)
      OR EXISTS (SELECT 1 FROM public.lead_opt_outs oo WHERE oo.lead_id = l.id AND oo.org_id = l.org_id)
      THEN NULL
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
    WHEN COALESCE(pref.mode, 'best') = 'oldest' THEN 0
    ELSE COALESCE(als.score, score.total, l.current_score, -1)
  END AS sort_score,
  COALESCE(NULLIF(btrim(l.offer_name), ''), bp.offer_name) AS offer_name,
  als.tier AS assay_tier,
  als.score AS assay_score,
  COALESCE(als.early, false) AS assay_early,
  COALESCE(als.reasons, '[]'::jsonb) AS assay_reasons,
  COALESCE(als.no_call, false) AS assay_no_call,
  als.display_tier AS assay_display
FROM public.leads l
JOIN public.organizations o ON o.id = l.org_id
LEFT JOIN public.business_profiles bp ON bp.org_id = l.org_id
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
LEFT JOIN public.assay_lead_scores als ON als.lead_id = l.id AND als.org_id = l.org_id
LEFT JOIN LATERAL (
  SELECT p.mode
  FROM public.assay_queue_prefs p
  JOIN public.org_members m ON m.id = p.member_id AND m.org_id = l.org_id
  WHERE p.org_id = l.org_id AND m.user_id = auth.uid()
  LIMIT 1
) pref ON true
WHERE NOT l.is_test;


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
    'offerName', r.offer_name,
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
    'sortScore', r.sort_score,
    'assayTier', r.assay_tier,
    'assayScore', r.assay_score,
    'assayEarly', r.assay_early,
    'assayReasons', r.assay_reasons,
    'assayNoCall', r.assay_no_call,
    'assayDisplay', r.assay_display
  );
$$;

REVOKE ALL ON FUNCTION public.queue_row_to_json(public.queue_rows) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_row_to_json(public.queue_rows) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_visible_leads(p_org_id uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (id uuid, title text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id,
    btrim(concat_ws(' ', l.first_name, l.last_name)),
    concat_ws(' · ',
      CASE
        WHEN COALESCE(l.do_not_contact, false)
          OR EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.lead_id = l.id AND o.org_id = l.org_id)
        THEN 'Do not contact'
        WHEN als.score IS NULL THEN NULL
        ELSE initcap(als.tier) || ' ' || als.score::text
      END,
      l.status,
      NULLIF(btrim(concat_ws(' ', setter.display_name, closer.display_name)), '')
    )
  FROM public.leads l
  LEFT JOIN public.org_members setter ON setter.id = l.assigned_setter_id
  LEFT JOIN public.org_members closer ON closer.id = l.assigned_closer_id
  LEFT JOIN public.assay_lead_scores als ON als.lead_id = l.id AND als.org_id = l.org_id
  WHERE l.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND public.ws_lead_visible(p_org_id, l.id)
    AND l.merged_into IS NULL
    AND (
      btrim(concat_ws(' ', l.first_name, l.last_name, l.email, l.source)) ILIKE '%' || btrim(p_query) || '%'
      OR (
        length(regexp_replace(p_query, '\D', '', 'g')) >= 3
        AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
      )
    )
  ORDER BY l.last_touch_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$$;
