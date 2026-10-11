-- Follow-ups to the Service Team workspace.

-- A request waiting out its deletion window, or in review, is still open.
-- Owners ask here; staff record an Owner's ask with data_request_staff_create.
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
  IF p_org_id NOT IN (SELECT public.user_owner_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Unknown request.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_existing FROM public.data_requests
  WHERE org_id = p_org_id AND kind = p_kind AND status IN ('received', 'in_review', 'approved', 'in_progress');
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

-- Escalation sweep, health snapshots, connection alerts, and data request runs.
INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'staff-workspace',
  '*/5 * * * *',
  300,
  900,
  'Open /api/cron/staff-workspace logs, staff_escalations raised in the last hour, and data_requests stuck in approved or in_progress. Confirm CRON_SECRET and that Vercel Cron still lists this path.'
)
ON CONFLICT (job_name) DO UPDATE
  SET cron_expr = EXCLUDED.cron_expr,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      check_first = EXCLUDED.check_first;

INSERT INTO public.ops_job_runs (job_name, last_success_at, updated_at)
SELECT job_name, now(), now() FROM public.ops_job_catalog WHERE job_name = 'staff-workspace'
ON CONFLICT (job_name) DO NOTHING;
