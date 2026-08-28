-- Prompt 22: owner portal access, refunded closes, optional sources, scheduled report.

-- ---------------------------------------------------------------------------
-- Surface access: an owner can have the portal without an operator seat.
-- ---------------------------------------------------------------------------

CREATE TYPE public.surface_access AS ENUM ('operator', 'portal');

ALTER TABLE public.org_members
  ADD COLUMN surface_access public.surface_access NOT NULL DEFAULT 'operator';

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_portal_role_check
  CHECK (
    surface_access = 'operator'
    OR role IN ('owner'::public.org_role, 'admin'::public.org_role)
  );

COMMENT ON COLUMN public.org_members.surface_access IS
  'operator = working app. portal = owner portal only, no queue or case files.';

ALTER TABLE public.org_invites
  ADD COLUMN surface_access public.surface_access NOT NULL DEFAULT 'operator';

ALTER TABLE public.org_invites
  DROP CONSTRAINT IF EXISTS org_invites_role_invitable;

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_role_invitable CHECK (
    role = ANY (ARRAY['admin', 'closer', 'setter']::public.org_role[])
  );

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_portal_role_check
  CHECK (
    surface_access = 'operator'
    OR role = 'admin'::public.org_role
  );

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
    org_id, user_id, role, display_name, email, active, surface_access
  )
  VALUES (
    v_invite.org_id,
    p_user_id,
    v_invite.role,
    v_display_name,
    v_user_email,
    true,
    v_invite.surface_access
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET active = true,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        surface_access = EXCLUDED.surface_access,
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
    'org_id', v_invite.org_id,
    'surface_access', v_invite.surface_access
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_org_invite(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_org_invite(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Revenue kinds. A refunded sale is not a close.
-- ---------------------------------------------------------------------------

CREATE TYPE public.revenue_kind AS ENUM ('sale', 'refund', 'chargeback', 'failed');

ALTER TABLE public.revenue_log
  ADD COLUMN kind public.revenue_kind NOT NULL DEFAULT 'sale';

ALTER TABLE public.leads
  ADD COLUMN has_net_close boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.has_net_close IS
  'True when net processor-recognized revenue on this lead is greater than zero. Outcome metrics read this, not lead status.';

CREATE INDEX leads_org_net_close_idx
  ON public.leads (org_id)
  WHERE has_net_close;

CREATE UNIQUE INDEX revenue_log_processor_ref_key
  ON public.revenue_log (org_id, processor, processor_ref, kind)
  WHERE processor IS NOT NULL AND processor_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reporting_lead_is_closed(p_org_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN kind = 'sale' THEN amount_cents
      WHEN kind IN ('refund', 'chargeback') THEN -amount_cents
      ELSE 0
    END
  ), 0) > 0
  FROM public.revenue_log
  WHERE org_id = p_org_id AND lead_id = p_lead_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_net_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_lead uuid;
  v_closed boolean;
BEGIN
  v_org := COALESCE(NEW.org_id, OLD.org_id);
  v_lead := COALESCE(NEW.lead_id, OLD.lead_id);
  IF v_lead IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_closed := public.reporting_lead_is_closed(v_org, v_lead);

  UPDATE public.leads
  SET has_net_close = v_closed
  WHERE id = v_lead AND org_id = v_org AND has_net_close IS DISTINCT FROM v_closed;

  IF v_closed THEN
    PERFORM set_config('vistrial.allow_closed_won', '1', true);
    PERFORM set_config('vistrial.status_source', 'event', true);
    UPDATE public.leads
    SET status = 'closed_won'
    WHERE id = v_lead
      AND org_id = v_org
      AND status IS DISTINCT FROM 'closed_won';
  ELSE
    PERFORM set_config('vistrial.status_source', 'event', true);
    UPDATE public.leads
    SET status = 'closed_lost'
    WHERE id = v_lead
      AND org_id = v_org
      AND status = 'closed_won';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS revenue_log_marks_closed_won ON public.revenue_log;
DROP TRIGGER IF EXISTS revenue_log_sync_net_close ON public.revenue_log;

CREATE TRIGGER revenue_log_sync_net_close
  AFTER INSERT OR UPDATE OR DELETE ON public.revenue_log
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_net_close();

UPDATE public.leads l
SET has_net_close = true
WHERE EXISTS (
  SELECT 1 FROM public.revenue_log r
  WHERE r.org_id = l.org_id AND r.lead_id = l.id AND r.kind = 'sale'
);

-- Rewrite reporting functions that treated any revenue_log row as a close.
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
      AND pg_get_functiondef(p.oid) ILIKE '%revenue_log%'
  LOOP
    src := pg_get_functiondef(r.oid);
    newsrc := regexp_replace(
      src,
      'EXISTS\s*\(\s*SELECT 1 FROM public\.revenue_log r\s+WHERE r\.org_id = l\.org_id AND r\.lead_id = l\.id\s*\)',
      'l.has_net_close',
      'gi'
    );
    newsrc := regexp_replace(
      newsrc,
      'EXISTS\s*\(\s*SELECT 1 FROM public\.revenue_log r\s+WHERE r\.lead_id = l\.id AND r\.org_id = l\.org_id\s*\)',
      'l.has_net_close',
      'gi'
    );
    IF newsrc IS DISTINCT FROM src THEN
      EXECUTE newsrc;
    END IF;
  END LOOP;
END $$;

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
    SELECT count(*), count(*) FILTER (WHERE l.has_net_close)
    INTO v_live_n, v_live_k
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.opted_in_at >= v_live_start
      AND l.opted_in_at < p_to
      AND l.opted_in_at <= v_cutoff;

    SELECT count(*), count(*) FILTER (WHERE l.has_net_close)
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
    'lineage', 'leads.opted_in_at + leads.has_net_close (after); baseline_leads.created_at_crm + baseline_revenue (before)',
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

  IF o.activated_at IS NOT NULL THEN
    SELECT count(*)::bigint,
           count(*) FILTER (WHERE l.has_net_close)::bigint
    INTO n, k
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
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
    AND NOT l.has_net_close;

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

-- Team closes must also ignore refunded sales.
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
        SELECT count(*)
        FROM public.leads l
        WHERE l.org_id = p_org_id
          AND l.has_net_close
          AND NOT l.is_test
          AND l.opted_in_at >= v_live_start AND l.opted_in_at < p_to
          AND EXISTS (
            SELECT 1 FROM public.revenue_log r
            WHERE r.lead_id = l.id AND r.org_id = l.org_id
              AND r.kind = 'sale' AND r.closed_by_member_id = m.id
          )
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
    WHERE m.org_id = p_org_id AND m.active AND m.surface_access = 'operator'
  ) t;

  RETURN jsonb_build_object(
    'lineage', 'touches.actor_member_id, calls.ran_by_member_id, revenue_log.closed_by_member_id where has_net_close',
    'presentation', 'workload and coverage, not a ranking',
    'operators', COALESCE(v_rows, '[]'::jsonb),
    'note', 'Workload, not a ranking. Close rate is omitted on purpose.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Optional sources. Same connection shape for every kind.
-- ---------------------------------------------------------------------------

CREATE TYPE public.source_kind AS ENUM (
  'meta_ads',
  'google_ads',
  'stripe',
  'commas',
  'calendar',
  'form_platform'
);

CREATE TABLE public.source_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind public.source_kind NOT NULL,
  status public.ghl_connection_status NOT NULL DEFAULT 'inactive',
  provider text NOT NULL,
  account_label text,
  last_verified_at timestamptz,
  last_error text,
  secret_encrypted text,
  refresh_encrypted text,
  token_expires_at timestamptz,
  public_token text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_connections_org_kind_key UNIQUE (org_id, kind)
);

CREATE UNIQUE INDEX source_connections_public_token_key
  ON public.source_connections (public_token)
  WHERE public_token IS NOT NULL;

COMMENT ON TABLE public.source_connections IS
  'Optional owner-portal sources. Read-only credentials. Vistrial writes only to the CRM.';

CREATE TRIGGER source_connections_set_updated_at
  BEFORE UPDATE ON public.source_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ad_spend_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  platform text NOT NULL,
  spend_date date NOT NULL,
  campaign_id text,
  campaign_name text,
  spend_cents bigint NOT NULL DEFAULT 0,
  platform_leads integer,
  platform_purchases integer,
  modeled_conversions numeric,
  CONSTRAINT ad_spend_days_spend_nonneg CHECK (spend_cents >= 0),
  CONSTRAINT ad_spend_days_org_day_campaign_key UNIQUE (org_id, platform, spend_date, campaign_id)
);

COMMENT ON COLUMN public.ad_spend_days.modeled_conversions IS
  'Stored so it is never shown as a measured outcome. Platform-estimated only.';

CREATE TABLE public.processor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  processor text NOT NULL,
  kind public.revenue_kind NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  processor_ref text NOT NULL,
  lead_id uuid,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processor_events_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT processor_events_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE SET NULL,
  CONSTRAINT processor_events_ref_key UNIQUE (org_id, processor, processor_ref, kind)
);

COMMENT ON TABLE public.processor_events IS
  'Stripe/Commas truth: sales, refunds, chargebacks, failed payments. Unmatched rows stay visible.';

CREATE TABLE public.calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source text NOT NULL,
  kind text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  lead_id uuid,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_blocks_kind_check CHECK (kind IN ('availability', 'booked', 'no_show')),
  CONSTRAINT calendar_blocks_times CHECK (ends_at > starts_at),
  CONSTRAINT calendar_blocks_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE SET NULL,
  CONSTRAINT calendar_blocks_external_key UNIQUE (org_id, source, external_id)
);

COMMENT ON TABLE public.calendar_blocks IS
  'Availability and booking metadata only. No event title, description, or attendee details.';

CREATE TABLE public.form_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  session_id text NOT NULL,
  event_kind text NOT NULL,
  question_key text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_events_kind_check CHECK (event_kind IN ('started', 'answered', 'completed', 'abandoned')),
  CONSTRAINT form_events_session_kind_key UNIQUE (org_id, session_id, event_kind, question_key)
);

COMMENT ON TABLE public.form_events IS
  'Form/funnel drop-off before the CRM sees a lead. Question key is the last field that lost people.';

CREATE TABLE public.portal_schedules (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  cadence text NOT NULL DEFAULT 'monthly',
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  next_send_at timestamptz NOT NULL DEFAULT date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month',
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_schedules_cadence_check CHECK (cadence IN ('weekly', 'monthly'))
);

COMMENT ON TABLE public.portal_schedules IS
  'Owner portal email cadence. Default monthly. An owner who has to remember to log in will not.';

CREATE TRIGGER portal_schedules_set_updated_at
  BEFORE UPDATE ON public.portal_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.source_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_spend_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY source_connections_select
  ON public.source_connections FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY ad_spend_days_select
  ON public.ad_spend_days FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY processor_events_select
  ON public.processor_events FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY calendar_blocks_select
  ON public.calendar_blocks FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY form_events_select
  ON public.form_events FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY portal_schedules_select
  ON public.portal_schedules FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY portal_schedules_write
  ON public.portal_schedules FOR ALL TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

REVOKE ALL ON public.source_connections FROM PUBLIC, authenticated;
GRANT SELECT (
  id, org_id, kind, status, provider, account_label, last_verified_at, last_error,
  token_expires_at, public_token, metadata, created_at, updated_at
) ON public.source_connections TO authenticated;

GRANT SELECT ON public.ad_spend_days TO authenticated;
GRANT SELECT ON public.processor_events TO authenticated;
GRANT SELECT ON public.calendar_blocks TO authenticated;
GRANT SELECT ON public.form_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_schedules TO authenticated;

GRANT ALL ON public.source_connections TO service_role;
GRANT ALL ON public.ad_spend_days TO service_role;
GRANT ALL ON public.processor_events TO service_role;
GRANT ALL ON public.calendar_blocks TO service_role;
GRANT ALL ON public.form_events TO service_role;
GRANT ALL ON public.portal_schedules TO service_role;

-- ---------------------------------------------------------------------------
-- Portal RPCs. Same date range. Owner/admin only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_adoption(
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
  v_log_k bigint;
  v_log_n bigint;
  v_brief_k bigint;
  v_brief_n bigint;
  v_approved bigint;
  v_rejected bigint;
  v_members jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT count(*), count(*) FILTER (WHERE outcome IS NOT NULL)
  INTO v_log_n, v_log_k
  FROM public.calls
  WHERE org_id = p_org_id
    AND scheduled_at >= p_from AND scheduled_at < p_to;

  SELECT count(*), count(*) FILTER (WHERE brief_opened_before_call)
  INTO v_brief_n, v_brief_k
  FROM public.call_quality_measures
  WHERE org_id = p_org_id
    AND occurred_at >= p_from AND occurred_at < p_to;

  SELECT count(*) FILTER (WHERE status IN ('approved', 'sent')),
         count(*) FILTER (WHERE status = 'rejected')
  INTO v_approved, v_rejected
  FROM public.follow_up_drafts
  WHERE org_id = p_org_id AND created_at >= p_from AND created_at < p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member_id', m.id,
    'name', m.display_name,
    'role', m.role,
    'touches', x.touches,
    'outcomes', x.outcomes,
    'approvals', x.approvals,
    'briefs', x.briefs,
    'used', (x.touches + x.outcomes + x.approvals + x.briefs) > 0
  ) ORDER BY m.display_name), '[]'::jsonb)
  INTO v_members
  FROM public.org_members m
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.touches t
       WHERE t.actor_member_id = m.id AND t.occurred_at >= p_from AND t.occurred_at < p_to) AS touches,
      (SELECT count(*) FROM public.calls c
       WHERE c.ran_by_member_id = m.id AND c.outcome IS NOT NULL
         AND c.updated_at >= p_from AND c.updated_at < p_to) AS outcomes,
      (SELECT count(*) FROM public.follow_up_drafts d
       WHERE d.approved_by_member_id = m.id AND d.approved_at >= p_from AND d.approved_at < p_to) AS approvals,
      (SELECT count(*) FROM public.brief_views b
       WHERE b.member_id = m.id AND b.viewed_at >= p_from AND b.viewed_at < p_to) AS briefs
  ) x
  WHERE m.org_id = p_org_id AND m.active AND m.surface_access = 'operator';

  RETURN jsonb_build_object(
    'basis', 'calls.outcome, call_quality_measures.brief_opened_before_call, follow_up_drafts, touches, brief_views',
    'range_from', p_from,
    'range_to', p_to,
    'outcome_logging', public.reporting_rate(v_log_k, v_log_n, public.reporting_diag_min(), false),
    'briefs_opened_before_calls', public.reporting_rate(v_brief_k, v_brief_n, public.reporting_diag_min(), false),
    'drafts', jsonb_build_object('approved', COALESCE(v_approved, 0), 'rejected', COALESCE(v_rejected, 0)),
    'members', v_members
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_ads(
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
  v_connected boolean;
  v_rows jsonb;
  v_unattributed jsonb;
  v_spend bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT EXISTS (
    SELECT 1 FROM public.source_connections
    WHERE org_id = p_org_id AND kind IN ('meta_ads', 'google_ads') AND status = 'active'
  ) INTO v_connected;

  IF NOT v_connected THEN
    RETURN jsonb_build_object(
      'connected', false,
      'unlocks', 'Cost per lead, cost per booked call, and cost per client acquired, by campaign, against CRM counts.',
      'basis', 'not connected'
    );
  END IF;

  SELECT COALESCE(SUM(spend_cents), 0) INTO v_spend
  FROM public.ad_spend_days
  WHERE org_id = p_org_id
    AND spend_date >= p_from::date
    AND spend_date < p_to::date;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.platform, t.campaign_name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.platform,
      COALESCE(s.campaign_id, '') AS campaign_id,
      COALESCE(NULLIF(s.campaign_name, ''), '(unnamed campaign)') AS campaign_name,
      SUM(s.spend_cents)::bigint AS spend_cents,
      SUM(COALESCE(s.platform_leads, 0))::bigint AS platform_leads,
      SUM(COALESCE(s.platform_purchases, 0))::bigint AS platform_purchases,
      (
        SELECT count(*) FROM public.leads l
        WHERE l.org_id = p_org_id AND NOT l.is_test
          AND l.opted_in_at >= p_from AND l.opted_in_at < p_to
          AND s.campaign_id IS NOT NULL
          AND l.campaign = s.campaign_id
      )::bigint AS crm_leads,
      (
        SELECT count(*) FROM public.leads l
        JOIN public.calls c ON c.lead_id = l.id AND c.org_id = l.org_id
        WHERE l.org_id = p_org_id AND NOT l.is_test
          AND l.opted_in_at >= p_from AND l.opted_in_at < p_to
          AND c.scheduled_at IS NOT NULL
          AND l.campaign IS NOT NULL AND l.campaign = s.campaign_id
      )::bigint AS crm_booked,
      (
        SELECT count(*) FROM public.leads l
        WHERE l.org_id = p_org_id AND NOT l.is_test AND l.has_net_close
          AND l.opted_in_at >= p_from AND l.opted_in_at < p_to
          AND l.campaign IS NOT NULL AND l.campaign = s.campaign_id
      )::bigint AS crm_clients
    FROM public.ad_spend_days s
    WHERE s.org_id = p_org_id
      AND s.spend_date >= p_from::date
      AND s.spend_date < p_to::date
    GROUP BY s.platform, s.campaign_id, s.campaign_name
  ) t;

  SELECT jsonb_build_object(
    'crm_leads', count(*),
    'crm_clients', count(*) FILTER (WHERE has_net_close)
  )
  INTO v_unattributed
  FROM public.leads l
  WHERE l.org_id = p_org_id AND NOT l.is_test
    AND l.opted_in_at >= p_from AND l.opted_in_at < p_to
    AND (l.campaign IS NULL OR l.campaign = '');

  RETURN jsonb_build_object(
    'connected', true,
    'basis', 'Ad platform spend by campaign date. CRM leads/booked/clients by leads.campaign. Unattributed CRM leads are not distributed. Platform conversions are platform-reported, not measured closes. Modeled conversions are not shown as outcomes.',
    'attribution_basis', 'CRM campaign field on the lead. Spend is the ad platform''s reported amount for that campaign and day. Cost per client uses net processor-recognized closes, not platform purchase counts.',
    'spend_cents', v_spend,
    'campaigns', COALESCE(v_rows, '[]'::jsonb),
    'unattributed', v_unattributed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_processor(
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
  v_connected boolean;
  v_sales bigint;
  v_refunds bigint;
  v_chargebacks bigint;
  v_failed bigint;
  v_unmatched bigint;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT EXISTS (
    SELECT 1 FROM public.source_connections
    WHERE org_id = p_org_id AND kind IN ('stripe', 'commas') AND status = 'active'
  ) INTO v_connected;

  IF NOT v_connected THEN
    RETURN jsonb_build_object(
      'connected', false,
      'unlocks', 'Revenue truth: refunds, chargebacks, and failed payments. A refunded deal is removed from closed-won.',
      'basis', 'not connected'
    );
  END IF;

  SELECT
    count(*) FILTER (WHERE kind = 'sale'),
    count(*) FILTER (WHERE kind = 'refund'),
    count(*) FILTER (WHERE kind = 'chargeback'),
    count(*) FILTER (WHERE kind = 'failed'),
    count(*) FILTER (WHERE lead_id IS NULL)
  INTO v_sales, v_refunds, v_chargebacks, v_failed, v_unmatched
  FROM public.processor_events
  WHERE org_id = p_org_id
    AND occurred_at >= p_from AND occurred_at < p_to;

  RETURN jsonb_build_object(
    'connected', true,
    'basis', 'processor_events from Stripe or Commas. Closed-won is net of refunds and chargebacks.',
    'sales', COALESCE(v_sales, 0),
    'refunds', COALESCE(v_refunds, 0),
    'chargebacks', COALESCE(v_chargebacks, 0),
    'failed', COALESCE(v_failed, 0),
    'unmatched', COALESCE(v_unmatched, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_calendar(
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
  v_connected boolean;
  v_via_crm boolean;
  v_available numeric;
  v_booked numeric;
  v_noshow numeric;
  v_missing_hours integer;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT EXISTS (
    SELECT 1 FROM public.source_connections
    WHERE org_id = p_org_id AND kind = 'calendar' AND status = 'active'
  ) INTO v_connected;

  SELECT EXISTS (
    SELECT 1 FROM public.ghl_connections
    WHERE org_id = p_org_id AND status = 'active'
  ) INTO v_via_crm;

  IF NOT v_connected AND NOT v_via_crm THEN
    RETURN jsonb_build_object(
      'connected', false,
      'unlocks', 'Booked versus available closer hours, and what no-shows cost in idle time.',
      'basis', 'not connected'
    );
  END IF;

  SELECT count(*) INTO v_missing_hours
  FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.active AND m.role = 'closer'
    AND m.surface_access = 'operator'
    AND (m.working_hours_start IS NULL OR m.working_hours_end IS NULL);

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60.0), 0)
  INTO v_available
  FROM public.calendar_blocks
  WHERE org_id = p_org_id AND kind = 'availability'
    AND starts_at >= p_from AND starts_at < p_to;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60.0), 0)
  INTO v_booked
  FROM public.calendar_blocks
  WHERE org_id = p_org_id AND kind = 'booked'
    AND starts_at >= p_from AND starts_at < p_to;

  IF v_booked = 0 THEN
    SELECT COALESCE(SUM(COALESCE(duration_seconds, 30 * 60)) / 60.0, 0)
    INTO v_booked
    FROM public.calls
    WHERE org_id = p_org_id
      AND scheduled_at >= p_from AND scheduled_at < p_to
      AND outcome IS DISTINCT FROM 'cancelled';
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60.0), 0)
  INTO v_noshow
  FROM public.calendar_blocks
  WHERE org_id = p_org_id AND kind = 'no_show'
    AND starts_at >= p_from AND starts_at < p_to;

  IF v_noshow = 0 THEN
    SELECT COALESCE(SUM(COALESCE(duration_seconds, 30 * 60)) / 60.0, 0)
    INTO v_noshow
    FROM public.calls
    WHERE org_id = p_org_id
      AND scheduled_at >= p_from AND scheduled_at < p_to
      AND outcome = 'no_show';
  END IF;

  RETURN jsonb_build_object(
    'connected', true,
    'via_crm', v_via_crm AND NOT v_connected,
    'availability_measured', v_connected AND COALESCE(v_available, 0) > 0,
    'basis', CASE
      WHEN v_connected THEN 'calendar_blocks metadata (start, end, kind). Event content and attendees are not stored.'
      ELSE 'CRM appointments on calls. Available hours require the calendar source. Event content is not read.'
    END,
    'available_minutes', CASE
      WHEN v_connected AND COALESCE(v_available, 0) > 0 THEN trunc(v_available * 10) / 10
      ELSE NULL
    END,
    'booked_minutes', trunc(COALESCE(v_booked, 0) * 10) / 10,
    'no_show_minutes', trunc(COALESCE(v_noshow, 0) * 10) / 10,
    'idle_minutes', CASE
      WHEN v_connected AND COALESCE(v_available, 0) > 0
        THEN ceil(GREATEST(v_available - COALESCE(v_booked, 0), 0) * 10) / 10
      ELSE NULL
    END,
    'closers_missing_hours', COALESCE(v_missing_hours, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_forms(
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
  v_connected boolean;
  v_started bigint;
  v_completed bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT EXISTS (
    SELECT 1 FROM public.source_connections
    WHERE org_id = p_org_id AND kind = 'form_platform' AND status = 'active'
  ) INTO v_connected;

  IF NOT v_connected THEN
    RETURN jsonb_build_object(
      'connected', false,
      'unlocks', 'Drop-off before the CRM sees a lead, and which question loses people.',
      'basis', 'not connected'
    );
  END IF;

  SELECT
    count(DISTINCT session_id) FILTER (WHERE event_kind = 'started'),
    count(DISTINCT session_id) FILTER (WHERE event_kind = 'completed')
  INTO v_started, v_completed
  FROM public.form_events
  WHERE org_id = p_org_id
    AND occurred_at >= p_from AND occurred_at < p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_key', question_key,
    'abandoned', n
  ) ORDER BY n DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT COALESCE(question_key, '(unspecified)') AS question_key, count(*)::bigint AS n
    FROM public.form_events
    WHERE org_id = p_org_id
      AND event_kind = 'abandoned'
      AND occurred_at >= p_from AND occurred_at < p_to
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'connected', true,
    'basis', 'form_events posted by the connected form platform. Started versus completed sessions in this range.',
    'started', COALESCE(v_started, 0),
    'completed', COALESCE(v_completed, 0),
    'abandoned_by_question', COALESCE(v_rows, '[]'::jsonb),
    'too_small', COALESCE(v_started, 0) < public.reporting_diag_min()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_recorder(
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
  v_connected boolean;
  v_made bigint;
  v_logged bigint;
  v_attempted bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.reporting_require_access(p_org_id);

  SELECT EXISTS (
    SELECT 1 FROM public.transcript_connections
    WHERE org_id = p_org_id AND (last_pull_at IS NOT NULL OR public_token IS NOT NULL)
  ) INTO v_connected;

  IF NOT v_connected THEN
    SELECT EXISTS (
      SELECT 1 FROM public.calls
      WHERE org_id = p_org_id
        AND (duration_seconds IS NOT NULL OR transcript_arrived_at IS NOT NULL)
        AND COALESCE(scheduled_at, occurred_at, created_at) >= p_from
        AND COALESCE(scheduled_at, occurred_at, created_at) < p_to
    ) INTO v_connected;
  END IF;

  IF NOT v_connected THEN
    RETURN jsonb_build_object(
      'connected', false,
      'unlocks', 'Call volume, duration, and connect rate, so coverage is not understated when outcome logging is thin.',
      'basis', 'not connected'
    );
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE duration_seconds IS NOT NULL OR transcript_arrived_at IS NOT NULL OR outcome = 'held'
    ),
    count(*) FILTER (WHERE outcome IS NOT NULL)
  INTO v_attempted, v_made, v_logged
  FROM public.calls
  WHERE org_id = p_org_id
    AND COALESCE(scheduled_at, occurred_at, created_at) >= p_from
    AND COALESCE(scheduled_at, occurred_at, created_at) < p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', m.display_name,
    'role', m.role,
    'made', x.made,
    'logged', x.logged,
    'attempted', x.attempted,
    'connect_rate', public.reporting_rate(x.made, x.attempted, public.reporting_diag_min(), false),
    'median_duration_seconds', x.median_duration
  ) ORDER BY m.display_name), '[]'::jsonb)
  INTO v_rows
  FROM public.org_members m
  CROSS JOIN LATERAL (
    SELECT
      count(*)::bigint AS attempted,
      count(*) FILTER (
        WHERE c.duration_seconds IS NOT NULL OR c.transcript_arrived_at IS NOT NULL OR c.outcome = 'held'
      )::bigint AS made,
      count(*) FILTER (WHERE c.outcome IS NOT NULL)::bigint AS logged,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.duration_seconds)
        FILTER (WHERE c.duration_seconds IS NOT NULL) AS median_duration
    FROM public.calls c
    WHERE c.org_id = p_org_id
      AND c.ran_by_member_id = m.id
      AND COALESCE(c.scheduled_at, c.occurred_at, c.created_at) >= p_from
      AND COALESCE(c.scheduled_at, c.occurred_at, c.created_at) < p_to
  ) x
  WHERE m.org_id = p_org_id AND m.active AND m.surface_access = 'operator'
    AND m.role IN ('closer', 'setter', 'admin', 'owner');

  RETURN jsonb_build_object(
    'connected', true,
    'basis', 'calls.duration_seconds, transcript_arrived_at, and calls.outcome. Connect rate is connected calls over calls in the range. This is coverage truth, not a ranking.',
    'calls_made', COALESCE(v_made, 0),
    'calls_attempted', COALESCE(v_attempted, 0),
    'outcomes_logged', COALESCE(v_logged, 0),
    'gap', GREATEST(COALESCE(v_made, 0) - COALESCE(v_logged, 0), 0),
    'connect_rate', public.reporting_rate(COALESCE(v_made, 0), COALESCE(v_attempted, 0), public.reporting_diag_min(), false),
    'members', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_lead_is_closed(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_adoption(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_ads(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_processor(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_calendar(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_forms(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_recorder(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reporting_lead_is_closed(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_adoption(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_ads(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_processor(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_calendar(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_forms(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_recorder(uuid, timestamptz, timestamptz) TO authenticated, service_role;

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES
  ('portal-email', '0 * * * *', 3600, 600, 'Open portal_schedules.next_send_at and /api/cron/portal-email. Confirm RESEND_API_KEY.'),
  ('source-sync', '15 * * * *', 3600, 900, 'Open source_connections.last_verified_at and /api/cron/source-sync.')
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
SELECT job_name, now(), now() FROM public.ops_job_catalog
WHERE job_name IN ('portal-email', 'source-sync')
ON CONFLICT (job_name) DO NOTHING;
