-- Owners keep the right to change their gate. Staff who work the workspace
-- can change it too. Platform Admin, and Service Team with configuration
-- access, can lock a level so the Owner cannot move it.

ALTER TABLE public.approval_gate_actions
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_reason text;

ALTER TABLE public.approval_gate_changes DROP CONSTRAINT IF EXISTS approval_gate_changes_field;
ALTER TABLE public.approval_gate_changes ADD CONSTRAINT approval_gate_changes_field CHECK (field IN (
  'mode', 'approver', 'quiet_hours_start', 'quiet_hours_end',
  'daily_send_limit_per_lead', 'queue_wait_limit_minutes', 'reviewed', 'locked'
));

CREATE OR REPLACE FUNCTION public.approval_gate_is_staff(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.workspace_assignments
      WHERE org_id = p_org_id AND user_id = auth.uid() AND ended_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.approval_gate_can_lock()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_staff
      WHERE user_id = auth.uid() AND active AND template_access
    );
$$;

CREATE OR REPLACE FUNCTION public.set_approval_gate_action(
  p_org_id uuid,
  p_action_type text,
  p_mode text,
  p_approver text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.approval_action_types%ROWTYPE;
  v_old_mode text;
  v_old_approver text;
  v_locked boolean;
  v_reason text;
  v_actor record;
  v_staff boolean;
BEGIN
  v_staff := public.approval_gate_is_staff(p_org_id);
  IF auth.uid() IS NULL OR NOT (public.user_has_org_role(p_org_id, 'owner') OR v_staff) THEN
    RAISE EXCEPTION 'You cannot change approval settings.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type FROM public.approval_action_types WHERE action_type = p_action_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown action type %.', p_action_type USING ERRCODE = '22023';
  END IF;
  IF p_mode NOT IN ('ask_first', 'auto_run', 'off') THEN
    RAISE EXCEPTION 'Unknown mode %.', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_approver NOT IN ('owner_only', 'owners_and_managers', 'assigned') THEN
    RAISE EXCEPTION 'Unknown approver %.', p_approver USING ERRCODE = '22023';
  END IF;

  SELECT mode, approver, locked, lock_reason INTO v_old_mode, v_old_approver, v_locked, v_reason
  FROM public.approval_gate_actions
  WHERE org_id = p_org_id AND action_type = p_action_type
  FOR UPDATE;
  v_old_mode := COALESCE(v_old_mode, v_type.default_mode);
  v_old_approver := COALESCE(v_old_approver, 'owners_and_managers');
  v_locked := COALESCE(v_locked, false);

  IF v_locked AND NOT v_staff THEN
    RAISE EXCEPTION 'Locked by your Vistrial team: %', COALESCE(NULLIF(btrim(v_reason), ''), 'this level is locked')
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.approval_gate_actions (org_id, action_type, mode, approver)
  VALUES (p_org_id, p_action_type, p_mode, p_approver)
  ON CONFLICT (org_id, action_type)
  DO UPDATE SET mode = EXCLUDED.mode, approver = EXCLUDED.approver;

  SELECT * INTO v_actor FROM public.approval_gate_actor(p_org_id);

  IF v_old_mode IS DISTINCT FROM p_mode THEN
    INSERT INTO public.approval_gate_changes
      (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
    VALUES
      (p_org_id, v_actor.member_id, auth.uid(), v_actor.label, p_action_type, 'mode', v_old_mode, p_mode);
  END IF;
  IF v_old_approver IS DISTINCT FROM p_approver THEN
    INSERT INTO public.approval_gate_changes
      (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
    VALUES
      (p_org_id, v_actor.member_id, auth.uid(), v_actor.label, p_action_type, 'approver', v_old_approver, p_approver);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_approval_gate_lock(
  p_org_id uuid,
  p_action_type text,
  p_locked boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old boolean;
  v_actor record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.approval_gate_can_lock() OR NOT public.approval_gate_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'You cannot lock an approval setting.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_action_types WHERE action_type = p_action_type) THEN
    RAISE EXCEPTION 'Unknown action type %.', p_action_type USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.approval_gate_actions (org_id, action_type, mode, approver)
  SELECT p_org_id, p_action_type, default_mode, 'owners_and_managers'
  FROM public.approval_action_types
  WHERE action_type = p_action_type
  ON CONFLICT (org_id, action_type) DO NOTHING;

  SELECT locked INTO v_old FROM public.approval_gate_actions
  WHERE org_id = p_org_id AND action_type = p_action_type
  FOR UPDATE;

  UPDATE public.approval_gate_actions
  SET locked = p_locked,
      lock_reason = CASE WHEN p_locked THEN NULLIF(btrim(p_reason), '') ELSE NULL END
  WHERE org_id = p_org_id AND action_type = p_action_type;

  IF v_old IS DISTINCT FROM p_locked THEN
    SELECT * INTO v_actor FROM public.approval_gate_actor(p_org_id);
    INSERT INTO public.approval_gate_changes
      (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
    VALUES
      (p_org_id, v_actor.member_id, auth.uid(), v_actor.label, p_action_type, 'locked',
       CASE WHEN v_old THEN 'locked' ELSE 'unlocked' END,
       CASE WHEN p_locked THEN 'locked' ELSE 'unlocked' END);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approval_gate_is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_gate_can_lock() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_approval_gate_lock(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_approval_gate_lock(uuid, text, boolean, text) TO authenticated;
