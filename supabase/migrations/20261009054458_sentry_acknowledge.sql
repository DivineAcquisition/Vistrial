-- Alerts change only through Sentry or this function. A viewer cannot answer
-- an alert, and nobody can rewrite its level or wording from the browser.

DROP POLICY IF EXISTS sentry_alerts_update ON public.sentry_alerts;
REVOKE UPDATE ON public.sentry_alerts FROM authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_sentry_alert(p_alert_id uuid, p_snooze_minutes integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert public.sentry_alerts%ROWTYPE;
  v_minutes integer := LEAST(GREATEST(COALESCE(p_snooze_minutes, 0), 0), 240);
BEGIN
  SELECT * INTO v_alert FROM public.sentry_alerts WHERE id = p_alert_id;
  IF v_alert.id IS NULL OR v_alert.org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR v_alert.org_id IN (SELECT public.user_staff_org_ids())
    OR v_alert.org_id IN (SELECT public.user_worker_org_ids())
  ) THEN
    RAISE EXCEPTION 'You can look, but you cannot answer alerts.' USING ERRCODE = '42501';
  END IF;
  IF v_alert.org_id IN (SELECT public.user_operator_org_ids())
    AND v_alert.lead_id NOT IN (SELECT public.operator_visible_lead_ids()) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_alert.status NOT IN ('open', 'acknowledged', 'snoozed') THEN
    RETURN;
  END IF;
  UPDATE public.sentry_alerts
  SET status = CASE WHEN v_minutes > 0 THEN 'snoozed' ELSE 'acknowledged' END,
      snoozed_until = CASE WHEN v_minutes > 0 THEN now() + make_interval(mins => v_minutes) ELSE NULL END,
      acknowledged_by = auth.uid(),
      acknowledged_at = now()
  WHERE id = p_alert_id;
  PERFORM public.ws_log(v_alert.org_id, CASE WHEN v_minutes > 0 THEN 'sentry.snooze' ELSE 'sentry.acknowledge' END, 'sentry_alerts', p_alert_id::text, jsonb_build_object('minutes', v_minutes), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_sentry_alert(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_sentry_alert(uuid, integer) TO authenticated, service_role;
