-- Rollback Prompt 22 owner portal.

DROP FUNCTION IF EXISTS public.portal_adoption(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.portal_ads(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.portal_processor(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.portal_calendar(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.portal_forms(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.portal_recorder(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.reporting_lead_is_closed(uuid, uuid);

DROP TRIGGER IF EXISTS revenue_log_sync_net_close ON public.revenue_log;
DROP FUNCTION IF EXISTS public.sync_lead_net_close();

DELETE FROM public.ops_job_runs WHERE job_name IN ('portal-email', 'source-sync');
DELETE FROM public.ops_job_catalog WHERE job_name IN ('portal-email', 'source-sync');

DROP TABLE IF EXISTS public.portal_schedules;
DROP TABLE IF EXISTS public.form_events;
DROP TABLE IF EXISTS public.calendar_blocks;
DROP TABLE IF EXISTS public.processor_events;
DROP TABLE IF EXISTS public.ad_spend_days;
DROP TABLE IF EXISTS public.source_connections;

DROP TYPE IF EXISTS public.source_kind;

-- Restore reporting functions that Prompt 22 replaced, then reverse the
-- EXISTS -> has_net_close rewrite on remaining reporting_* functions.

CREATE OR REPLACE FUNCTION public.reporting_compute_outcome(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_run public.baseline_runs%ROWTYPE;
  v_self public.self_reported_baselines%ROWTYPE;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  v_live_n bigint := 0;
  v_live_k bigint := 0;
  v_mat_n bigint := 0;
  v_mat_k bigint := 0;
  v_base_n bigint := 0;
  v_base_k bigint := 0;
  v_headline jsonb;
  v_maturing jsonb;
  v_baseline jsonb;
  v_comparison jsonb;
  v_after numeric;
  v_before numeric;
  v_delta numeric;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT * INTO v_run FROM public.baseline_runs
  WHERE org_id = p_org_id ORDER BY created_at DESC, id DESC LIMIT 1;
  SELECT * INTO v_self FROM public.self_reported_baselines WHERE org_id = p_org_id;

  v_cutoff := now() - make_interval(days => o.sales_cycle_days);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_to));

  IF o.activated_at IS NOT NULL THEN
    SELECT count(*),
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.revenue_log r
               WHERE r.org_id = l.org_id AND r.lead_id = l.id
             )
           )
    INTO v_live_n, v_live_k
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;

    SELECT count(*),
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.revenue_log r
               WHERE r.org_id = l.org_id AND r.lead_id = l.id
             )
           )
    INTO v_mat_n, v_mat_k
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at > v_cutoff;
  END IF;

  v_headline := public.reporting_rate(v_live_k, v_live_n, public.reporting_rate_min(), true)
    || jsonb_build_object(
      'window_start', v_live_start,
      'window_end', p_to,
      'mature_cutoff', v_cutoff,
      'clamped_from_activation', p_from < COALESCE(o.activated_at, p_from)
    );
  v_maturing := public.reporting_rate(v_mat_k, v_mat_n, public.reporting_rate_min(), true)
    || jsonb_build_object(
      'label', 'Maturing — these leads have not had a full sales cycle yet and are not in the headline.'
    );

  v_baseline := NULL;
  v_comparison := NULL;
  IF v_run.grade IN ('usable', 'partial') THEN
    SELECT count(*),
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.baseline_revenue r
               WHERE r.org_id = b.org_id AND r.baseline_lead_id = b.id
             )
           )
    INTO v_base_n, v_base_k
    FROM public.baseline_leads b
    WHERE b.org_id = p_org_id
      AND b.run_id = v_run.id
      AND b.created_at_crm IS NOT NULL
      AND b.created_at_crm >= v_run.window_start
      AND b.created_at_crm < COALESCE(o.activated_at, v_run.window_end)
      AND b.created_at_crm <= v_cutoff
      AND (
        NOT v_run.discontinuity_detected
        OR v_run.discontinuity_month IS NULL
        OR b.created_at_crm >= v_run.discontinuity_month::timestamptz
      );

    v_baseline := public.reporting_rate(v_base_k, v_base_n, public.reporting_rate_min(), true)
      || jsonb_build_object(
        'kind', 'backfilled',
        'grade', v_run.grade,
        'caveats', to_jsonb(v_run.grade_reasons),
        'window_start', v_run.window_start,
        'window_end', COALESCE(o.activated_at, v_run.window_end),
        'label', 'Vistrial measurement from CRM history'
      );

    v_after := (v_headline ->> 'per_hundred')::numeric;
    v_before := (v_baseline ->> 'per_hundred')::numeric;
    IF v_after IS NOT NULL AND v_before IS NOT NULL THEN
      v_delta := public.reporting_trunc_delta(v_after - v_before, 1);
      v_comparison := jsonb_build_object(
        'shown', true,
        'from', 'backfilled',
        'delta_per_hundred', v_delta,
        'improved', v_delta > 0,
        'unchanged', v_delta = 0,
        'too_small', false
      );
    ELSIF (v_headline ->> 'too_small')::boolean OR (v_baseline ->> 'too_small')::boolean THEN
      v_comparison := jsonb_build_object(
        'shown', false,
        'from', 'backfilled',
        'too_small', true,
        'plain', 'The sample is too small for the difference to mean anything.'
      );
    END IF;
  ELSIF v_run.grade = 'unusable' THEN
    v_comparison := jsonb_build_object(
      'shown', false,
      'from', 'none',
      'plain', 'No pre-activation comparison is shown. The CRM history was graded unusable.'
    );
  ELSIF v_run.id IS NULL THEN
    v_comparison := jsonb_build_object(
      'shown', false,
      'from', 'none',
      'plain', 'No pre-activation comparison is shown. Baseline history has not been pulled yet.'
    );
  END IF;

  RETURN jsonb_build_object(
    'lineage', 'leads.opted_in_at + revenue_log (after); baseline_leads.created_at_crm + baseline_revenue (before)',
    'attribution', 'Vistrial did not close these deals. The client''s team did.',
    'correlation_caveat', 'A change after activation is not proof that Vistrial caused it. Other changes the client made may be in the same window.',
    'activated_at', o.activated_at,
    'sales_cycle_days', o.sales_cycle_days,
    'headline', v_headline,
    'maturing', v_maturing,
    'baseline', v_baseline,
    'self_reported', CASE WHEN v_self.org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'leads_per_month', v_self.leads_per_month,
      'clients_closed_per_month', v_self.clients_closed_per_month,
      'label', 'self-reported',
      'stated_at', v_self.stated_at,
      'note', 'The client''s claim, not a Vistrial measurement. Not blended with live or backfilled figures.'
    ) END,
    'comparison', v_comparison
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_compute_team(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_from));

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.display_name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      m.id,
      m.display_name,
      m.role,
      (
        SELECT count(DISTINCT t.lead_id)
        FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id AND l.org_id = t.org_id
        WHERE t.org_id = p_org_id
          AND t.actor_member_id = m.id
          AND t.type = 'human'
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS leads_worked,
      (
        SELECT count(*)
        FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id
        WHERE t.org_id = p_org_id
          AND t.actor_member_id = m.id
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS touches_logged,
      (
        SELECT count(*)
        FROM public.calls c
        JOIN public.leads l ON l.id = c.lead_id
        WHERE c.org_id = p_org_id
          AND c.ran_by_member_id = m.id
          AND c.outcome = 'held'
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS calls_held,
      (
        SELECT count(DISTINCT r.lead_id)
        FROM public.revenue_log r
        JOIN public.leads l ON l.id = r.lead_id
        WHERE r.org_id = p_org_id
          AND r.closed_by_member_id = m.id
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
      )::bigint AS closes,
      (
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_human_touch_at - l.opted_in_at)) / 60.0
        )
        FROM public.leads l
        JOIN public.touches t ON t.lead_id = l.id AND t.org_id = l.org_id
          AND t.type = 'human' AND t.actor_member_id = m.id
          AND t.occurred_at = l.first_human_touch_at
        WHERE l.org_id = p_org_id
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
          AND l.first_human_touch_at IS NOT NULL
      ) AS median_first_touch_minutes
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.active = true
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'touches.actor_member_id, calls.ran_by_member_id, revenue_log.closed_by_member_id',
    'presentation', 'workload and coverage, not a ranking',
    'operators', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_recompute_outcome(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.organizations%ROWTYPE;
  v_live_start timestamptz;
  v_cutoff timestamptz;
  n bigint := 0;
  k bigint := 0;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  v_cutoff := now() - make_interval(days => o.sales_cycle_days);
  v_live_start := GREATEST(p_from, COALESCE(o.activated_at, p_to));

  -- Same window as reporting_compute_outcome. Independent path: JOIN + DISTINCT, not EXISTS.
  IF o.activated_at IS NOT NULL THEN
    SELECT count(*)::bigint INTO n
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;

    SELECT count(DISTINCT l.id)::bigint INTO k
    FROM public.leads l
    INNER JOIN public.revenue_log r
      ON r.lead_id = l.id
     AND r.org_id = l.org_id
    WHERE l.org_id = p_org_id
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;
  END IF;

  RETURN public.reporting_rate(k, n, public.reporting_rate_min(), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reporting_integrity_snapshot(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  closed_won_without_revenue int;
  phantom_touches int;
  score_drift int;
BEGIN
  IF p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not_org_member';
  END IF;

  SELECT count(*)::int INTO closed_won_without_revenue
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND l.status = 'closed_won'
    AND NOT EXISTS (
      SELECT 1 FROM public.revenue_log r
      WHERE r.lead_id = l.id AND r.org_id = l.org_id
    );

  SELECT count(*)::int INTO phantom_touches
  FROM public.touches t
  WHERE t.org_id = p_org_id
    AND t.occurred_at > now() + interval '1 hour';

  SELECT count(*)::int INTO score_drift
  FROM public.leads l
  LEFT JOIN LATERAL (
    SELECT s.total
    FROM public.readiness_scores s
    WHERE s.lead_id = l.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE l.org_id = p_org_id
    AND l.current_score IS DISTINCT FROM latest.total;

  RETURN jsonb_build_object(
    'closedWonWithoutRevenue', closed_won_without_revenue,
    'phantomTouches', phantom_touches,
    'scoreDrift', score_drift,
    'ok', closed_won_without_revenue = 0 AND phantom_touches = 0 AND score_drift = 0
  );
END;
$$;

-- Reverse the Prompt 22 rewrite on remaining reporting functions.
DO $$
DECLARE
  r record;
  src text;
  newsrc text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'reporting_%'
      AND p.proname NOT IN (
        'reporting_compute_outcome',
        'reporting_recompute_outcome',
        'reporting_integrity_snapshot',
        'reporting_compute_team'
      )
      AND pg_get_functiondef(p.oid) LIKE '%l.has_net_close%'
  LOOP
    src := pg_get_functiondef(r.oid);
    newsrc := replace(
      src,
      'l.has_net_close',
      'EXISTS (SELECT 1 FROM public.revenue_log r WHERE r.org_id = l.org_id AND r.lead_id = l.id)'
    );
    IF newsrc IS DISTINCT FROM src THEN
      EXECUTE newsrc;
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.redeem_org_invite(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.org_invites%ROWTYPE;
  v_user_email text;
  v_display_name text;
  v_member_id uuid;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_invite
  FROM public.org_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_display_name := split_part(v_user_email, '@', 1);

  INSERT INTO public.org_members (
    org_id, user_id, role, display_name, email, active
  )
  VALUES (
    v_invite.org_id,
    p_user_id,
    v_invite.role,
    v_display_name,
    v_user_email,
    true
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET active = true,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        display_name = CASE
          WHEN public.org_members.display_name = '' THEN EXCLUDED.display_name
          ELSE public.org_members.display_name
        END
  RETURNING id INTO v_member_id;

  UPDATE public.org_invites
  SET accepted_at = now()
  WHERE id = v_invite.id
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', v_member_id,
    'org_id', v_invite.org_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_org_invite(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_org_invite(text, uuid) TO service_role;

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

DROP TRIGGER IF EXISTS revenue_log_marks_closed_won ON public.revenue_log;
CREATE TRIGGER revenue_log_marks_closed_won
  AFTER INSERT ON public.revenue_log
  FOR EACH ROW EXECUTE FUNCTION public.revenue_marks_closed_won();

DROP INDEX IF EXISTS public.leads_org_net_close_idx;
DROP INDEX IF EXISTS public.revenue_log_processor_ref_key;

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_portal_role_check;
ALTER TABLE public.org_invites DROP CONSTRAINT IF EXISTS org_invites_portal_role_check;
ALTER TABLE public.org_members DROP COLUMN IF EXISTS surface_access;
ALTER TABLE public.org_invites DROP COLUMN IF EXISTS surface_access;
DROP TYPE IF EXISTS public.surface_access;

ALTER TABLE public.leads DROP COLUMN IF EXISTS has_net_close;
ALTER TABLE public.revenue_log DROP COLUMN IF EXISTS kind;
DROP TYPE IF EXISTS public.revenue_kind;
