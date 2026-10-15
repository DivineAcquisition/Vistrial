-- Prompt 20: reports, one export engine, the public API, and outbound webhooks.
-- Metrics stay inside portal_metric_rows. Plan JSON is unchanged. api_access
-- stays off until a Platform Admin grants the existing override.

-- ---------------------------------------------------------------------------
-- Message bodies are not kept on webhook receipts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jsonb_strip_message_bodies(p_value jsonb, p_depth integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key text;
  v_item jsonb;
  v_out jsonb;
BEGIN
  IF p_value IS NULL OR p_depth > 8 THEN
    RETURN p_value;
  END IF;
  IF jsonb_typeof(p_value) = 'array' THEN
    v_out := '[]'::jsonb;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) WITH ORDINALITY AS t(value, n) WHERE n <= 100
    LOOP
      v_out := v_out || jsonb_build_array(public.jsonb_strip_message_bodies(v_item, p_depth + 1));
    END LOOP;
    RETURN v_out;
  END IF;
  IF jsonb_typeof(p_value) <> 'object' THEN
    RETURN p_value;
  END IF;
  v_out := '{}'::jsonb;
  FOR v_key, v_item IN SELECT key, value FROM jsonb_each(p_value)
  LOOP
    IF v_key ~* '^(body|html|text|content|raw|rawbody|raw_body|messagebody|message_body|attachments|sms|emailbody|email_body)$'
       OR (lower(v_key) = 'message' AND jsonb_typeof(v_item) = 'string') THEN
      v_out := v_out || jsonb_build_object(v_key, jsonb_build_object('redacted', true));
    ELSE
      v_out := v_out || jsonb_build_object(v_key, public.jsonb_strip_message_bodies(v_item, p_depth + 1));
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.redact_stored_message_bodies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events integer := 0;
  v_letters integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT id, raw_body FROM public.webhook_events
    WHERE raw_body IS NOT NULL AND raw_body ~* '"(body|html|text|content|message|messageBody|message_body|emailBody|email_body)"\s*:'
  LOOP
    v_events := v_events + 1;
    BEGIN
      UPDATE public.webhook_events
      SET raw_body = public.jsonb_strip_message_bodies(v_row.raw_body::jsonb)::text
      WHERE id = v_row.id;
    EXCEPTION WHEN others THEN
      UPDATE public.webhook_events
      SET raw_body = jsonb_build_object('_unparsed', true, 'bytes', length(v_row.raw_body))::text
      WHERE id = v_row.id;
    END;
  END LOOP;

  IF to_regclass('public.webhook_dead_letters') IS NOT NULL THEN
    FOR v_row IN
      EXECUTE $q$
        SELECT id, raw_body FROM public.webhook_dead_letters
        WHERE raw_body IS NOT NULL AND raw_body ~* '"(body|html|text|content|message|messageBody|message_body|emailBody|email_body)"\s*:'
      $q$
    LOOP
      v_letters := v_letters + 1;
      BEGIN
        EXECUTE 'UPDATE public.webhook_dead_letters SET raw_body = $1 WHERE id = $2'
          USING public.jsonb_strip_message_bodies(v_row.raw_body::jsonb)::text, v_row.id;
      EXCEPTION WHEN others THEN
        EXECUTE 'UPDATE public.webhook_dead_letters SET raw_body = $1 WHERE id = $2'
          USING jsonb_build_object('_unparsed', true, 'bytes', length(v_row.raw_body))::text, v_row.id;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('webhook_events', v_events, 'dead_letters', v_letters);
END;
$$;

-- ---------------------------------------------------------------------------
-- Extended metrics. Computed by the same portal_metric_rows path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_metric_is_extended(p_base text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_base IN (
    'gone_quiet', 'gone_quiet_value', 'gone_quiet_reply_after', 'gone_quiet_booking_after',
    'after_hours_first_touch', 'approval_time', 'approval_expired',
    'tasks_open', 'tasks_overdue', 'touches_logged',
    'coverage_sources', 'coverage_stale', 'coverage_with_calls', 'coverage_manual', 'coverage_unmatched'
  );
$$;

CREATE OR REPLACE FUNCTION public.portal_outside_business_hours(p_org_id uuid, p_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_days jsonb;
  v_dow text;
  v_hm text;
  v_window jsonb;
BEGIN
  IF p_at IS NULL THEN
    RETURN false;
  END IF;
  SELECT COALESCE(NULLIF(o.timezone, ''), 'UTC') INTO v_tz FROM public.organizations o WHERE o.id = p_org_id;
  v_days := COALESCE(public.config_effective_at(p_org_id)->'values'->'identity.business_hours'->'days', '{}'::jsonb);
  v_dow := (ARRAY['mon','tue','wed','thu','fri','sat','sun'])[EXTRACT(ISODOW FROM (p_at AT TIME ZONE v_tz))::int];
  v_hm := to_char(p_at AT TIME ZONE v_tz, 'HH24:MI');
  IF jsonb_typeof(v_days->v_dow) IS DISTINCT FROM 'array' OR jsonb_array_length(v_days->v_dow) = 0 THEN
    RETURN true;
  END IF;
  FOR v_window IN SELECT value FROM jsonb_array_elements(v_days->v_dow)
  LOOP
    IF v_hm >= COALESCE(v_window->>'start', '00:00') AND v_hm < COALESCE(v_window->>'end', '24:00') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_deal_cents(p_org_id uuid, p_lead_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(
    CASE
      WHEN jsonb_typeof(f.value) = 'number' THEN
        CASE WHEN f.field_key ~* 'cents' THEN (f.value::text)::numeric ELSE (f.value::text)::numeric * 100 END
      WHEN jsonb_typeof(f.value) = 'string' AND (f.value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' THEN
        CASE WHEN f.field_key ~* 'cents' THEN (f.value #>> '{}')::numeric ELSE (f.value #>> '{}')::numeric * 100 END
      ELSE NULL
    END
  )
  FROM public.case_file_fields f
  WHERE f.org_id = p_org_id AND f.lead_id = p_lead_id AND f.state = 'present'
    AND f.field_key ~* '(deal|quote|proposal|amount)';
$$;

CREATE OR REPLACE FUNCTION public.portal_metric_rows_extended(
  p_org_id uuid,
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb
)
RETURNS TABLE (lead_id uuid, at timestamptz, value numeric, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text := split_part(p_metric, ':', 1);
  v_param text := NULLIF(substr(p_metric, length(split_part(p_metric, ':', 1)) + 2), '');
BEGIN
  PERFORM public.portal_assert_results(p_org_id, COALESCE(p_filters, '{}'::jsonb));
  IF v_base IN ('gone_quiet_value') AND NOT public.portal_can_see_money(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF v_base IN ('tasks_open', 'tasks_overdue', 'touches_logged') AND NOT public.portal_can_see_people(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;

  IF v_base IN ('gone_quiet', 'gone_quiet_value') THEN
    RETURN QUERY
      WITH quiet AS (
        SELECT s.lead_id,
          GREATEST(s.arrived_at, COALESCE(l.last_touch_at, s.arrived_at)) AS last_move,
          EXTRACT(EPOCH FROM (now() - GREATEST(s.arrived_at, COALESCE(l.last_touch_at, s.arrived_at)))) / 86400.0 AS days_quiet,
          l.pipeline_stage
        FROM public.portal_lead_scope(p_org_id, p_filters) s
        JOIN public.leads l ON l.id = s.lead_id
        WHERE s.status IN ('call_booked', 'follow_up', 'objection_hold', 'ghost')
           OR COALESCE(l.pipeline_stage, '') ~* '(quote|proposal|consult)'
      ),
      banded AS (
        SELECT q.lead_id, q.last_move, public.portal_deal_cents(p_org_id, q.lead_id) AS cents,
          CASE
            WHEN q.days_quiet >= 22 THEN 'over_21'
            WHEN q.days_quiet >= 15 THEN '15_21'
            WHEN q.days_quiet >= 8 THEN '8_14'
            WHEN q.days_quiet >= 3 THEN '3_7'
            ELSE NULL
          END AS band
        FROM quiet q
        WHERE q.days_quiet >= 3
          AND EXISTS (
            SELECT 1 FROM public.leads l
            WHERE l.id = q.lead_id AND l.status::text NOT IN ('closed_won', 'closed_lost')
          )
      )
      SELECT b.lead_id, b.last_move,
        CASE WHEN v_base = 'gone_quiet_value' THEN b.cents ELSE NULL END,
        b.band
      FROM banded b
      WHERE b.band IS NOT NULL
        AND (v_param IS NULL OR b.band = v_param)
        AND (v_base = 'gone_quiet' OR b.cents IS NOT NULL);

  ELSIF v_base = 'gone_quiet_reply_after' THEN
    RETURN QUERY
      WITH entered AS (
        SELECT c.lead_id, min(c.created_at) AS entered_at
        FROM public.lead_status_changes c
        JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = c.lead_id
        WHERE c.org_id = p_org_id AND c.to_status::text IN ('call_booked', 'follow_up', 'objection_hold', 'ghost')
        GROUP BY c.lead_id
      )
      SELECT DISTINCT ON (t.lead_id) t.lead_id, t.occurred_at, NULL::numeric, 'reply'
      FROM public.touches t
      JOIN entered e ON e.lead_id = t.lead_id
      WHERE t.org_id = p_org_id AND t.direction = 'inbound'
        AND t.occurred_at > e.entered_at
        AND t.occurred_at >= p_from AND t.occurred_at < p_to
      ORDER BY t.lead_id, t.occurred_at;

  ELSIF v_base = 'gone_quiet_booking_after' THEN
    RETURN QUERY
      WITH entered AS (
        SELECT c.lead_id, min(c.created_at) AS entered_at
        FROM public.lead_status_changes c
        JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = c.lead_id
        WHERE c.org_id = p_org_id AND c.to_status::text IN ('call_booked', 'follow_up', 'objection_hold', 'ghost')
        GROUP BY c.lead_id
      )
      SELECT DISTINCT ON (c.lead_id) c.lead_id, c.created_at, NULL::numeric, 'booking'
      FROM public.calls c
      JOIN entered e ON e.lead_id = c.lead_id
      WHERE c.org_id = p_org_id AND c.scheduled_at IS NOT NULL
        AND c.created_at > e.entered_at
        AND c.created_at >= p_from AND c.created_at < p_to
      ORDER BY c.lead_id, c.created_at;

  ELSIF v_base = 'after_hours_first_touch' THEN
    RETURN QUERY
      SELECT DISTINCT ON (m.lead_id) m.lead_id, m.recorded_at, m.seconds::numeric,
        CASE WHEN public.portal_outside_business_hours(p_org_id, m.recorded_at) THEN 'after_hours' ELSE 'in_hours' END
      FROM public.sentry_measurements m
      JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = m.lead_id
      WHERE m.org_id = p_org_id AND m.metric = 'time_to_first_touch'
        AND s.arrived_at >= p_from AND s.arrived_at < p_to
        AND (v_param IS NULL OR (
          v_param = 'after_hours' AND public.portal_outside_business_hours(p_org_id, m.recorded_at)
        ) OR (
          v_param = 'in_hours' AND NOT public.portal_outside_business_hours(p_org_id, m.recorded_at)
        ))
      ORDER BY m.lead_id, m.recorded_at;

  ELSIF v_base = 'approval_time' THEN
    RETURN QUERY
      SELECT x.lead_id, i.decided_at, EXTRACT(EPOCH FROM (i.decided_at - i.created_at))::numeric, i.status
      FROM public.approval_items i
      CROSS JOIN LATERAL unnest(i.lead_ids) AS x(lead_id)
      JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = x.lead_id
      WHERE i.org_id = p_org_id AND i.agent_id = 'relay' AND i.decided_at IS NOT NULL
        AND i.decided_at >= p_from AND i.decided_at < p_to;

  ELSIF v_base = 'approval_expired' THEN
    RETURN QUERY
      SELECT x.lead_id, COALESCE(i.expires_at, i.updated_at), NULL::numeric, 'expired'
      FROM public.approval_items i
      CROSS JOIN LATERAL unnest(i.lead_ids) AS x(lead_id)
      JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = x.lead_id
      WHERE i.org_id = p_org_id AND i.agent_id = 'relay'
        AND (i.status = 'expired' OR (i.expires_at IS NOT NULL AND i.expires_at < now() AND i.decided_at IS NULL AND i.status = 'pending'))
        AND COALESCE(i.expires_at, i.updated_at) >= p_from
        AND COALESCE(i.expires_at, i.updated_at) < p_to;

  ELSIF v_base = 'tasks_open' THEN
    RETURN QUERY
      SELECT n.lead_id, COALESCE(n.due_at, n.created_at), NULL::numeric, COALESCE(n.owner_member_id::text, 'unassigned')
      FROM public.next_actions n
      JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = n.lead_id
      WHERE n.org_id = p_org_id AND n.completed_at IS NULL
        AND (v_param IS NULL OR COALESCE(n.owner_member_id::text, 'unassigned') = v_param);

  ELSIF v_base = 'tasks_overdue' THEN
    RETURN QUERY
      SELECT n.lead_id, n.due_at, NULL::numeric, COALESCE(n.owner_member_id::text, 'unassigned')
      FROM public.next_actions n
      JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = n.lead_id
      WHERE n.org_id = p_org_id AND n.completed_at IS NULL AND n.due_at IS NOT NULL AND n.due_at < now()
        AND (v_param IS NULL OR COALESCE(n.owner_member_id::text, 'unassigned') = v_param);

  ELSIF v_base = 'touches_logged' THEN
    RETURN QUERY
      SELECT t.lead_id, t.occurred_at, NULL::numeric, COALESCE(t.actor_member_id::text, 'unassigned')
      FROM public.touches t
      JOIN public.portal_lead_scope(p_org_id, p_filters) s ON s.lead_id = t.lead_id
      WHERE t.org_id = p_org_id AND t.occurred_at >= p_from AND t.occurred_at < p_to
        AND (v_param IS NULL OR COALESCE(t.actor_member_id::text, 'unassigned') = v_param);

  ELSIF v_base = 'coverage_sources' THEN
    RETURN QUERY
      SELECT NULL::uuid, c.created_at, NULL::numeric, c.kind::text
      FROM public.source_connections c
      WHERE c.org_id = p_org_id AND c.status = 'active'
      UNION ALL
      SELECT NULL::uuid, g.created_at, NULL::numeric, 'crm'
      FROM public.ghl_connections g
      WHERE g.org_id = p_org_id AND g.status = 'active';

  ELSIF v_base = 'coverage_stale' THEN
    RETURN QUERY
      SELECT NULL::uuid, COALESCE(c.last_verified_at, c.created_at), NULL::numeric, c.kind::text
      FROM public.source_connections c
      WHERE c.org_id = p_org_id AND (
        c.status = 'broken'
        OR c.status = 'active' AND (c.last_verified_at IS NULL OR c.last_verified_at < now() - interval '48 hours')
      );

  ELSIF v_base = 'coverage_with_calls' THEN
    RETURN QUERY
      SELECT s.lead_id, s.arrived_at, NULL::numeric, 'has_call'
      FROM public.portal_lead_scope(p_org_id, p_filters) s
      WHERE s.arrived_at >= p_from AND s.arrived_at < p_to
        AND EXISTS (
          SELECT 1 FROM public.calls c WHERE c.org_id = p_org_id AND c.lead_id = s.lead_id
        );

  ELSIF v_base = 'coverage_manual' THEN
    RETURN QUERY
      SELECT s.lead_id, s.arrived_at, NULL::numeric, 'manual'
      FROM public.portal_lead_scope(p_org_id, p_filters) s
      JOIN public.leads l ON l.id = s.lead_id
      WHERE s.arrived_at >= p_from AND s.arrived_at < p_to
        AND public.portal_source_key(l.source) IN ('(none)', 'manual', 'direct', 'entered', 'api');

  ELSIF v_base = 'coverage_unmatched' THEN
    RETURN QUERY
      SELECT NULL::uuid, h.received_at, NULL::numeric, h.source
      FROM public.inbound_event_holds h
      WHERE h.org_id = p_org_id AND h.review_status = 'open';

  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.portal_metric_rows(
  p_org_id uuid,
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (lead_id uuid, at timestamptz, value numeric, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filters jsonb := COALESCE(p_filters, '{}'::jsonb);
  v_base text := split_part(p_metric, ':', 1);
  v_param text := NULLIF(substr(p_metric, length(split_part(p_metric, ':', 1)) + 2), '');
BEGIN
  PERFORM public.portal_assert_results(p_org_id, v_filters);

  IF v_base = 'new_leads' THEN
    RETURN QUERY
      SELECT s.lead_id, s.arrived_at, NULL::numeric, NULL::text
      FROM public.portal_lead_scope(p_org_id, v_filters) s
      WHERE s.arrived_at >= p_from AND s.arrived_at < p_to;

  ELSIF v_base IN ('response_decided', 'response_within', 'response_late') THEN
    RETURN QUERY
      WITH arrived AS (
        SELECT s.lead_id, s.arrived_at FROM public.portal_lead_scope(p_org_id, v_filters) s
        WHERE s.arrived_at >= p_from AND s.arrived_at < p_to
      ),
      measured AS (
        SELECT DISTINCT ON (m.lead_id) m.lead_id, m.seconds, m.met
        FROM public.sentry_measurements m
        WHERE m.org_id = p_org_id AND m.metric = 'time_to_first_touch' AND m.met IS NOT NULL
          AND m.lead_id IN (SELECT a.lead_id FROM arrived a)
        ORDER BY m.lead_id, m.recorded_at
      ),
      missed AS (
        SELECT DISTINCT c.lead_id FROM public.sentry_clocks c
        WHERE c.org_id = p_org_id AND c.kind = 'first_touch' AND c.state = 'missed'
          AND c.lead_id IN (SELECT a.lead_id FROM arrived a)
      )
      SELECT a.lead_id, a.arrived_at, me.seconds::numeric,
        CASE WHEN me.met THEN 'within' WHEN me.lead_id IS NOT NULL THEN 'late' ELSE 'missed' END
      FROM arrived a
      LEFT JOIN measured me ON me.lead_id = a.lead_id
      WHERE (me.lead_id IS NOT NULL OR a.lead_id IN (SELECT x.lead_id FROM missed x))
        AND (
          v_base = 'response_decided'
          OR (v_base = 'response_within' AND me.met IS TRUE)
          OR (v_base = 'response_late' AND me.met IS NOT TRUE)
        );

  ELSIF v_base = 'first_touch_time' THEN
    RETURN QUERY
      WITH arrived AS (
        SELECT s.lead_id, s.arrived_at FROM public.portal_lead_scope(p_org_id, v_filters) s
        WHERE s.arrived_at >= p_from AND s.arrived_at < p_to
      )
      SELECT DISTINCT ON (m.lead_id) m.lead_id, a.arrived_at, m.seconds::numeric, NULL::text
      FROM public.sentry_measurements m
      JOIN arrived a ON a.lead_id = m.lead_id
      WHERE m.org_id = p_org_id AND m.metric = 'time_to_first_touch'
      ORDER BY m.lead_id, m.recorded_at;

  ELSIF v_base IN ('follow_up_gaps', 'follow_up_on_time') THEN
    RETURN QUERY
      SELECT m.lead_id, m.recorded_at, m.seconds::numeric, CASE WHEN m.met THEN 'on_time' ELSE 'late' END
      FROM public.sentry_measurements m
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = m.lead_id
      WHERE m.org_id = p_org_id AND m.metric = 'gap' AND m.met IS NOT NULL
        AND m.recorded_at >= p_from AND m.recorded_at < p_to
        AND (v_base = 'follow_up_gaps' OR m.met);

  ELSIF v_base IN ('at_risk_now', 'missed_now') THEN
    RETURN QUERY
      SELECT c.lead_id, c.deadline_at, c.overdue_minutes::numeric, c.kind
      FROM public.sentry_clocks c
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = c.lead_id
      WHERE c.org_id = p_org_id
        AND c.state = CASE v_base WHEN 'at_risk_now' THEN 'at_risk' ELSE 'missed' END
        AND c.resolved_at IS NULL;

  ELSIF v_base = 'open_leads' THEN
    RETURN QUERY
      SELECT s.lead_id, s.arrived_at, NULL::numeric, s.status
      FROM public.portal_lead_scope(p_org_id, v_filters) s
      WHERE s.status = ANY (public.portal_open_statuses())
        AND (v_param IS NULL OR s.status = v_param);

  ELSIF v_base IN ('open_band', 'hot_open') THEN
    RETURN QUERY
      WITH band AS (SELECT CASE WHEN v_base = 'hot_open' THEN public.portal_top_band(p_org_id) ELSE v_param END AS name)
      SELECT s.lead_id, s.arrived_at, cf.score::numeric, COALESCE(cf.band, 'none')
      FROM public.portal_lead_scope(p_org_id, v_filters) s
      LEFT JOIN public.case_files cf ON cf.org_id = p_org_id AND cf.lead_id = s.lead_id
      CROSS JOIN band b
      WHERE s.status = ANY (public.portal_open_statuses())
        AND b.name IS NOT NULL
        AND COALESCE(cf.band, 'none') = b.name;

  ELSIF v_base = 'band_moves' THEN
    RETURN QUERY
      WITH versions AS (
        SELECT v.lead_id, v.created_at, v.content->>'band' AS band,
          lag(v.content->>'band') OVER (PARTITION BY v.case_file_id ORDER BY v.version) AS prev
        FROM public.case_file_versions v
        WHERE v.org_id = p_org_id AND v.created_at < p_to
      )
      SELECT v.lead_id, v.created_at, NULL::numeric, v.prev || '>' || v.band
      FROM versions v
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = v.lead_id
      WHERE v.created_at >= p_from AND v.prev IS NOT NULL AND v.band IS NOT NULL AND v.band <> v.prev
        AND (v_param IS NULL OR v.prev || '>' || v.band = v_param);

  ELSIF v_base = 'stage_moves' THEN
    RETURN QUERY
      SELECT c.lead_id, c.created_at, NULL::numeric, COALESCE(c.from_status::text, 'none') || '>' || c.to_status::text
      FROM public.lead_status_changes c
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = c.lead_id
      WHERE c.org_id = p_org_id AND c.created_at >= p_from AND c.created_at < p_to
        AND c.from_status IS DISTINCT FROM c.to_status
        AND (v_param IS NULL OR COALESCE(c.from_status::text, 'none') || '>' || c.to_status::text = v_param);

  ELSIF v_base = 'bookings' THEN
    RETURN QUERY
      SELECT c.lead_id, c.created_at, NULL::numeric, c.id::text
      FROM public.calls c
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = c.lead_id
      WHERE c.org_id = p_org_id AND c.scheduled_at IS NOT NULL
        AND c.created_at >= p_from AND c.created_at < p_to;

  ELSIF v_base = 'revenue' THEN
    IF NOT public.portal_can_see_money(p_org_id) THEN
      RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
      SELECT r.lead_id, r.occurred_at,
        (CASE WHEN r.kind IN ('refund', 'chargeback') THEN -r.amount_cents ELSE r.amount_cents END)::numeric,
        COALESCE(r.lifecycle::text, 'unclassified')
      FROM public.revenue_log r
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = r.lead_id
      WHERE r.org_id = p_org_id AND r.kind <> 'failed'
        AND r.occurred_at >= p_from AND r.occurred_at < p_to
        AND (v_param IS NULL OR COALESCE(r.lifecycle::text, 'unclassified') = v_param);

  ELSIF v_base = 'objections' THEN
    RETURN QUERY
      SELECT o.lead_id, o.created_at, NULL::numeric, o.type::text || CASE WHEN o.resolved THEN ':resolved' ELSE ':open' END
      FROM public.objections o
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = o.lead_id
      WHERE o.org_id = p_org_id AND o.created_at >= p_from AND o.created_at < p_to
        AND (v_param IS NULL OR o.type::text = v_param);

  ELSIF v_base = 'scribe_updated' THEN
    RETURN QUERY
      SELECT DISTINCT ON (v.lead_id) v.lead_id, v.created_at, v.version::numeric, CASE WHEN v.version = 1 THEN 'built' ELSE 'updated' END
      FROM public.case_file_versions v
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = v.lead_id
      WHERE v.org_id = p_org_id AND v.created_at >= p_from AND v.created_at < p_to
      ORDER BY v.lead_id, v.created_at DESC;

  ELSIF v_base = 'scribe_review' THEN
    RETURN QUERY
      SELECT cf.lead_id, cf.updated_at, NULL::numeric, 'needs_review'
      FROM public.case_files cf
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = cf.lead_id
      WHERE cf.org_id = p_org_id AND cf.status = 'needs_review';

  ELSIF v_base IN ('alerts_raised', 'alerts_acknowledged') THEN
    RETURN QUERY
      SELECT a.lead_id, a.created_at,
        CASE WHEN a.acknowledged_at IS NOT NULL THEN extract(epoch FROM a.acknowledged_at - a.created_at)::numeric END,
        a.kind || ':' || a.level::text
      FROM public.sentry_alerts a
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = a.lead_id
      WHERE a.org_id = p_org_id AND a.created_at >= p_from AND a.created_at < p_to
        AND (v_base = 'alerts_raised' OR a.acknowledged_at IS NOT NULL);

  ELSIF v_base = 'alerts_open_now' THEN
    RETURN QUERY
      SELECT a.lead_id, a.created_at, a.level::numeric, a.kind
      FROM public.sentry_alerts a
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = a.lead_id
      WHERE a.org_id = p_org_id AND a.status = 'open' AND a.acknowledged_at IS NULL AND a.resolved_at IS NULL;

  ELSIF v_base = 'follow_ups_watched' THEN
    RETURN QUERY
      SELECT c.lead_id, c.started_at, NULL::numeric, c.state
      FROM public.sentry_clocks c
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = c.lead_id
      WHERE c.org_id = p_org_id AND c.kind = 'follow_up'
        AND c.started_at < p_to AND (c.resolved_at IS NULL OR c.resolved_at >= p_from);

  ELSIF v_base IN ('relay_prepared', 'relay_approved_unchanged', 'relay_edited', 'relay_rejected', 'relay_sent') THEN
    RETURN QUERY
      SELECT d.lead_id, d.created_at, d.edit_distance::numeric,
        CASE
          WHEN d.status = 'performed' THEN 'sent'
          WHEN d.status = 'rejected' THEN 'rejected'
          WHEN d.status IN ('approved') THEN 'approved'
          ELSE d.status
        END
      FROM public.relay_drafts d
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = d.lead_id
      WHERE d.org_id = p_org_id AND NOT d.simulated
        AND d.created_at >= p_from AND d.created_at < p_to
        AND CASE v_base
          WHEN 'relay_prepared' THEN true
          WHEN 'relay_approved_unchanged' THEN d.status IN ('approved', 'performed')
            AND (d.final_body IS NULL OR d.final_body = d.body) AND COALESCE(d.edit_distance, 0) = 0
          WHEN 'relay_edited' THEN d.status IN ('approved', 'performed')
            AND ((d.final_body IS NOT NULL AND d.final_body <> d.body) OR COALESCE(d.edit_distance, 0) > 0)
          WHEN 'relay_rejected' THEN d.status = 'rejected'
          WHEN 'relay_sent' THEN d.status = 'performed'
        END;

  ELSIF v_base = 'drafts_waiting' THEN
    IF NOT public.ws_can_approve(p_org_id) THEN
      RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
      SELECT x.lead_id, i.created_at, i.urgency::numeric, i.id::text
      FROM public.approval_items i
      CROSS JOIN LATERAL unnest(i.lead_ids) AS x(lead_id)
      JOIN public.portal_lead_scope(p_org_id, v_filters) s ON s.lead_id = x.lead_id
      WHERE i.org_id = p_org_id AND i.status = 'pending' AND i.agent_id = 'relay';

  ELSIF public.portal_metric_is_extended(v_base) THEN
    RETURN QUERY
      SELECT * FROM public.portal_metric_rows_extended(p_org_id, p_metric, p_from, p_to, v_filters);

  ELSE
    RAISE EXCEPTION 'Unknown metric: %', p_metric USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_metric_is_now(p_metric text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(p_metric, ':', 1) IN (
    'at_risk_now', 'missed_now', 'open_leads', 'open_band', 'hot_open', 'scribe_review', 'alerts_open_now', 'drafts_waiting'
  );
$$;

CREATE OR REPLACE FUNCTION public.portal_metric_breakdown(
  p_org_id uuid,
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb,
  p_dimension text
)
RETURNS TABLE (key text, label text, count bigint, leads bigint, sum numeric, median double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM public.portal_assert_results(p_org_id, COALESCE(p_filters, '{}'::jsonb));
  IF p_dimension = 'person' AND NOT public.portal_can_see_people(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(NULLIF(o.timezone, ''), 'UTC') INTO v_tz FROM public.organizations o WHERE o.id = p_org_id;

  IF p_dimension = 'source' THEN
    RETURN QUERY
      SELECT public.portal_source_key(l.source), COALESCE(max(NULLIF(btrim(l.source), '')), 'No source'),
        count(*), count(DISTINCT r.lead_id), sum(r.value), percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      JOIN public.leads l ON l.id = r.lead_id
      GROUP BY 1;
  ELSIF p_dimension = 'person' AND split_part(p_metric, ':', 1) IN ('touches_logged', 'tasks_open', 'tasks_overdue') THEN
    RETURN QUERY
      SELECT COALESCE(NULLIF(r.detail, ''), 'unassigned'), COALESCE(max(m.display_name), 'Not assigned'),
        count(*), count(DISTINCT r.lead_id), sum(r.value), percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      LEFT JOIN public.org_members m ON m.id::text = r.detail
      GROUP BY 1;
  ELSIF p_dimension = 'person' THEN
    RETURN QUERY
      WITH base AS (SELECT * FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters)),
      people AS (
        SELECT r.lead_id, r.at, r.value, r.detail, p.member_id
        FROM base r
        JOIN public.leads l ON l.id = r.lead_id
        CROSS JOIN LATERAL (
          SELECT DISTINCT u AS member_id
          FROM unnest(CASE
            WHEN l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL THEN ARRAY[NULL::uuid]
            ELSE array_remove(ARRAY[l.assigned_setter_id, l.assigned_closer_id], NULL)
          END) AS u
        ) p
      )
      SELECT COALESCE(x.member_id::text, 'unassigned'), COALESCE(max(m.display_name), 'Not assigned'),
        count(*), count(DISTINCT x.lead_id), sum(x.value), percentile_cont(0.5) WITHIN GROUP (ORDER BY x.value)
      FROM people x
      LEFT JOIN public.org_members m ON m.id = x.member_id
      GROUP BY 1;
  ELSIF p_dimension = 'stage' THEN
    RETURN QUERY
      SELECT l.status::text, l.status::text, count(*), count(DISTINCT r.lead_id), sum(r.value),
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      JOIN public.leads l ON l.id = r.lead_id
      GROUP BY 1, 2;
  ELSIF p_dimension = 'band' THEN
    RETURN QUERY
      SELECT COALESCE(cf.band, 'none'), COALESCE(cf.band, 'No case file yet'), count(*), count(DISTINCT r.lead_id), sum(r.value),
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      LEFT JOIN public.case_files cf ON cf.org_id = p_org_id AND cf.lead_id = r.lead_id
      GROUP BY 1, 2;
  ELSIF p_dimension = 'day' THEN
    RETURN QUERY
      SELECT to_char((r.at AT TIME ZONE v_tz)::date, 'YYYY-MM-DD'), to_char((r.at AT TIME ZONE v_tz)::date, 'YYYY-MM-DD'),
        count(*), count(DISTINCT r.lead_id), sum(r.value), percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      GROUP BY 1, 2;
  ELSIF p_dimension = 'offer' THEN
    RETURN QUERY
      SELECT COALESCE(NULLIF(btrim(l.offer_name), ''), '(none)'), COALESCE(NULLIF(btrim(l.offer_name), ''), 'No offer'),
        count(*), count(DISTINCT r.lead_id), sum(r.value), percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      JOIN public.leads l ON l.id = r.lead_id
      GROUP BY 1, 2;
  ELSIF p_dimension = 'detail' THEN
    RETURN QUERY
      SELECT COALESCE(r.detail, 'none'), COALESCE(r.detail, 'none'), count(*), count(DISTINCT r.lead_id), sum(r.value),
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
      FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r
      GROUP BY 1, 2;
  ELSE
    RAISE EXCEPTION 'Unknown breakdown: %', p_dimension USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reports, exports, API keys, outbound webhooks.
-- ---------------------------------------------------------------------------

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'report_ready';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'export_failed';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'export_expiring';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'api_key_notice';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'webhook_notice';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'client_report_review';

CREATE OR REPLACE FUNCTION public.portal_can_see_money(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR COALESCE(public.ws_access(p_org_id) IN ('owner', 'platform_admin', 'service_team'), false)
    OR (public.ws_access(p_org_id) = 'member' AND public.portal_member_flag(p_org_id, 'money'));
$$;

CREATE OR REPLACE FUNCTION public.portal_can_see_people(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR COALESCE(public.ws_access(p_org_id) IN ('owner', 'platform_admin', 'service_team'), false);
$$;

CREATE OR REPLACE FUNCTION public.portal_assert_results(p_org_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT public.portal_can_see_results(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_filters->>'person', '') IS NOT NULL AND NOT public.portal_can_see_people(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_metric_is_now(p_metric text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(p_metric, ':', 1) IN (
    'at_risk_now', 'missed_now', 'open_leads', 'open_band', 'hot_open', 'scribe_review', 'alerts_open_now', 'drafts_waiting',
    'gone_quiet', 'gone_quiet_value', 'tasks_open', 'tasks_overdue', 'coverage_sources', 'coverage_stale', 'coverage_unmatched'
  );
$$;

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  definition jsonb NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_reports_org_idx ON public.saved_reports (org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  report_key text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
  weekday smallint CHECK (weekday BETWEEN 0 AND 6),
  month_day smallint CHECK (month_day BETWEEN 1 AND 28),
  hour smallint NOT NULL DEFAULT 8 CHECK (hour BETWEEN 0 AND 23),
  recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  include_pdf boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  paused_reason text,
  next_send_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_schedules_due_idx ON public.report_schedules (next_send_at) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  report_key text NOT NULL,
  format text NOT NULL CHECK (format IN ('csv', 'pdf', 'json')),
  aggregate_only boolean NOT NULL DEFAULT true,
  storage_path text,
  requested_by uuid,
  recipient_user_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_snapshots_org_idx ON public.report_snapshots (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  period_from timestamptz NOT NULL,
  period_to timestamptz NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_summary text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  figure_hash text NOT NULL,
  figures jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'released')),
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_by uuid,
  released_by uuid,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_reports_org_idx ON public.client_reports (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  kind text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed', 'expired')),
  record_count integer,
  storage_path text,
  content_type text,
  file_name text,
  error text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  purged_at timestamptz
);
CREATE INDEX IF NOT EXISTS export_jobs_org_idx ON public.export_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_jobs_expiry_idx ON public.export_jobs (expires_at) WHERE purged_at IS NULL;

CREATE TABLE IF NOT EXISTS public.download_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  subject_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS download_grants_token_idx ON public.download_grants (token_hash);

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'internal')),
  created_by uuid,
  source_label text,
  historic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_notes_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON public.lead_notes (org_id, lead_id, created_at DESC);
ALTER TABLE public.lead_notes ADD COLUMN IF NOT EXISTS source_label text;
ALTER TABLE public.lead_notes ADD COLUMN IF NOT EXISTS historic boolean NOT NULL DEFAULT false;
ALTER TABLE public.lead_notes ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE TABLE IF NOT EXISTS public.record_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  subject_table text NOT NULL,
  subject_id uuid NOT NULL,
  source_label text NOT NULL,
  historic boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS record_provenance_subject_idx ON public.record_provenance (org_id, subject_table, subject_id);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  prefix text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('live', 'test')),
  scopes text[] NOT NULL DEFAULT '{}',
  allow_ips text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON public.api_keys (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  key_id uuid NOT NULL REFERENCES public.api_keys (id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.api_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.api_keys (id) ON DELETE SET NULL,
  key_name text,
  method text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_request_log_org_idx ON public.api_request_log (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url text NOT NULL,
  events text[] NOT NULL,
  secret_encrypted text NOT NULL,
  previous_secret_encrypted text,
  previous_secret_until timestamptz,
  include_data boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  disabled_reason text,
  failure_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_org_idx ON public.webhook_endpoints (org_id);

CREATE TABLE IF NOT EXISTS public.webhook_outbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  sequence bigint NOT NULL,
  record_ids uuid[] NOT NULL DEFAULT '{}',
  changed_fields text[] NOT NULL DEFAULT '{}',
  source_label text,
  historic boolean NOT NULL DEFAULT false,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_outbound_events_org_idx ON public.webhook_outbound_events (org_id, sequence);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.webhook_outbound_events (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'gave_up')),
  attempts integer NOT NULL DEFAULT 0,
  response_code integer,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON public.webhook_deliveries (next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_idx ON public.webhook_deliveries (endpoint_id, created_at DESC);

CREATE SEQUENCE IF NOT EXISTS public.webhook_outbound_sequence;

-- RLS. Service role is the API and the cron. Authenticated reads are scoped.
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_outbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_reports_select ON public.saved_reports;
CREATE POLICY saved_reports_select ON public.saved_reports FOR SELECT TO authenticated
  USING (public.portal_can_see_results(org_id) AND (shared OR created_by = auth.uid() OR public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin')));
DROP POLICY IF EXISTS report_schedules_select ON public.report_schedules;
CREATE POLICY report_schedules_select ON public.report_schedules FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));
DROP POLICY IF EXISTS report_snapshots_select ON public.report_snapshots;
CREATE POLICY report_snapshots_select ON public.report_snapshots FOR SELECT TO authenticated
  USING (public.portal_can_see_results(org_id) AND (requested_by = auth.uid() OR recipient_user_id = auth.uid() OR public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin')));
DROP POLICY IF EXISTS client_reports_select ON public.client_reports;
CREATE POLICY client_reports_select ON public.client_reports FOR SELECT TO authenticated
  USING (
    public.ws_access(org_id) IN ('service_team', 'platform_admin')
    OR (status = 'released' AND public.ws_access(org_id) IN ('owner', 'member'))
  );
DROP POLICY IF EXISTS export_jobs_select ON public.export_jobs;
CREATE POLICY export_jobs_select ON public.export_jobs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND (requested_by_user_id = auth.uid() OR public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin')));
DROP POLICY IF EXISTS lead_notes_select ON public.lead_notes;
CREATE POLICY lead_notes_select ON public.lead_notes FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (visibility = 'shared' OR public.ws_access(org_id) IN ('service_team', 'platform_admin'))
  );
DROP POLICY IF EXISTS record_provenance_select ON public.record_provenance;
CREATE POLICY record_provenance_select ON public.record_provenance FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS api_keys_select ON public.api_keys;
CREATE POLICY api_keys_select ON public.api_keys FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));
DROP POLICY IF EXISTS api_request_log_select ON public.api_request_log;
CREATE POLICY api_request_log_select ON public.api_request_log FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));
DROP POLICY IF EXISTS webhook_endpoints_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_select ON public.webhook_endpoints FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));
DROP POLICY IF EXISTS webhook_deliveries_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_select ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));

GRANT SELECT ON public.saved_reports, public.report_schedules, public.report_snapshots, public.client_reports,
  public.export_jobs, public.lead_notes, public.record_provenance, public.api_keys, public.api_request_log,
  public.webhook_endpoints, public.webhook_deliveries
  TO authenticated;

REVOKE ALL ON public.api_idempotency, public.download_grants, public.webhook_outbound_events FROM PUBLIC, authenticated;
GRANT ALL ON public.saved_reports, public.report_schedules, public.report_snapshots, public.client_reports,
  public.export_jobs, public.download_grants, public.lead_notes, public.record_provenance, public.api_keys,
  public.api_idempotency, public.api_request_log, public.webhook_endpoints, public.webhook_outbound_events,
  public.webhook_deliveries
  TO service_role;

-- Column grants hide hashes from the signed-in client.
REVOKE SELECT ON public.api_keys FROM authenticated;
GRANT SELECT (id, org_id, name, prefix, mode, scopes, allow_ips, expires_at, last_used_at, revoked_at, created_by, created_at)
  ON public.api_keys TO authenticated;
REVOKE SELECT ON public.webhook_endpoints FROM authenticated;
GRANT SELECT (id, org_id, name, url, events, include_data, enabled, disabled_reason, failure_count, created_by, created_at, updated_at)
  ON public.webhook_endpoints TO authenticated;

CREATE OR REPLACE FUNCTION public.export_file_deadline()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now() + interval '7 days';
$$;

CREATE OR REPLACE FUNCTION public.expired_export_paths()
RETURNS TABLE (bucket text, path text, job_id uuid, source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT 'portal-exports'::text, j.storage_path, j.id, 'export_jobs'::text
    FROM public.export_jobs j
    WHERE j.purged_at IS NULL AND j.storage_path IS NOT NULL AND j.expires_at <= now()
    UNION ALL
    SELECT 'portal-exports'::text, r.file_path, r.id, 'results_exports'::text
    FROM public.results_exports r
    WHERE r.file_path IS NOT NULL AND r.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.export_jobs j WHERE j.storage_path = r.file_path AND j.purged_at IS NOT NULL
      )
    UNION ALL
    SELECT 'portal-exports'::text, d.export_path, d.id, 'data_requests'::text
    FROM public.data_requests d
    WHERE d.export_path IS NOT NULL AND d.export_expires_at IS NOT NULL AND d.export_expires_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_export_purged(p_source text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source = 'export_jobs' THEN
    UPDATE public.export_jobs SET status = 'expired', purged_at = now() WHERE id = p_id;
  ELSIF p_source = 'results_exports' THEN
    UPDATE public.results_exports SET file_path = NULL, status = 'failed', error = COALESCE(error, 'expired') WHERE id = p_id;
  ELSIF p_source = 'data_requests' THEN
    UPDATE public.data_requests SET export_path = NULL WHERE id = p_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.redact_stored_message_bodies IS
  'Strips inbound message text already stored on webhook receipts. Returns how many rows changed.';
REVOKE ALL ON FUNCTION public.jsonb_strip_message_bodies(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_strip_message_bodies(jsonb, integer) TO service_role;

REVOKE ALL ON FUNCTION public.redact_stored_message_bodies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redact_stored_message_bodies() TO service_role;

REVOKE ALL ON FUNCTION public.portal_metric_is_extended(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_metric_is_extended(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.portal_outside_business_hours(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_outside_business_hours(uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.portal_deal_cents(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_deal_cents(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.portal_metric_rows_extended(uuid, text, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_metric_rows_extended(uuid, text, timestamptz, timestamptz, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.export_file_deadline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_file_deadline() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.expired_export_paths() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expired_export_paths() TO service_role;

REVOKE ALL ON FUNCTION public.mark_export_purged(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_export_purged(text, uuid) TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.webhook_outbound_sequence TO service_role;

GRANT INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_reports TO authenticated;
GRANT INSERT (id, org_id, name, prefix, secret_hash, mode, scopes, allow_ips, expires_at, created_by)
  ON public.api_keys TO authenticated;
GRANT UPDATE (revoked_at, name, scopes, allow_ips, expires_at) ON public.api_keys TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;

DROP POLICY IF EXISTS saved_reports_write ON public.saved_reports;
CREATE POLICY saved_reports_write ON public.saved_reports FOR ALL TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'))
  WITH CHECK (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));
DROP POLICY IF EXISTS report_schedules_write ON public.report_schedules;
CREATE POLICY report_schedules_write ON public.report_schedules FOR ALL TO authenticated
  USING (public.ws_access(org_id) = 'owner')
  WITH CHECK (public.ws_access(org_id) = 'owner');
DROP POLICY IF EXISTS client_reports_write ON public.client_reports;
CREATE POLICY client_reports_write ON public.client_reports FOR ALL TO authenticated
  USING (public.ws_access(org_id) IN ('service_team', 'platform_admin'))
  WITH CHECK (public.ws_access(org_id) IN ('service_team', 'platform_admin'));
DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
CREATE POLICY api_keys_insert ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (public.ws_access(org_id) = 'owner');
DROP POLICY IF EXISTS api_keys_update ON public.api_keys;
CREATE POLICY api_keys_update ON public.api_keys FOR UPDATE TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'))
  WITH CHECK (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));
DROP POLICY IF EXISTS webhook_endpoints_write ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_write ON public.webhook_endpoints FOR ALL TO authenticated
  USING (public.ws_access(org_id) = 'owner')
  WITH CHECK (public.ws_access(org_id) = 'owner');

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'reports-api',
  '* * * * *',
  60,
  180,
  'Open /api/cron/reports-api. It delivers webhook events, sends scheduled report notices, and deletes expired export files.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
VALUES ('reports-api', now(), now())
ON CONFLICT (job_name) DO NOTHING;

-- Existing stored message text is removed as this migration applies.
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.redact_stored_message_bodies();
  RAISE NOTICE 'redacted stored message bodies %', v;
END $$;
