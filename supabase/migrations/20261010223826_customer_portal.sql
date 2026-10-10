-- Customer portal: Home, Results, Team and Settings, Billing, Onboarding
-- progress, Help, and Notifications.
--
-- Every number the portal shows comes from portal_metric_rows(). Counts are
-- aggregates of its rows, and the lead lists a number opens are the same rows,
-- so a card and its list can never disagree.

-- ---------------------------------------------------------------------------
-- 1. Seat grants and personal preferences
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS can_see_money boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS notification_delivery text NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS home_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS home_prev_seen_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_members_notification_delivery_check') THEN
    ALTER TABLE public.org_members
      ADD CONSTRAINT org_members_notification_delivery_check CHECK (notification_delivery IN ('instant', 'digest'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_members_avatar_path_check') THEN
    ALTER TABLE public.org_members
      ADD CONSTRAINT org_members_avatar_path_check CHECK (avatar_path IS NULL OR avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$');
  END IF;
END $$;

ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS billing_access boolean NOT NULL DEFAULT false;

-- The money and export grants only mean something on a Member seat.
CREATE OR REPLACE FUNCTION public.org_members_grants_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role NOT IN ('member', 'client_viewer') THEN
    NEW.can_see_money := false;
    NEW.can_export := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_grants_guard ON public.org_members;
CREATE TRIGGER org_members_grants_guard
  BEFORE INSERT OR UPDATE OF role, can_see_money, can_export ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_grants_guard();

CREATE OR REPLACE FUNCTION public.org_members_grants_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.can_see_money IS DISTINCT FROM OLD.can_see_money THEN
    PERFORM public.ws_log(NEW.org_id, 'member.money_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_see_money, 'name', NEW.display_name), auth.uid());
  END IF;
  IF NEW.can_export IS DISTINCT FROM OLD.can_export THEN
    PERFORM public.ws_log(NEW.org_id, 'member.export_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_export, 'name', NEW.display_name), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_grants_audit ON public.org_members;
CREATE TRIGGER org_members_grants_audit
  AFTER UPDATE OF can_see_money, can_export ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_grants_audit();

-- ---------------------------------------------------------------------------
-- 2. Who may see what
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_member_flag(p_org_id uuid, p_flag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE p_flag WHEN 'money' THEN m.can_see_money WHEN 'export' THEN m.can_export WHEN 'approve' THEN m.can_approve END
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.user_id = auth.uid() AND m.active AND m.seat = 'customer'
      AND m.role IN ('member', 'client_viewer')
    LIMIT 1
  ), false);
$$;

/** Home and Results: owners, members, and staff working the workspace. */
CREATE OR REPLACE FUNCTION public.portal_can_see_results(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.ws_access(p_org_id) IN ('owner', 'member', 'platform_admin', 'service_team'), false);
$$;

CREATE OR REPLACE FUNCTION public.portal_can_see_money(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.ws_access(p_org_id) IN ('owner', 'platform_admin', 'service_team'), false)
    OR (public.ws_access(p_org_id) = 'member' AND public.portal_member_flag(p_org_id, 'money'));
$$;

/** Per-person numbers and the person filter. */
CREATE OR REPLACE FUNCTION public.portal_can_see_people(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.ws_access(p_org_id) IN ('owner', 'platform_admin', 'service_team'), false);
$$;

CREATE OR REPLACE FUNCTION public.portal_can_export(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.ws_access(p_org_id) IN ('owner', 'platform_admin', 'service_team'), false)
    OR (public.ws_access(p_org_id) = 'member' AND public.portal_member_flag(p_org_id, 'export'));
$$;

/** Billing: owners and Platform Admins; Service Team only with billing access. */
CREATE OR REPLACE FUNCTION public.portal_can_see_billing(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.ws_access(p_org_id)
    WHEN 'owner' THEN true
    WHEN 'platform_admin' THEN true
    WHEN 'service_team' THEN COALESCE((SELECT s.billing_access FROM public.platform_staff s WHERE s.user_id = auth.uid() AND s.active), false)
    ELSE false
  END;
$$;

-- A Member granted money sees revenue too, at the data layer.
DROP POLICY IF EXISTS revenue_log_select ON public.revenue_log;
CREATE POLICY revenue_log_select ON public.revenue_log FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, VARIADIC ARRAY['owner'::public.org_role, 'admin'::public.org_role])
    OR (org_id IN (SELECT public.user_org_ids()) AND public.portal_member_flag(org_id, 'money'))
  );

-- ---------------------------------------------------------------------------
-- 3. The metric layer
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS case_file_versions_org_time_idx ON public.case_file_versions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sentry_alerts_org_time_idx ON public.sentry_alerts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sentry_measurements_lead_idx ON public.sentry_measurements (org_id, lead_id, metric);
CREATE INDEX IF NOT EXISTS sentry_clocks_org_state_idx ON public.sentry_clocks (org_id, state);
CREATE INDEX IF NOT EXISTS revenue_log_org_time_idx ON public.revenue_log (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS objections_org_time_idx ON public.objections (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS case_files_org_band_idx ON public.case_files (org_id, band);
CREATE INDEX IF NOT EXISTS relay_drafts_org_time_idx ON public.relay_drafts (org_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.portal_source_key(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(lower(btrim(p_source)), ''), '(none)');
$$;

CREATE OR REPLACE FUNCTION public.portal_open_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['new', 'working', 'call_booked', 'no_show', 'follow_up', 'objection_hold'];
$$;

/** The top readiness band, by its minimum score in the workspace's configuration. */
CREATE OR REPLACE FUNCTION public.portal_top_band(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b->>'name'
  FROM jsonb_array_elements(COALESCE(public.config_effective_at(p_org_id)->'values'->'qualification.scoring_bands', '[]'::jsonb)) b
  ORDER BY (b->>'min_score')::numeric DESC NULLS LAST
  LIMIT 1;
$$;

/** Leads that count: not test leads, not merged away, narrowed by the filters. */
CREATE OR REPLACE FUNCTION public.portal_lead_scope(p_org_id uuid, p_filters jsonb)
RETURNS TABLE (lead_id uuid, arrived_at timestamptz, status text, source_key text, setter_id uuid, closer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.opted_in_at, l.status::text, public.portal_source_key(l.source), l.assigned_setter_id, l.assigned_closer_id
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND NOT l.is_test
    AND l.merged_into IS NULL
    AND (NULLIF(p_filters->>'source', '') IS NULL OR public.portal_source_key(l.source) = p_filters->>'source')
    AND (NULLIF(p_filters->>'stage', '') IS NULL OR l.status::text = p_filters->>'stage')
    AND (
      NULLIF(p_filters->>'person', '') IS NULL
      OR (p_filters->>'person' = 'unassigned' AND l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL)
      OR l.assigned_setter_id::text = p_filters->>'person'
      OR l.assigned_closer_id::text = p_filters->>'person'
    )
    AND (
      NULLIF(p_filters->>'field', '') IS NULL
      OR EXISTS (
        SELECT 1 FROM public.case_file_fields f
        WHERE f.org_id = p_org_id AND f.lead_id = l.id AND f.field_key = p_filters->>'field' AND f.state = 'present'
          AND lower(btrim(f.value #>> '{}')) = lower(btrim(COALESCE(p_filters->>'field_value', '')))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.portal_assert_results(p_org_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.portal_can_see_results(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_filters->>'person', '') IS NOT NULL AND NOT public.portal_can_see_people(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

/**
 * The rows behind one metric. `at` is when the row happened, `value` the
 * number it carries (seconds, cents), `detail` a short machine label.
 *
 * Metrics that describe "right now" ignore the range.
 */
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

CREATE OR REPLACE FUNCTION public.portal_metric_aggregate(
  p_org_id uuid,
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'count', count(*),
    'leads', count(DISTINCT r.lead_id),
    'sum', sum(r.value),
    'avg', avg(r.value),
    'median', percentile_cont(0.5) WITHIN GROUP (ORDER BY r.value)
  )
  FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters) r;
$$;

/**
 * Several metrics for one range and its comparison range. Metrics the caller
 * may not see come back as {"hidden": true} rather than failing the batch.
 */
CREATE OR REPLACE FUNCTION public.portal_metric_summary(
  p_org_id uuid,
  p_metrics text[],
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz DEFAULT NULL,
  p_prev_to timestamptz DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_metric text;
  v_current jsonb;
  v_previous jsonb;
BEGIN
  PERFORM public.portal_assert_results(p_org_id, COALESCE(p_filters, '{}'::jsonb));
  FOREACH v_metric IN ARRAY p_metrics LOOP
    BEGIN
      v_current := public.portal_metric_aggregate(p_org_id, v_metric, p_from, p_to, p_filters);
      v_previous := CASE
        WHEN p_prev_from IS NULL OR public.portal_metric_is_now(v_metric) THEN NULL
        ELSE public.portal_metric_aggregate(p_org_id, v_metric, p_prev_from, p_prev_to, p_filters)
      END;
      v_out := v_out || jsonb_build_object(v_metric, jsonb_build_object('current', v_current, 'previous', v_previous));
    EXCEPTION WHEN insufficient_privilege THEN
      v_out := v_out || jsonb_build_object(v_metric, jsonb_build_object('hidden', true));
    END;
  END LOOP;
  RETURN v_out;
END;
$$;

/** One metric, grouped. Each group's count equals the metric with that group as a filter. */
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

/** The leads behind a metric, newest first, for a drill-through list. */
CREATE OR REPLACE FUNCTION public.portal_metric_leads(
  p_org_id uuid,
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (lead_id uuid, name text, at timestamptz, value numeric, detail text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (SELECT * FROM public.portal_metric_rows(p_org_id, p_metric, p_from, p_to, p_filters))
  SELECT r.lead_id,
    COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), 'Unnamed lead'),
    r.at, r.value, r.detail, count(*) OVER ()
  FROM r
  JOIN public.leads l ON l.id = r.lead_id
  ORDER BY r.at DESC NULLS LAST, r.lead_id
  LIMIT LEAST(GREATEST(p_limit, 1), 5000) OFFSET GREATEST(p_offset, 0);
$$;

/** What each filter can be set to, and what data the workspace has at all. */
CREATE OR REPLACE FUNCTION public.portal_workspace_facts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_people boolean;
  v_money boolean;
  v_out jsonb;
BEGIN
  PERFORM public.portal_assert_results(p_org_id);
  v_people := public.portal_can_see_people(p_org_id);
  v_money := public.portal_can_see_money(p_org_id);

  SELECT jsonb_build_object(
    'earliest_lead_at', (SELECT min(l.opted_in_at) FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL),
    'has_leads', EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL),
    'has_response', EXISTS (SELECT 1 FROM public.sentry_clocks c WHERE c.org_id = p_org_id)
      OR EXISTS (SELECT 1 FROM public.sentry_measurements m WHERE m.org_id = p_org_id),
    'has_case_files', EXISTS (SELECT 1 FROM public.case_files cf WHERE cf.org_id = p_org_id),
    'has_bands', EXISTS (SELECT 1 FROM public.case_files cf WHERE cf.org_id = p_org_id AND cf.band IS NOT NULL),
    'has_stage_changes', EXISTS (SELECT 1 FROM public.lead_status_changes c WHERE c.org_id = p_org_id),
    'has_bookings', EXISTS (SELECT 1 FROM public.calls c WHERE c.org_id = p_org_id AND c.scheduled_at IS NOT NULL),
    'has_relay', EXISTS (SELECT 1 FROM public.relay_drafts d WHERE d.org_id = p_org_id AND NOT d.simulated),
    'has_alerts', EXISTS (SELECT 1 FROM public.sentry_alerts a WHERE a.org_id = p_org_id),
    'has_objections', EXISTS (SELECT 1 FROM public.objections o WHERE o.org_id = p_org_id),
    'has_revenue', v_money AND EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = p_org_id AND r.kind <> 'failed'),
    'has_typed_revenue', v_money AND EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = p_org_id AND r.lifecycle IS NOT NULL),
    'can_see_money', v_money,
    'can_see_people', v_people,
    'can_export', public.portal_can_export(p_org_id),
    'can_approve', public.ws_can_approve(p_org_id),
    'top_band', public.portal_top_band(p_org_id),
    'bands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', b->>'name', 'min_score', (b->>'min_score')::numeric) ORDER BY (b->>'min_score')::numeric)
      FROM jsonb_array_elements(COALESCE(public.config_effective_at(p_org_id)->'values'->'qualification.scoring_bands', '[]'::jsonb)) b
    ), '[]'::jsonb),
    'first_touch_minutes', (public.config_effective_at(p_org_id)->'values'->>'response.first_touch_minutes')::numeric,
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', s.key, 'label', s.label, 'count', s.n) ORDER BY s.n DESC)
      FROM (
        SELECT public.portal_source_key(l.source) AS key, COALESCE(max(NULLIF(btrim(l.source), '')), 'No source') AS label, count(*) AS n
        FROM public.leads l WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
        GROUP BY 1 ORDER BY 3 DESC LIMIT 100
      ) s
    ), '[]'::jsonb),
    'people', CASE WHEN v_people THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'role', m.role, 'active', m.active) ORDER BY m.display_name)
      FROM public.org_members m
      WHERE m.org_id = p_org_id AND m.seat = 'customer'
        AND (m.active OR EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND (l.assigned_setter_id = m.id OR l.assigned_closer_id = m.id)))
    ), '[]'::jsonb) ELSE NULL END,
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', f.field_key, 'label', f.label, 'values', f.vals) ORDER BY f.label)
      FROM (
        SELECT x.field_key, max(x.label) AS label, jsonb_agg(DISTINCT lower(btrim(x.value #>> '{}'))) AS vals, count(DISTINCT lower(btrim(x.value #>> '{}'))) AS n
        FROM public.case_file_fields x
        WHERE x.org_id = p_org_id AND x.state = 'present' AND jsonb_typeof(x.value) = 'string'
          AND char_length(x.value #>> '{}') <= 60
        GROUP BY x.field_key
      ) f
      WHERE f.n BETWEEN 2 AND 25
    ), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Onboarding status: one record per workspace
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_onboarding_status (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  live boolean NOT NULL DEFAULT false,
  went_live_at timestamptz,
  live_seen_at timestamptz,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_onboarding_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_onboarding_status_select ON public.workspace_onboarding_status;
CREATE POLICY workspace_onboarding_status_select ON public.workspace_onboarding_status FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT ON public.workspace_onboarding_status TO authenticated;
GRANT ALL ON public.workspace_onboarding_status TO service_role;

CREATE OR REPLACE FUNCTION public.onboarding_status_compute(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  r public.messaging_readiness%ROWTYPE;
  v_crm text;
  v_members integer;
  v_invites integer;
  v_approvers integer;
  v_steps jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO r FROM public.messaging_readiness WHERE org_id = p_org_id;
  SELECT CASE
    WHEN bool_or(c.status = 'active') THEN 'active'
    WHEN bool_or(c.status = 'broken') THEN 'broken'
    WHEN count(*) > 0 THEN 'inactive'
  END INTO v_crm
  FROM public.ghl_connections c WHERE c.org_id = p_org_id;
  SELECT count(*) INTO v_members FROM public.org_members m WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer';
  SELECT count(*) INTO v_invites FROM public.org_invites i WHERE i.org_id = p_org_id AND i.accepted_at IS NULL AND i.expires_at > now();
  SELECT count(*) INTO v_approvers FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.active AND m.seat = 'customer' AND m.last_seen_at IS NOT NULL
      AND (m.role = 'owner' OR (m.role IN ('member', 'client_viewer') AND m.can_approve));

  v_steps := jsonb_build_array(
    jsonb_build_object('key', 'approach', 'label', 'Choose your approach',
      'state', CASE WHEN o.industry_template_id IS NOT NULL THEN 'done' ELSE 'waiting_on_team' END,
      'why', 'Vistrial starts from a setup made for businesses like yours, so case files and follow-ups use your language.'),
    jsonb_build_object('key', 'crm', 'label', 'Connect your CRM',
      'state', CASE v_crm WHEN 'active' THEN 'done' WHEN 'broken' THEN 'waiting_on_customer' WHEN 'inactive' THEN 'in_progress' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN v_crm IS DISTINCT FROM 'active' THEN jsonb_build_object('label', CASE WHEN v_crm = 'broken' THEN 'Reconnect your CRM' ELSE 'Connect your CRM' END, 'href', '/app/onboarding/connect') END,
      'why', 'Your leads, calls, and bookings come from your CRM. Nothing is written back to it.'),
    jsonb_build_object('key', 'messaging', 'label', 'Connect messaging',
      'state', CASE
        WHEN r.sender_number_confirmed_at IS NOT NULL AND r.sending_domain_confirmed_at IS NOT NULL THEN 'done'
        WHEN r.sender_number_confirmed_at IS NOT NULL OR r.sending_domain_confirmed_at IS NOT NULL THEN 'in_progress'
        ELSE 'waiting_on_team' END,
      'why', 'Your team confirms the number and email address your messages go out from, so drafts match what your CRM sends.'),
    jsonb_build_object('key', 'approvers', 'label', 'Set who approves messages',
      'state', CASE WHEN v_approvers > 0 THEN 'done' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN v_approvers = 0 THEN jsonb_build_object('label', 'Choose approvers', 'href', '/app/settings/members') END,
      'why', 'Every message Vistrial drafts waits for a person to approve it before anyone sends it.'),
    jsonb_build_object('key', 'escalation', 'label', 'Set escalation contacts',
      'state', CASE WHEN NULLIF(btrim(COALESCE(o.owner_contact_phone, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(o.owner_contact_email, '')), '') IS NOT NULL THEN 'done' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN NULLIF(btrim(COALESCE(o.owner_contact_phone, '')), '') IS NULL AND NULLIF(btrim(COALESCE(o.owner_contact_email, '')), '') IS NULL THEN jsonb_build_object('label', 'Add a contact', 'href', '/app/settings/organization') END,
      'why', 'When a new lead waits too long, Vistrial needs someone to tell.'),
    jsonb_build_object('key', 'team', 'label', 'Invite your team',
      'state', CASE WHEN v_members > 1 THEN 'done' WHEN v_invites > 0 THEN 'in_progress' ELSE 'waiting_on_customer' END,
      'action', CASE WHEN v_members <= 1 THEN jsonb_build_object('label', 'Invite people', 'href', '/app/settings/members') END,
      'why', 'Setters and closers see their own leads and log what happened on each call.'),
    jsonb_build_object('key', 'test', 'label', 'Test with a sample lead',
      'state', CASE WHEN EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND l.is_test) THEN 'done' ELSE 'waiting_on_team' END,
      'why', 'A practice lead shows the whole path, from arrival to case file to a drafted follow-up, before real leads depend on it.'),
    jsonb_build_object('key', 'go_live', 'label', 'Go live',
      'state', CASE WHEN o.status = 'active' THEN 'done' ELSE 'waiting_on_team' END,
      'why', 'Your team switches the workspace on once the steps above are done.')
  );
  RETURN v_steps;
END;
$$;

/** Recomputes the record from what exists today, applying any team overrides. */
CREATE OR REPLACE FUNCTION public.onboarding_status_refresh(p_org_id uuid)
RETURNS public.workspace_onboarding_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workspace_onboarding_status%ROWTYPE;
  v_steps jsonb;
  v_overrides jsonb;
  v_live boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT overrides INTO v_overrides FROM public.workspace_onboarding_status WHERE org_id = p_org_id;
  v_overrides := COALESCE(v_overrides, '{}'::jsonb);
  SELECT COALESCE(jsonb_agg(
    CASE WHEN v_overrides ? (s->>'key') THEN
      s || jsonb_strip_nulls(jsonb_build_object(
        'state', v_overrides->(s->>'key')->>'state',
        'note', v_overrides->(s->>'key')->>'note',
        'eta', v_overrides->(s->>'key')->>'eta'))
    ELSE s END
  ), '[]'::jsonb) INTO v_steps
  FROM jsonb_array_elements(public.onboarding_status_compute(p_org_id)) s;

  SELECT status = 'active' INTO v_live FROM public.organizations WHERE id = p_org_id;

  INSERT INTO public.workspace_onboarding_status AS w (org_id, steps, overrides, live, went_live_at, refreshed_at, updated_at)
  VALUES (p_org_id, v_steps, v_overrides, COALESCE(v_live, false), CASE WHEN v_live THEN now() END, now(), now())
  ON CONFLICT (org_id) DO UPDATE
    SET steps = EXCLUDED.steps,
        live = EXCLUDED.live,
        went_live_at = CASE WHEN EXCLUDED.live AND w.went_live_at IS NULL THEN now() WHEN NOT EXCLUDED.live THEN NULL ELSE w.went_live_at END,
        live_seen_at = CASE WHEN EXCLUDED.live THEN w.live_seen_at END,
        refreshed_at = now(),
        updated_at = CASE WHEN w.steps IS DISTINCT FROM EXCLUDED.steps OR w.live IS DISTINCT FROM EXCLUDED.live THEN now() ELSE w.updated_at END
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

/** The team sets a step's state, note, or expected timing. */
CREATE OR REPLACE FUNCTION public.onboarding_status_set_step(
  p_org_id uuid,
  p_key text,
  p_state text,
  p_note text DEFAULT NULL,
  p_eta text DEFAULT NULL
)
RETURNS public.workspace_onboarding_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_key NOT IN ('approach', 'crm', 'messaging', 'approvers', 'escalation', 'team', 'test', 'go_live') THEN
    RAISE EXCEPTION 'Unknown step.' USING ERRCODE = '22023';
  END IF;
  IF p_state IS NOT NULL AND p_state NOT IN ('done', 'in_progress', 'waiting_on_customer', 'waiting_on_team') THEN
    RAISE EXCEPTION 'Unknown state.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_onboarding_status (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.workspace_onboarding_status
  SET overrides = CASE
    WHEN p_state IS NULL AND NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL AND NULLIF(btrim(COALESCE(p_eta, '')), '') IS NULL THEN overrides - p_key
    ELSE overrides || jsonb_build_object(p_key, jsonb_strip_nulls(jsonb_build_object(
      'state', p_state,
      'note', left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300),
      'eta', left(NULLIF(btrim(COALESCE(p_eta, '')), ''), 80))))
  END
  WHERE org_id = p_org_id;
  PERFORM public.ws_log(p_org_id, 'onboarding.step_updated', 'workspace_onboarding_status', p_org_id::text,
    jsonb_build_object('step', p_key, 'state', p_state), auth.uid());
  RETURN public.onboarding_status_refresh(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_live_seen(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.workspace_onboarding_status SET live_seen_at = now()
  WHERE org_id = p_org_id AND live AND p_org_id IN (SELECT public.user_org_ids());
$$;

-- ---------------------------------------------------------------------------
-- 5. Help requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL,
  created_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_by_name text NOT NULL,
  topic text NOT NULL DEFAULT 'general'
    CHECK (topic IN ('general', 'connections', 'billing', 'results', 'team', 'onboarding', 'privacy', 'leads')),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000),
  page_path text CHECK (page_path IS NULL OR (page_path ~ '^/' AND char_length(page_path) <= 300)),
  lead_id uuid,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'answered', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  last_reply_at timestamptz,
  UNIQUE (id, org_id),
  FOREIGN KEY (lead_id, org_id) REFERENCES public.leads (id, org_id) ON DELETE SET NULL (lead_id)
);
CREATE INDEX IF NOT EXISTS help_requests_org_idx ON public.help_requests (org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.help_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  org_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  author_name text NOT NULL,
  from_team boolean NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (request_id, org_id) REFERENCES public.help_requests (id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS help_replies_request_idx ON public.help_replies (request_id, created_at);

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS help_requests_select ON public.help_requests;
CREATE POLICY help_requests_select ON public.help_requests FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_staff_org_ids())
    OR (org_id IN (SELECT public.user_org_ids()) AND (created_by_user_id = auth.uid() OR org_id IN (SELECT public.user_owner_org_ids())))
  );

DROP POLICY IF EXISTS help_replies_select ON public.help_replies;
CREATE POLICY help_replies_select ON public.help_replies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.help_requests r WHERE r.id = help_replies.request_id AND r.org_id = help_replies.org_id));

GRANT SELECT ON public.help_requests, public.help_replies TO authenticated;
GRANT ALL ON public.help_requests, public.help_replies TO service_role;

CREATE OR REPLACE FUNCTION public.portal_actor_name(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(m.display_name), '') FROM public.org_members m WHERE m.org_id = p_org_id AND m.user_id = auth.uid() AND m.active LIMIT 1),
    (SELECT NULLIF(btrim(s.display_name), '') FROM public.platform_staff s WHERE s.user_id = auth.uid()),
    'Someone'
  );
$$;

CREATE OR REPLACE FUNCTION public.help_request_create(
  p_org_id uuid,
  p_topic text,
  p_message text,
  p_page_path text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  v_id uuid;
  v_page text := NULLIF(btrim(COALESCE(p_page_path, '')), '');
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_message, ''))) = 0 THEN
    RAISE EXCEPTION 'Write a message for your team.' USING ERRCODE = '22023';
  END IF;
  IF v_page IS NOT NULL AND (v_page !~ '^/' OR char_length(v_page) > 300) THEN
    v_page := NULL;
  END IF;
  IF p_lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = p_lead_id AND l.org_id = p_org_id) THEN
      RAISE EXCEPTION 'That lead is not in this workspace.' USING ERRCODE = '22023';
    END IF;
    IF v_access = 'operator' AND p_lead_id NOT IN (SELECT public.operator_visible_lead_ids()) THEN
      RAISE EXCEPTION 'That lead is not in this workspace.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.help_requests (org_id, created_by_user_id, created_by_member_id, created_by_name, topic, message, page_path, lead_id)
  VALUES (
    p_org_id, auth.uid(), public.user_member_id(p_org_id), public.portal_actor_name(p_org_id),
    CASE WHEN p_topic IN ('general', 'connections', 'billing', 'results', 'team', 'onboarding', 'privacy', 'leads') THEN p_topic ELSE 'general' END,
    left(btrim(p_message), 4000), v_page, p_lead_id
  )
  RETURNING id INTO v_id;

  PERFORM public.ws_log(p_org_id, 'help.requested', 'help_requests', v_id::text,
    jsonb_build_object('topic', p_topic, 'with_lead', p_lead_id IS NOT NULL), auth.uid());
  RETURN v_id;
END;
$$;

/**
 * Staff reply as the team and move the status along. The person who asked,
 * or an owner, can add to the request, which puts it back with the team.
 */
CREATE OR REPLACE FUNCTION public.help_request_reply(p_request_id uuid, p_body text, p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.help_requests%ROWTYPE;
  v_team boolean;
  v_status text;
BEGIN
  SELECT * INTO v_req FROM public.help_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  v_team := public.ws_is_staff(v_req.org_id);
  IF NOT v_team AND NOT (
    v_req.org_id IN (SELECT public.user_org_ids())
    AND (v_req.created_by_user_id = auth.uid() OR v_req.org_id IN (SELECT public.user_owner_org_ids()))
  ) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;

  IF char_length(btrim(COALESCE(p_body, ''))) > 0 THEN
    INSERT INTO public.help_replies (request_id, org_id, author_user_id, author_name, from_team, body)
    VALUES (v_req.id, v_req.org_id, auth.uid(), CASE WHEN v_team THEN 'Your Vistrial team' ELSE public.portal_actor_name(v_req.org_id) END,
      v_team, left(btrim(p_body), 4000));
  ELSIF p_status IS NULL THEN
    RAISE EXCEPTION 'Write a reply.' USING ERRCODE = '22023';
  END IF;

  v_status := CASE
    WHEN v_team THEN COALESCE(CASE WHEN p_status IN ('in_progress', 'answered', 'closed') THEN p_status END,
      CASE WHEN char_length(btrim(COALESCE(p_body, ''))) > 0 THEN 'answered' ELSE v_req.status END)
    WHEN p_status = 'closed' THEN 'closed'
    ELSE 'received'
  END;

  UPDATE public.help_requests
  SET status = v_status,
      updated_at = now(),
      last_reply_at = CASE WHEN char_length(btrim(COALESCE(p_body, ''))) > 0 THEN now() ELSE last_reply_at END,
      answered_at = CASE WHEN v_status = 'answered' THEN now() ELSE answered_at END
  WHERE id = v_req.id;

  PERFORM public.ws_log(v_req.org_id, CASE WHEN v_team THEN 'help.answered' ELSE 'help.followed_up' END, 'help_requests', v_req.id::text,
    jsonb_build_object('status', v_status, 'from_team', v_team), auth.uid());
  RETURN jsonb_build_object('status', v_status, 'from_team', v_team, 'requester', v_req.created_by_user_id, 'org_id', v_req.org_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Data export and deletion requests. Never executed automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('export', 'deletion')),
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'completed', 'declined')),
  team_note text CHECK (team_note IS NULL OR char_length(team_note) <= 2000),
  requested_by_user_id uuid NOT NULL,
  requested_by_name text NOT NULL,
  resolved_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS data_requests_org_idx ON public.data_requests (org_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS data_requests_one_open ON public.data_requests (org_id, kind) WHERE status IN ('received', 'in_progress');

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_requests_select ON public.data_requests;
CREATE POLICY data_requests_select ON public.data_requests FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()) OR org_id IN (SELECT public.user_owner_org_ids()));
GRANT SELECT ON public.data_requests TO authenticated;
GRANT ALL ON public.data_requests TO service_role;

CREATE OR REPLACE FUNCTION public.data_request_create(p_org_id uuid, p_kind text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') NOT IN ('owner', 'platform_admin', 'service_team') THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Unknown request.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_existing FROM public.data_requests
  WHERE org_id = p_org_id AND kind = p_kind AND status IN ('received', 'in_progress');
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'already', true);
  END IF;
  INSERT INTO public.data_requests (org_id, kind, note, requested_by_user_id, requested_by_name)
  VALUES (p_org_id, p_kind, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 2000), auth.uid(), public.portal_actor_name(p_org_id))
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'data.' || p_kind || '_requested', 'data_requests', v_id::text, '{}'::jsonb, auth.uid());
  RETURN jsonb_build_object('id', v_id, 'already', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.data_request_update(p_request_id uuid, p_status text, p_team_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.data_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.data_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT public.ws_is_staff(v_req.org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('received', 'in_progress', 'completed', 'declined') THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.data_requests
  SET status = p_status,
      team_note = COALESCE(left(NULLIF(btrim(COALESCE(p_team_note, '')), ''), 2000), team_note),
      updated_at = now(),
      resolved_at = CASE WHEN p_status IN ('completed', 'declined') THEN now() END,
      resolved_by_user_id = CASE WHEN p_status IN ('completed', 'declined') THEN auth.uid() END
  WHERE id = v_req.id;
  PERFORM public.ws_log(v_req.org_id, 'data.request_' || p_status, 'data_requests', v_req.id::text,
    jsonb_build_object('kind', v_req.kind), auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. What is new. Product updates, written by Platform Admins.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 140),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  area text CHECK (area IS NULL OR area IN ('home', 'results', 'leads', 'agents', 'team', 'billing', 'general')),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_updates_select ON public.product_updates;
CREATE POLICY product_updates_select ON public.product_updates FOR SELECT TO authenticated
  USING (published_at <= now() OR public.is_platform_admin());
DROP POLICY IF EXISTS product_updates_admin ON public.product_updates;
CREATE POLICY product_updates_admin ON public.product_updates FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_updates TO authenticated;
GRANT ALL ON public.product_updates TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Billing: the workspace's link to its Stripe customer
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_billing (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,}$'),
  stripe_subscription_id text,
  status text,
  plan_name text,
  price_cents bigint,
  currency text,
  billing_interval text,
  interval_count integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  trial_end timestamptz,
  payment_failed_at timestamptz,
  last_invoice_status text,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_by_user_id uuid,
  linked_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_billing_select ON public.workspace_billing;
CREATE POLICY workspace_billing_select ON public.workspace_billing FOR SELECT TO authenticated
  USING (public.portal_can_see_billing(org_id));
GRANT SELECT ON public.workspace_billing TO authenticated;
GRANT ALL ON public.workspace_billing TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Results exports, built in the background
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.results_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  params jsonb NOT NULL,
  include_people boolean NOT NULL,
  include_money boolean NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  row_count integer,
  file_path text CHECK (file_path IS NULL OR file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.csv$'),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS results_exports_org_idx ON public.results_exports (org_id, created_at DESC);

ALTER TABLE public.results_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS results_exports_select ON public.results_exports;
CREATE POLICY results_exports_select ON public.results_exports FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND requested_by_user_id = auth.uid());
GRANT SELECT ON public.results_exports TO authenticated;
GRANT ALL ON public.results_exports TO service_role;

CREATE OR REPLACE FUNCTION public.results_export_create(p_org_id uuid, p_params jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_people boolean := public.portal_can_see_people(p_org_id);
BEGIN
  IF NOT public.portal_can_export(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_params->'filters'->>'person', '') IS NOT NULL AND NOT v_people THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.results_exports (org_id, requested_by_user_id, params, include_people, include_money)
  VALUES (p_org_id, auth.uid(), COALESCE(p_params, '{}'::jsonb), v_people, public.portal_can_see_money(p_org_id))
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'results.exported', 'results_exports', v_id::text,
    jsonb_build_object('from', p_params->>'from', 'to', p_params->>'to', 'people', v_people), auth.uid());
  RETURN v_id;
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-exports', 'portal-exports', false), ('member-avatars', 'member-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Leaving the team: reassign before deactivating
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.member_offboard(p_member_id uuid, p_reassign_to uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.org_members%ROWTYPE;
  v_target public.org_members%ROWTYPE;
  v_setter integer;
  v_closer integer;
  v_items integer;
  v_actions integer;
BEGIN
  SELECT * INTO v_member FROM public.org_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.ws_is_staff(v_member.org_id)
    OR public.user_has_org_role(v_member.org_id, VARIADIC ARRAY['owner'::public.org_role])
  ) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF v_member.seat <> 'customer' THEN
    RAISE EXCEPTION 'Only workspace people can be removed here.' USING ERRCODE = '22023';
  END IF;
  IF p_reassign_to IS NOT NULL THEN
    SELECT * INTO v_target FROM public.org_members WHERE id = p_reassign_to;
    IF NOT FOUND OR v_target.org_id <> v_member.org_id OR NOT v_target.active OR v_target.id = v_member.id
      OR v_target.seat <> 'customer' OR v_target.role NOT IN ('owner', 'setter', 'closer', 'operator') THEN
      RAISE EXCEPTION 'Choose someone active in this workspace who works leads.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.leads SET assigned_setter_id = p_reassign_to, updated_at = now()
  WHERE org_id = v_member.org_id AND assigned_setter_id = v_member.id;
  GET DIAGNOSTICS v_setter = ROW_COUNT;
  UPDATE public.leads SET assigned_closer_id = p_reassign_to, updated_at = now()
  WHERE org_id = v_member.org_id AND assigned_closer_id = v_member.id;
  GET DIAGNOSTICS v_closer = ROW_COUNT;
  UPDATE public.approval_items SET assigned_member_id = p_reassign_to, updated_at = now()
  WHERE org_id = v_member.org_id AND assigned_member_id = v_member.id AND status IN ('pending', 'approved');
  GET DIAGNOSTICS v_items = ROW_COUNT;
  UPDATE public.next_actions SET owner_member_id = p_reassign_to
  WHERE org_id = v_member.org_id AND owner_member_id = v_member.id AND completed_at IS NULL;
  GET DIAGNOSTICS v_actions = ROW_COUNT;

  UPDATE public.org_members SET active = false WHERE id = v_member.id;

  PERFORM public.ws_log(v_member.org_id, 'member.offboarded', 'org_members', v_member.id::text,
    jsonb_build_object(
      'name', v_member.display_name,
      'reassigned_to', v_target.display_name,
      'leads', v_setter + v_closer,
      'approvals', v_items,
      'tasks', v_actions
    ), auth.uid());
  RETURN jsonb_build_object('leads', v_setter + v_closer, 'approvals', v_items, 'tasks', v_actions);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Personal settings the person changes for themselves
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_update_self(p_org_id uuid, p_notification_delivery text DEFAULT NULL, p_avatar_path text DEFAULT NULL, p_clear_avatar boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid := public.user_member_id(p_org_id);
BEGIN
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_avatar_path IS NOT NULL AND p_avatar_path NOT LIKE p_org_id::text || '/' || v_member::text || '.%' THEN
    RAISE EXCEPTION 'That photo does not belong to you.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.org_members
  SET notification_delivery = COALESCE(p_notification_delivery, notification_delivery),
      avatar_path = CASE WHEN p_clear_avatar THEN NULL ELSE COALESCE(p_avatar_path, avatar_path) END
  WHERE id = v_member;
END;
$$;

/** Records a Home visit. The previous one is what "while you were away" counts from. */
CREATE OR REPLACE FUNCTION public.portal_mark_home_seen(p_org_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid := public.user_member_id(p_org_id);
  v_seen timestamptz;
  v_prev timestamptz;
BEGIN
  IF v_member IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT home_seen_at, home_prev_seen_at INTO v_seen, v_prev FROM public.org_members WHERE id = v_member;
  IF v_seen IS NULL OR now() - v_seen > interval '30 minutes' THEN
    UPDATE public.org_members SET home_prev_seen_at = v_seen, home_seen_at = now() WHERE id = v_member;
    RETURN v_seen;
  END IF;
  UPDATE public.org_members SET home_seen_at = now() WHERE id = v_member;
  RETURN v_prev;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Notification types for the portal
-- ---------------------------------------------------------------------------

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'help_request';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'help_reply';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'export_ready';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'billing_issue';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'data_request';

-- ---------------------------------------------------------------------------
-- 13. Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.portal_lead_scope(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_status_compute(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_member_flag(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.portal_can_see_results(uuid),
  public.portal_can_see_money(uuid),
  public.portal_can_see_people(uuid),
  public.portal_can_export(uuid),
  public.portal_can_see_billing(uuid),
  public.portal_metric_rows(uuid, text, timestamptz, timestamptz, jsonb),
  public.portal_metric_aggregate(uuid, text, timestamptz, timestamptz, jsonb),
  public.portal_metric_summary(uuid, text[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb),
  public.portal_metric_breakdown(uuid, text, timestamptz, timestamptz, jsonb, text),
  public.portal_metric_leads(uuid, text, timestamptz, timestamptz, jsonb, integer, integer),
  public.portal_workspace_facts(uuid),
  public.onboarding_status_refresh(uuid),
  public.onboarding_status_set_step(uuid, text, text, text, text),
  public.onboarding_live_seen(uuid),
  public.help_request_create(uuid, text, text, text, uuid),
  public.help_request_reply(uuid, text, text),
  public.data_request_create(uuid, text, text),
  public.data_request_update(uuid, text, text),
  public.results_export_create(uuid, jsonb),
  public.member_offboard(uuid, uuid),
  public.portal_update_self(uuid, text, text, boolean),
  public.portal_mark_home_seen(uuid),
  public.portal_member_flag(uuid, text)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_lead_scope(uuid, jsonb), public.onboarding_status_compute(uuid) TO service_role;
