-- Sequence halt must also cancel outbound that is already queued.
-- halt_follow_up_sequences_for_lead discarded drafts and killed pending
-- jobs, but ghl_dispatches with status = queued could still send.
-- touch_insert_failed rows are left alone: GHL already accepted the
-- message, so recovering the touch is still the truthful path.

CREATE OR REPLACE FUNCTION public.halt_follow_up_sequences_for_lead(
  p_org_id uuid,
  p_lead_id uuid,
  p_reason public.follow_up_halt_reason,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
    AND p_org_id NOT IN (SELECT public.user_org_ids())
    AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  UPDATE public.follow_up_sequence_runs
  SET
    status = 'halted',
    halt_reason = p_reason,
    halted_at = now(),
    halted_by_member_id = p_actor
  WHERE org_id = p_org_id
    AND lead_id = p_lead_id
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.follow_up_jobs
  SET status = 'dead', last_error = 'sequence_halted:' || p_reason::text
  WHERE org_id = p_org_id
    AND lead_id = p_lead_id
    AND status = 'pending';

  IF p_reason IN ('inbound_reply', 'suppressed', 'org_stop') THEN
    UPDATE public.follow_up_drafts
    SET
      status = 'discarded',
      discarded_reason = p_reason::text
    WHERE org_id = p_org_id
      AND lead_id = p_lead_id
      AND status IN ('pending', 'approved', 'expired');
  END IF;

  UPDATE public.ghl_dispatches
  SET
    status = 'failed',
    failure_reason = 'sequence_halted:' || p_reason::text,
    body_text = NULL,
    claimed_at = NULL
  WHERE org_id = p_org_id
    AND lead_id = p_lead_id
    AND status = 'queued';

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.halt_org_follow_up_sequences(
  p_org_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT (
      public.user_has_org_role(p_org_id, 'owner', 'admin')
      OR public.is_platform_admin()
    ) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  UPDATE public.follow_up_settings
  SET
    sequences_halted = true,
    sequences_halted_at = now(),
    sequences_halted_by = p_actor
  WHERE org_id = p_org_id;

  UPDATE public.follow_up_sequence_runs
  SET
    status = 'halted',
    halt_reason = 'org_stop',
    halted_at = now(),
    halted_by_member_id = p_actor
  WHERE org_id = p_org_id
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.follow_up_jobs j
  SET status = 'dead', last_error = 'sequence_halted:org_stop'
  WHERE j.org_id = p_org_id
    AND j.status = 'pending'
    AND j.sequence_position > 1;

  UPDATE public.follow_up_drafts
  SET
    status = 'discarded',
    discarded_reason = 'org_stop'
  WHERE org_id = p_org_id
    AND status IN ('pending', 'approved', 'expired');

  UPDATE public.ghl_dispatches
  SET
    status = 'failed',
    failure_reason = 'sequence_halted:org_stop',
    body_text = NULL,
    claimed_at = NULL
  WHERE org_id = p_org_id
    AND status = 'queued';

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.halt_follow_up_sequences_for_lead(uuid, uuid, public.follow_up_halt_reason, uuid) IS
  'Halts active sequences for one lead, kills pending jobs, discards drafts on reply/suppress/org-stop, and fails queued GHL dispatches so they cannot still send.';

COMMENT ON FUNCTION public.halt_org_follow_up_sequences(uuid, uuid) IS
  'Org-wide sequence stop. Queued dispatches fail immediately; later steps are not scheduled.';
