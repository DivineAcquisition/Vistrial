-- Staff approvals: off unless the Owner turned them on, and labeled as staff
-- wherever the customer sees who acted.

/** The name a customer sees for a seat: staff read "Jordan M., Vistrial Service Team". */
CREATE OR REPLACE FUNCTION public.member_public_name(p_member_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN m.seat::text = 'staff' THEN
      public.staff_short_name(COALESCE(NULLIF(btrim(s.display_name), ''), NULLIF(btrim(m.display_name), ''), 'Vistrial')) || ', ' ||
      CASE WHEN s.role::text = 'platform_admin' THEN 'Vistrial Platform Admin' ELSE 'Vistrial Service Team' END
    ELSE COALESCE(NULLIF(btrim(m.display_name), ''), m.email)
  END
  FROM public.org_members m
  LEFT JOIN public.platform_staff s ON s.user_id = m.user_id
  WHERE m.id = p_member_id;
$$;
REVOKE ALL ON FUNCTION public.member_public_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_public_name(uuid) TO authenticated, service_role;

-- Drafts and approvals: staff approve only where the Owner allowed it.
CREATE OR REPLACE FUNCTION public.ws_can_approve(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.ws_is_staff(p_org_id) AND public.staff_may_approve(p_org_id))
    OR COALESCE(p_org_id IN (SELECT public.user_approver_org_ids()), false);
$$;

CREATE OR REPLACE FUNCTION public.set_agent_paused(p_org_id uuid, p_agent_id text, p_paused boolean, p_reason text DEFAULT NULL::text)
RETURNS public.agent_presence_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  v_member uuid := public.user_member_id(p_org_id);
  v_name text;
  v_row public.agent_presence_controls;
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only an owner or the Vistrial team can pause or resume agents.' USING ERRCODE = '42501';
  END IF;
  IF p_agent_id NOT IN ('sentry', 'scribe', 'relay', 'compass') THEN
    RAISE EXCEPTION 'Unknown agent.';
  END IF;
  IF v_access IN ('service_team', 'platform_admin') AND p_paused AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say why you are pausing it. The Owner sees this.' USING ERRCODE = '22023';
  END IF;
  v_name := public.member_public_name(v_member);

  INSERT INTO public.agent_presence_controls (org_id, agent_id, paused, changed_at, changed_by_member_id, changed_by_name, reason)
  VALUES (p_org_id, p_agent_id, p_paused, now(), v_member, v_name, left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300))
  ON CONFLICT (org_id, agent_id) DO UPDATE
    SET paused = EXCLUDED.paused,
        changed_at = EXCLUDED.changed_at,
        changed_by_member_id = EXCLUDED.changed_by_member_id,
        changed_by_name = EXCLUDED.changed_by_name,
        reason = EXCLUDED.reason
  RETURNING * INTO v_row;

  IF p_paused THEN
    UPDATE public.agent_activity_runs
      SET status = 'paused', last_progress_at = now()
      WHERE org_id = p_org_id AND agent_id = p_agent_id AND status IN ('queued', 'working', 'waiting_provider');
  ELSE
    UPDATE public.agent_activity_runs
      SET status = 'queued', last_progress_at = now()
      WHERE org_id = p_org_id AND agent_id = p_agent_id AND status = 'paused';
  END IF;

  PERFORM public.ws_log(
    p_org_id,
    CASE WHEN p_paused THEN 'agent.paused' ELSE 'agent.resumed' END,
    'agent_presence_controls',
    p_agent_id,
    jsonb_build_object('agent', p_agent_id, 'reason', v_row.reason),
    auth.uid()
  );
  RETURN v_row;
END;
$$;

-- "Already approved by ..." names staff as staff.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.gate_decide(uuid, text, text, text, text, text, integer)'::regprocedure);
  v_old text := 'SELECT display_name INTO v_decider FROM public.org_members WHERE id = v_item.decided_by_member_id;';
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    IF position('member_public_name(v_item.decided_by_member_id)' IN v_def) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'gate_decide changed; update this migration.';
  END IF;
  EXECUTE replace(v_def, v_old, 'v_decider := public.member_public_name(v_item.decided_by_member_id);');
END $$;
