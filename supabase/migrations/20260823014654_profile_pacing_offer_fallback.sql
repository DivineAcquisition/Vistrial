-- 20260823014654 already ran on the Vistrial project. This file is in the repo
-- so schema_migrations matches. CREATE OR REPLACE keeps existing functions.

-- Payment structure paces follow-up length. Profile offer_name fills in when a lead has none.

CREATE OR REPLACE FUNCTION public.apply_business_profile_configuration(
  p_org_id uuid,
  p_member_id uuid,
  p_stage public.profile_stage
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.business_profiles%ROWTYPE;
  v_applied jsonb := '[]'::jsonb;
  v_soft integer;
  v_hard integer;
  v_factors public.score_factor[];
  v_w jsonb;
  v_share integer;
  v_sum integer;
  v_map_id uuid;
  r record;
  v_delay integer;
  v_len integer;
  v_dur integer;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO p FROM public.business_profiles WHERE org_id = p_org_id;
  IF p.org_id IS NULL THEN
    RETURN v_applied;
  END IF;

  IF p_stage = 'business' THEN
    IF p.sales_cycle_days IS NOT NULL THEN
      UPDATE public.organizations
      SET sales_cycle_days = LEAST(365, GREATEST(14, p.sales_cycle_days))
      WHERE id = p_org_id;
      v_applied := v_applied || jsonb_build_array('Cohort maturation now waits ' || p.sales_cycle_days || ' days.');

      v_soft := LEAST(90, GREATEST(3, ceil(p.sales_cycle_days / 4.0)::integer));
      v_hard := LEAST(180, GREATEST(v_soft + 1, ceil(p.sales_cycle_days / 2.0)::integer));
      UPDATE public.score_configs
      SET ghost_days_soft = v_soft, ghost_days_hard = v_hard
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'Ghost thresholds set to ' || v_soft || ' and ' || v_hard || ' days.');
    END IF;

    IF p.touches_to_close IS NOT NULL OR p.sales_cycle_days IS NOT NULL THEN
      UPDATE public.follow_up_settings
      SET
        max_sequence_length = LEAST(8, GREATEST(1, ceil(COALESCE(p.touches_to_close, 6) / 2.0)::integer)),
        max_sequence_duration_days = LEAST(90, GREATEST(1, ceil(COALESCE(p.sales_cycle_days, 60) / 3.0)::integer))
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array('Sequence length and duration paced to your cycle.');
    END IF;

    IF p.close_motion IS NOT NULL THEN
      v_delay := CASE p.close_motion WHEN 'one_call' THEN 24 WHEN 'two_call' THEN 48 ELSE 72 END;
      UPDATE public.follow_up_routing_rules
      SET sequence_steps = jsonb_build_array(jsonb_build_object('delayHours', v_delay))
      WHERE org_id = p_org_id AND branch = 'follow_up_scheduled';
      v_applied := v_applied || jsonb_build_array(
        'Post-call follow-up waits ' || v_delay || ' hours, matching a ' || p.close_motion || ' close.');
    END IF;

    IF p.payment_structure IS NOT NULL THEN
      SELECT max_sequence_length, max_sequence_duration_days
      INTO v_len, v_dur
      FROM public.follow_up_settings WHERE org_id = p_org_id;
      v_len := COALESCE(v_len, 3);
      v_dur := COALESCE(v_dur, 21);
      IF p.payment_structure = 'pif' THEN
        v_len := GREATEST(1, v_len - 1);
        v_dur := GREATEST(1, ceil(v_dur * 0.75)::integer);
      ELSIF p.payment_structure IN ('plan', 'bnpl') THEN
        v_len := LEAST(8, v_len + 1);
        v_dur := LEAST(90, ceil(v_dur * 1.25)::integer);
      END IF;
      UPDATE public.follow_up_settings
      SET max_sequence_length = v_len, max_sequence_duration_days = v_dur
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'Sequence pacing adjusted for a ' || replace(p.payment_structure::text, '_', ' ')
        || ' payment structure.');
    END IF;
  END IF;

  IF p_stage = 'funnel' THEN
    FOR r IN
      SELECT
        f ->> 'answer_key' AS answer_key,
        nullif(f ->> 'factor', '')::public.score_factor AS factor
      FROM jsonb_array_elements(p.application_fields) f
      WHERE nullif(f ->> 'answer_key', '') IS NOT NULL
        AND nullif(f ->> 'factor', '') IS NOT NULL
    LOOP
      INSERT INTO public.score_field_maps (org_id, field_name, factor)
      VALUES (p_org_id, r.answer_key, r.factor)
      ON CONFLICT (org_id, field_name) DO UPDATE SET factor = EXCLUDED.factor;
    END LOOP;
    v_applied := v_applied || jsonb_build_array(
      'Application answers routed to factors: '
      || COALESCE((SELECT string_agg(f ->> 'answer_key', ', ')
                   FROM jsonb_array_elements(p.application_fields) f
                   WHERE nullif(f ->> 'factor', '') IS NOT NULL), 'none yet') || '.');
  END IF;

  IF p_stage = 'qualification' THEN
    SELECT array_agg(DISTINCT public.profile_signal_factor(s))
    INTO v_factors
    FROM unnest(p.qualification_signals) AS s
    WHERE public.profile_signal_factor(s) IS NOT NULL;

    IF v_factors IS NOT NULL AND array_length(v_factors, 1) > 0 THEN
      v_share := (60 / array_length(v_factors, 1))::integer;
      v_w := jsonb_build_object(
        'timeline', 10 + CASE WHEN 'timeline' = ANY (v_factors) THEN v_share ELSE 0 END,
        'investment_capacity', 10 + CASE WHEN 'investment_capacity' = ANY (v_factors) THEN v_share ELSE 0 END,
        'decision_authority', 10 + CASE WHEN 'decision_authority' = ANY (v_factors) THEN v_share ELSE 0 END,
        'pain_severity', 10 + CASE WHEN 'pain_severity' = ANY (v_factors) THEN v_share ELSE 0 END
      );
      v_sum := (v_w ->> 'timeline')::integer + (v_w ->> 'investment_capacity')::integer
        + (v_w ->> 'decision_authority')::integer + (v_w ->> 'pain_severity')::integer;
      -- Integer division leaves a remainder. It lands on timeline so the four
      -- weights total exactly 100, which the table constraint requires.
      v_w := jsonb_set(v_w, '{timeline}', to_jsonb((v_w ->> 'timeline')::integer + (100 - v_sum)));

      UPDATE public.score_configs SET
        timeline_weight = (v_w ->> 'timeline')::integer,
        investment_capacity_weight = (v_w ->> 'investment_capacity')::integer,
        decision_authority_weight = (v_w ->> 'decision_authority')::integer,
        pain_severity_weight = (v_w ->> 'pain_severity')::integer
      WHERE org_id = p_org_id;

      v_applied := v_applied || jsonb_build_array(
        'Scoring weights set to timeline ' || (v_w ->> 'timeline')
        || ', investment ' || (v_w ->> 'investment_capacity')
        || ', authority ' || (v_w ->> 'decision_authority')
        || ', pain ' || (v_w ->> 'pain_severity') || '.');
    END IF;

    -- Investment and timeline bands become answer rules on the fields the
    -- application already sends.
    FOR r IN
      SELECT 'investment_capacity'::public.score_factor AS factor, 'budget' AS field, p.price_bands AS bands
      UNION ALL
      SELECT 'timeline'::public.score_factor, 'timeline', p.timeline_bands
    LOOP
      CONTINUE WHEN jsonb_array_length(r.bands) = 0;

      INSERT INTO public.score_field_maps (org_id, field_name, factor)
      VALUES (p_org_id, r.field, r.factor)
      ON CONFLICT (org_id, field_name) DO UPDATE SET factor = EXCLUDED.factor
      RETURNING id INTO v_map_id;

      IF v_map_id IS NULL THEN
        SELECT id INTO v_map_id FROM public.score_field_maps
        WHERE org_id = p_org_id AND field_name = r.field;
      END IF;

      DELETE FROM public.score_field_rules WHERE field_map_id = v_map_id;
      INSERT INTO public.score_field_rules (org_id, field_map_id, kind, answer_value, score)
      SELECT p_org_id, v_map_id, 'choice', b ->> 'answer',
        LEAST(100, GREATEST(0, (b ->> 'score')::integer))
      FROM jsonb_array_elements(r.bands) b
      WHERE nullif(b ->> 'answer', '') IS NOT NULL AND nullif(b ->> 'score', '') IS NOT NULL;

      v_applied := v_applied || jsonb_build_array(
        jsonb_array_length(r.bands) || ' bands written onto the ' || r.field || ' field.');
    END LOOP;
  END IF;

  IF p_stage = 'process' THEN
    IF p.speed_to_lead_intent_minutes IS NOT NULL THEN
      UPDATE public.score_configs
      SET speed_to_lead_minutes = LEAST(1440, GREATEST(1, p.speed_to_lead_intent_minutes))
      WHERE org_id = p_org_id;
      v_applied := v_applied || jsonb_build_array(
        'The alarm band now fires at ' || p.speed_to_lead_intent_minutes || ' minutes.');
    END IF;

    -- Deduplication. A branch the CRM already runs is switched off here so the
    -- prospect does not get the same nudge twice.
    FOR r IN
      SELECT 'no_show'::public.follow_up_branch AS branch, p.after_no_show AS current, 'a no-show' AS label
      UNION ALL SELECT 'follow_up_scheduled', p.after_call, 'a call'
      UNION ALL SELECT 'ghost_risk', p.after_silence, 'silence'
    LOOP
      CONTINUE WHEN r.current IS NULL;
      UPDATE public.follow_up_routing_rules
      SET enabled = (r.current <> 'crm_sequence')
      WHERE org_id = p_org_id AND branch = r.branch;
      v_applied := v_applied || jsonb_build_array(
        CASE WHEN r.current = 'crm_sequence'
          THEN 'Your CRM already follows up after ' || r.label || ', so Vistrial will not.'
          ELSE 'Vistrial will draft follow-up after ' || r.label || '.' END);
    END LOOP;
  END IF;

  IF p_stage = 'objections' THEN
    DELETE FROM public.objection_vocabulary WHERE org_id = p_org_id;
    INSERT INTO public.objection_vocabulary (org_id, type, phrasing, response, rank)
    SELECT DISTINCT ON ((o ->> 'type')::public.objection_type)
      p_org_id,
      (o ->> 'type')::public.objection_type,
      o ->> 'phrasing',
      nullif(o ->> 'response', ''),
      ord
    FROM jsonb_array_elements(p.top_objections) WITH ORDINALITY AS t(o, ord)
    WHERE nullif(o ->> 'type', '') IS NOT NULL AND nullif(trim(o ->> 'phrasing'), '') IS NOT NULL
    ORDER BY (o ->> 'type')::public.objection_type, ord;
    v_applied := v_applied || jsonb_build_array(
      (SELECT count(*) FROM public.objection_vocabulary WHERE org_id = p_org_id)
      || ' objections seeded before a single transcript has arrived.');
  END IF;

  IF p_stage = 'voice' THEN
    UPDATE public.org_voice_profiles SET
      formality = COALESCE(p.voice_formality, formality),
      banned_words = CASE
        WHEN array_length(p.never_say, 1) IS NULL THEN banned_words
        ELSE ARRAY(SELECT DISTINCT unnest(p.never_say)) END
    WHERE org_id = p_org_id;

    IF p.channel_preference IS NOT NULL THEN
      UPDATE public.follow_up_settings
      SET default_channel = p.channel_preference::public.touch_channel
      WHERE org_id = p_org_id;
      UPDATE public.follow_up_routing_rules
      SET channel = p.channel_preference::public.touch_channel
      WHERE org_id = p_org_id;
    END IF;

    v_applied := v_applied || jsonb_build_array(
      'Voice profile set to ' || COALESCE(p.voice_formality::text, 'unchanged')
      || ' on ' || COALESCE(p.channel_preference, 'the existing channel') || '.');
  END IF;

  PERFORM public.business_profile_refresh_completeness(p_org_id);
  PERFORM public.benchmark_refresh_org_metrics(p_org_id);

  RETURN v_applied;
END;
$$;


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
      'offerName', COALESCE(v_lead.offer_name, (SELECT offer_name FROM public.business_profiles WHERE org_id = p_org_id)),
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
  END AS sort_score,
  COALESCE(NULLIF(btrim(l.offer_name), ''), bp.offer_name) AS offer_name
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
    'sortScore', r.sort_score
  );
$$;

REVOKE ALL ON FUNCTION public.queue_row_to_json(public.queue_rows) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_row_to_json(public.queue_rows) TO authenticated, service_role;
