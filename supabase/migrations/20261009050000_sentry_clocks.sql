-- Sentry: one stored response clock per lead, one open alert, and a
-- per-workspace practice or live switch. Sentry never writes to a CRM.

CREATE TABLE IF NOT EXISTS public.sentry_workspaces (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'practice', 'live')),
  watch_from timestamptz,
  activated_by uuid,
  activated_at timestamptz,
  pause_reason text,
  last_sweep_at timestamptz,
  scan_after uuid,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sentry_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('first_touch', 'follow_up')),
  state text NOT NULL CHECK (state IN ('on_time', 'at_risk', 'missed', 'paused', 'not_applicable', 'resolved')),
  started_at timestamptz NOT NULL,
  deadline_at timestamptz,
  resolved_at timestamptz,
  window_minutes integer,
  elapsed_minutes integer,
  overdue_minutes integer,
  reason text,
  config_version text,
  manual boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, lead_id)
);

CREATE INDEX IF NOT EXISTS sentry_clocks_state_idx ON public.sentry_clocks (org_id, state);

CREATE TABLE IF NOT EXISTS public.sentry_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  clock_id uuid REFERENCES public.sentry_clocks (id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('nudge', 'escalation')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'snoozed', 'withdrawn', 'resolved')),
  title text NOT NULL,
  body text NOT NULL,
  snoozed_until timestamptz,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  withdraw_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sentry_alerts_one_open
  ON public.sentry_alerts (lead_id)
  WHERE status IN ('open', 'acknowledged', 'snoozed');

CREATE TABLE IF NOT EXISTS public.sentry_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  clock_id uuid,
  metric text NOT NULL,
  seconds integer,
  met boolean,
  detail text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sentry_measurements_org_idx ON public.sentry_measurements (org_id, metric, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.sentry_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'relay_unavailable' CHECK (status IN ('relay_unavailable', 'requested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, lead_id)
);

ALTER TABLE public.sentry_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentry_clocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentry_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentry_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentry_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sentry_workspaces_select ON public.sentry_workspaces;
CREATE POLICY sentry_workspaces_select ON public.sentry_workspaces FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS sentry_clocks_select ON public.sentry_clocks;
CREATE POLICY sentry_clocks_select ON public.sentry_clocks FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS ws_operator_lead_scope ON public.sentry_clocks;
CREATE POLICY ws_operator_lead_scope ON public.sentry_clocks AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT (org_id IN (SELECT public.user_operator_org_ids()))) OR (lead_id IN (SELECT public.operator_visible_lead_ids())));

DROP POLICY IF EXISTS sentry_alerts_select ON public.sentry_alerts;
CREATE POLICY sentry_alerts_select ON public.sentry_alerts FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS ws_operator_lead_scope ON public.sentry_alerts;
CREATE POLICY ws_operator_lead_scope ON public.sentry_alerts AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT (org_id IN (SELECT public.user_operator_org_ids()))) OR (lead_id IN (SELECT public.operator_visible_lead_ids())));
DROP POLICY IF EXISTS sentry_alerts_update ON public.sentry_alerts;
CREATE POLICY sentry_alerts_update ON public.sentry_alerts FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) AND lead_id IN (SELECT id FROM public.leads WHERE org_id = sentry_alerts.org_id))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS sentry_measurements_select ON public.sentry_measurements;
CREATE POLICY sentry_measurements_select ON public.sentry_measurements FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (
      public.is_platform_admin()
      OR org_id IN (SELECT public.user_staff_org_ids())
      OR public.user_has_org_role(org_id, VARIADIC ARRAY['owner'::org_role])
      OR lead_id IN (SELECT id FROM public.leads l WHERE l.org_id = sentry_measurements.org_id AND (l.assigned_setter_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid()) OR l.assigned_closer_id IN (SELECT id FROM public.org_members WHERE user_id = auth.uid())))
    )
  );

DROP POLICY IF EXISTS sentry_handoffs_select ON public.sentry_handoffs;
CREATE POLICY sentry_handoffs_select ON public.sentry_handoffs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT ON public.sentry_workspaces, public.sentry_clocks, public.sentry_measurements, public.sentry_handoffs TO authenticated;
GRANT SELECT, UPDATE ON public.sentry_alerts TO authenticated;
GRANT ALL ON public.sentry_workspaces, public.sentry_clocks, public.sentry_alerts, public.sentry_measurements, public.sentry_handoffs TO service_role;

CREATE OR REPLACE FUNCTION public.set_sentry_mode(p_org_id uuid, p_mode text, p_watch_from timestamptz, p_preview boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_mode NOT IN ('off', 'practice', 'live') THEN
    RAISE EXCEPTION 'Unknown mode.' USING ERRCODE = '22023';
  END IF;
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin() OR p_org_id IN (SELECT public.user_staff_org_ids()) OR public.user_has_org_role(p_org_id, VARIADIC ARRAY['owner'::org_role])) THEN
    RAISE EXCEPTION 'Only an owner or the Vistrial team can change Sentry.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.leads l
  WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
    AND l.created_at >= COALESCE(p_watch_from, now())
    AND l.first_human_touch_at IS NULL
    AND l.do_not_contact IS FALSE
    AND l.status NOT IN ('closed_won', 'closed_lost');
  IF p_preview THEN
    RETURN jsonb_build_object('wouldAlert', v_count);
  END IF;
  INSERT INTO public.sentry_workspaces (org_id, mode, watch_from, activated_by, activated_at, updated_at)
  VALUES (p_org_id, p_mode, COALESCE(p_watch_from, now()), auth.uid(), now(), now())
  ON CONFLICT (org_id) DO UPDATE
  SET mode = EXCLUDED.mode, watch_from = EXCLUDED.watch_from, activated_by = EXCLUDED.activated_by, activated_at = EXCLUDED.activated_at, pause_reason = NULL, updated_at = now();
  PERFORM public.ws_log(p_org_id, 'sentry.mode', 'sentry_workspaces', p_org_id::text, jsonb_build_object('mode', p_mode, 'watch_from', p_watch_from), auth.uid());
  RETURN jsonb_build_object('wouldAlert', v_count, 'mode', p_mode);
END;
$$;

REVOKE ALL ON FUNCTION public.set_sentry_mode(uuid, text, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sentry_mode(uuid, text, timestamptz, boolean) TO authenticated, service_role;
