-- Reverse Prompt 17 call quality.

DROP TABLE IF EXISTS public.call_coaching_benchmarks;
DROP TABLE IF EXISTS public.call_coaching_gaming_signals;
DROP TABLE IF EXISTS public.call_coaching_findings;
DROP TABLE IF EXISTS public.call_objection_handlings;
DROP TABLE IF EXISTS public.call_quality_measures;
DROP TABLE IF EXISTS public.brief_views;

DROP FUNCTION IF EXISTS public.refresh_call_quality_benchmarks();
DROP FUNCTION IF EXISTS public.refresh_call_quality_org(uuid);
DROP FUNCTION IF EXISTS public.load_call_quality_language_corpus(uuid);
DROP FUNCTION IF EXISTS public.list_call_quality_pending(integer);
DROP FUNCTION IF EXISTS public.load_call_quality_manager_snapshot(uuid);
DROP FUNCTION IF EXISTS public.load_call_quality_rep_snapshot(uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.call_quality_catalog();
DROP FUNCTION IF EXISTS public.call_quality_patterns(uuid, uuid, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.call_quality_measure_in_scope(uuid, timestamptz, uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.record_brief_view(uuid, uuid);
DROP FUNCTION IF EXISTS public.acknowledge_call_coaching(uuid);
DROP FUNCTION IF EXISTS public.call_quality_require_job();
DROP FUNCTION IF EXISTS public.call_quality_row_visible(uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.call_quality_cutoff(uuid);

ALTER TABLE public.org_members
  DROP COLUMN IF EXISTS call_coaching_acknowledged_at;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_coaching_embargo_hours_range;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS call_coaching_embargo_hours;

DELETE FROM public.ops_job_runs WHERE job_name = 'call-quality';
DELETE FROM public.ops_job_catalog WHERE job_name = 'call-quality';

-- Restore pre-Prompt-17 brief loader (no whatWorks).
CREATE OR REPLACE FUNCTION public.load_org_precall_brief(
  p_org_id uuid,
  p_lead_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_setter text;
  v_closer text;
  v_score jsonb;
  v_objections jsonb;
  v_last_call jsonb;
  v_triage jsonb;
  v_quotes jsonb;
  v_no_shows integer;
  v_reschedules integer;
  v_inbound jsonb;
  v_opening jsonb;
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

  SELECT display_name INTO v_setter FROM public.org_members WHERE id = v_lead.assigned_setter_id;
  SELECT display_name INTO v_closer FROM public.org_members WHERE id = v_lead.assigned_closer_id;

  SELECT jsonb_build_object(
    'id', s.id,
    'total', s.total,
    'timeline', s.timeline_raw,
    'investmentCapacity', s.investment_capacity_raw,
    'decisionAuthority', s.decision_authority_raw,
    'painSeverity', s.pain_severity_raw,
    'triggeredBy', s.triggered_by,
    'createdAt', s.created_at
  )
  INTO v_score
  FROM public.readiness_scores s
  WHERE s.lead_id = p_lead_id AND s.org_id = p_org_id
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'verbatim', o.verbatim,
      'callId', o.call_id,
      'callType', c.type,
      'callOccurredAt', COALESCE(c.occurred_at, c.scheduled_at)
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb)
  INTO v_objections
  FROM public.objections o
  LEFT JOIN public.calls c ON c.id = o.call_id
  WHERE o.lead_id = p_lead_id AND o.org_id = p_org_id AND o.resolved = false;

  SELECT jsonb_build_object(
    'id', c.id,
    'type', c.type,
    'occurredAt', c.occurred_at,
    'scheduledAt', c.scheduled_at,
    'summary', e.summary,
    'nextStepAgreed', e.next_step_agreed,
    'nextStepState', e.next_step_state
  )
  INTO v_last_call
  FROM public.calls c
  LEFT JOIN public.call_extractions e ON e.call_id = c.id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id
  ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', c.id,
    'summary', e.summary,
    'timelineSignal', e.timeline_signal,
    'timelineSignalState', e.timeline_signal_state,
    'budgetSignal', e.budget_signal,
    'budgetSignalState', e.budget_signal_state,
    'decisionProcess', e.decision_process,
    'decisionProcessState', e.decision_process_state,
    'nextStepAgreed', e.next_step_agreed
  )
  INTO v_triage
  FROM public.calls c
  JOIN public.call_extractions e ON e.call_id = c.id
  WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id AND c.type = 'triage'
  ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(q.elem), '[]'::jsonb)
  INTO v_quotes
  FROM (
    SELECT elem
    FROM public.calls c
    JOIN public.call_extractions e ON e.call_id = c.id
    CROSS JOIN LATERAL jsonb_array_elements(e.quotes) AS elem
    WHERE c.lead_id = p_lead_id AND c.org_id = p_org_id
    ORDER BY COALESCE(c.occurred_at, c.scheduled_at, c.created_at) DESC
    LIMIT 3
  ) q;

  SELECT count(*)::integer INTO v_no_shows
  FROM public.calls
  WHERE lead_id = p_lead_id AND org_id = p_org_id AND outcome = 'no_show';

  SELECT count(*)::integer INTO v_reschedules
  FROM public.calls
  WHERE lead_id = p_lead_id AND org_id = p_org_id AND outcome = 'rescheduled';

  SELECT jsonb_build_object('at', t.occurred_at, 'channel', t.channel)
  INTO v_inbound
  FROM public.touches t
  WHERE t.lead_id = p_lead_id AND t.org_id = p_org_id AND t.direction = 'inbound'
  ORDER BY t.occurred_at DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'text', b.opening_text,
    'cacheKey', b.cache_key,
    'modelVersion', b.model_version
  )
  INTO v_opening
  FROM public.brief_openings b
  WHERE b.lead_id = p_lead_id AND b.org_id = p_org_id
  ORDER BY b.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'name', COALESCE(
        NULLIF(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
        NULLIF(btrim(v_lead.email), ''),
        'Unnamed lead'
      ),
      'source', v_lead.source,
      'campaign', v_lead.campaign,
      'offerName', v_lead.offer_name,
      'leadType', v_lead.lead_type,
      'status', v_lead.status,
      'optedInAt', v_lead.opted_in_at,
      'assignedSetterName', v_setter,
      'assignedCloserName', v_closer,
      'applicationAnswers', v_lead.application_answers
    ),
    'score', v_score,
    'openObjections', COALESCE(v_objections, '[]'::jsonb),
    'lastCall', v_last_call,
    'triage', v_triage,
    'quotes', COALESCE(v_quotes, '[]'::jsonb),
    'noShowCount', COALESCE(v_no_shows, 0),
    'rescheduleCount', COALESCE(v_reschedules, 0),
    'lastInbound', v_inbound,
    'cachedOpening', v_opening
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_org_precall_brief(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_org_precall_brief(uuid, uuid)
  TO authenticated, service_role;
