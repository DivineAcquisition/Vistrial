-- Reverse Prompt 15 mobile columns and restore the Prompt 12 adoption_watch body.

DROP TRIGGER IF EXISTS touches_stamp_mobile_training ON public.touches;
DROP FUNCTION IF EXISTS public.stamp_mobile_outcome_training();
DROP FUNCTION IF EXISTS public.mark_mobile_training(uuid, text);

ALTER TABLE public.touches
  DROP COLUMN IF EXISTS client_surface,
  DROP COLUMN IF EXISTS queued_offline,
  DROP COLUMN IF EXISTS client_logged_at,
  DROP COLUMN IF EXISTS client_event_id,
  DROP COLUMN IF EXISTS expected_lead_status,
  DROP COLUMN IF EXISTS sync_discrepancy;

ALTER TABLE public.org_members
  DROP COLUMN IF EXISTS first_mobile_session_at,
  DROP COLUMN IF EXISTS logged_outcome_from_mobile_at,
  DROP COLUMN IF EXISTS mobile_walkthrough_completed_at;

DROP TYPE IF EXISTS public.client_surface;

CREATE OR REPLACE FUNCTION public.adoption_watch(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  sc public.score_configs%ROWTYPE;
  v_alarms jsonb := '[]'::jsonb;
  v_ingested_24h bigint;
  v_ingested_7d bigint;
  v_touch_this jsonb;
  v_touch_prev jsonb;
  v_touch_k bigint;
  v_touch_n bigint;
  v_log_k bigint;
  v_log_n bigint;
  v_log_prev_k bigint;
  v_log_prev_n bigint;
  v_median numeric;
  v_approved bigint;
  v_rejected bigint;
  v_members jsonb;
  v_idle jsonb;
  v_unmatched bigint;
  v_days integer;
BEGIN
  PERFORM public.profile_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO sc FROM public.score_configs WHERE org_id = p_org_id;

  IF o.activated_at IS NULL THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  v_days := floor(EXTRACT(EPOCH FROM (now() - o.activated_at)) / 86400.0)::integer;

  SELECT count(*) INTO v_ingested_24h
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_ingested_7d
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '7 days';

  IF v_days >= 1 AND v_ingested_24h = 0 THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'no_leads_24h',
      'plain', 'No lead has arrived in twenty-four hours. Either the form stopped or the CRM connection did.'
    ));
  END IF;

  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_touch_n, v_touch_k
  FROM public.leads WHERE org_id = p_org_id AND opted_in_at >= now() - interval '7 days';
  v_touch_this := public.reporting_rate(v_touch_k, v_touch_n, public.reporting_diag_min(), false);

  SELECT count(*), count(*) FILTER (WHERE first_human_touch_at IS NOT NULL)
  INTO v_touch_n, v_touch_k
  FROM public.leads
  WHERE org_id = p_org_id
    AND opted_in_at >= now() - interval '14 days' AND opted_in_at < now() - interval '7 days';
  v_touch_prev := public.reporting_rate(v_touch_k, v_touch_n, public.reporting_diag_min(), false);

  SELECT count(*), count(*) FILTER (WHERE outcome IS NOT NULL)
  INTO v_log_n, v_log_k
  FROM public.calls
  WHERE org_id = p_org_id AND scheduled_at >= now() - interval '7 days' AND scheduled_at < now();

  SELECT count(*), count(*) FILTER (WHERE outcome IS NOT NULL)
  INTO v_log_prev_n, v_log_prev_k
  FROM public.calls
  WHERE org_id = p_org_id
    AND scheduled_at >= now() - interval '14 days' AND scheduled_at < now() - interval '7 days';

  IF v_ingested_7d >= 5 AND NOT EXISTS (
    SELECT 1 FROM public.touches t
    WHERE t.org_id = p_org_id AND t.type = 'human' AND t.occurred_at >= now() - interval '7 days'
  ) THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'leads_no_touches',
      'plain', v_ingested_7d || ' leads arrived this week and not one human touch was logged. If the team is working '
        || 'them in the CRM and not recording it here, every number on this page understates what actually happened.'
    ));
  END IF;

  SELECT percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_human_touch_at - opted_in_at)) / 60.0
  )
  INTO v_median
  FROM public.leads
  WHERE org_id = p_org_id AND opted_in_at >= now() - interval '14 days'
    AND first_human_touch_at IS NOT NULL AND first_human_touch_at >= opted_in_at;

  SELECT count(*) FILTER (WHERE status IN ('approved', 'sent')),
         count(*) FILTER (WHERE status = 'rejected')
  INTO v_approved, v_rejected
  FROM public.follow_up_drafts
  WHERE org_id = p_org_id AND created_at >= now() - interval '14 days';

  IF v_approved + v_rejected >= 10 AND v_rejected * 2 > v_approved + v_rejected THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'draft_rejection_high',
      'plain', 'More than half of the drafts written in the last fortnight were rejected. The voice profile is not '
        || 'reading like you, and adding real sent messages to it is the fix.'
    ));
  END IF;

  SELECT count(*) INTO v_unmatched
  FROM public.unmatched_transcripts WHERE org_id = p_org_id AND status = 'open';
  IF v_unmatched > 0 THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'transcripts_unmatched',
      'plain', v_unmatched || ' transcripts arrived without matching a call, so no brief and no extraction came from them.'
    ));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member_id', m.id, 'name', m.display_name, 'role', m.role,
    'touches', x.touches, 'outcomes', x.outcomes, 'approvals', x.approvals,
    'last_active_at', x.last_active_at
  ) ORDER BY m.display_name), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.touches t
       WHERE t.actor_member_id = m.id AND t.occurred_at >= now() - interval '7 days') AS touches,
      (SELECT count(*) FROM public.calls c
       WHERE c.ran_by_member_id = m.id AND c.outcome IS NOT NULL
         AND c.updated_at >= now() - interval '7 days') AS outcomes,
      (SELECT count(*) FROM public.follow_up_drafts d
       WHERE d.approved_by_member_id = m.id AND d.approved_at >= now() - interval '7 days') AS approvals,
      GREATEST(
        (SELECT max(t.occurred_at) FROM public.touches t WHERE t.actor_member_id = m.id),
        (SELECT max(d.approved_at) FROM public.follow_up_drafts d WHERE d.approved_by_member_id = m.id)
      ) AS last_active_at
  ) x
  WHERE m.org_id = p_org_id AND m.active;

  SELECT COALESCE(jsonb_agg(e ->> 'name'), '[]'::jsonb) INTO v_idle
  FROM jsonb_array_elements(v_members) e
  WHERE (e ->> 'touches')::bigint = 0
    AND (e ->> 'outcomes')::bigint = 0
    AND (e ->> 'approvals')::bigint = 0;

  IF jsonb_array_length(v_idle) > 0 AND v_ingested_7d > 0 THEN
    v_alarms := v_alarms || jsonb_build_array(jsonb_build_object(
      'key', 'members_idle',
      'plain', 'These people have done nothing in the system this week: '
        || (SELECT string_agg(x #>> '{}', ', ') FROM jsonb_array_elements(v_idle) x)
        || '. Leads are arriving, so the work is happening somewhere this cannot see.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'activated', true,
    'activated_at', o.activated_at,
    'days_live', v_days,
    'in_first_fortnight', v_days <= 14,
    'leads_ingested_24h', v_ingested_24h,
    'leads_ingested_7d', v_ingested_7d,
    'human_touch', jsonb_build_object('this_week', v_touch_this, 'previous_week', v_touch_prev),
    'outcome_logging', jsonb_build_object(
      'this_week', public.reporting_rate(v_log_k, v_log_n, public.reporting_diag_min(), false),
      'previous_week', public.reporting_rate(v_log_prev_k, v_log_prev_n, public.reporting_diag_min(), false)
    ),
    'median_minutes_to_first_touch', CASE WHEN v_median IS NULL THEN NULL ELSE round(v_median, 1) END,
    'configured_window_minutes', sc.speed_to_lead_minutes,
    'drafts', jsonb_build_object('approved', v_approved, 'rejected', v_rejected),
    'members', v_members,
    'alarms', v_alarms
  );
END;
$$;
