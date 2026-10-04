-- A pending execution can be revised before it is approved.
-- The destination, type, and who asked do not change. Once approved, the plan is fixed.

CREATE OR REPLACE FUNCTION public.sales_os_executions_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.user_member_id(NEW.org_id);
  v_configured text;
  v_prior_ok boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Executions run as a signed-in member, never a service role.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_org_role(NEW.org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can run or decide an execution.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_by_member_id IS DISTINCT FROM v_actor OR NEW.requested_by_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'An execution is requested by the person signed in.' USING ERRCODE = '42501';
    END IF;

    SELECT g.mode INTO v_configured
    FROM public.sales_os_gates g
    WHERE g.org_id = NEW.org_id AND g.execution_type = NEW.execution_type;
    v_configured := COALESCE(v_configured, 'always_ask');

    IF NEW.gate_mode IS DISTINCT FROM v_configured THEN
      RAISE EXCEPTION 'The gate recorded on this execution does not match the workspace setting.' USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'awaiting_approval' THEN
      IF NEW.gate_satisfied_by IS NOT NULL OR NEW.approved_by_member_id IS NOT NULL THEN
        RAISE EXCEPTION 'A pending execution cannot arrive approved.' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.status <> 'approved' OR NEW.gate_satisfied_by IS DISTINCT FROM 'prior_configuration' THEN
      RAISE EXCEPTION 'An execution starts pending, or approved by prior configuration.' USING ERRCODE = '42501';
    END IF;

    IF v_configured = 'always_ask' THEN
      RAISE EXCEPTION 'This kind of execution asks every time.' USING ERRCODE = '42501';
    END IF;

    IF v_configured = 'ask_first_time' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.sales_os_executions e
        WHERE e.org_id = NEW.org_id
          AND e.execution_type = NEW.execution_type
          AND e.destination_id = NEW.destination_id
          AND e.gate_satisfied_by = 'in_conversation_approval'
          AND e.status = 'succeeded'
      ) INTO v_prior_ok;
      IF NOT v_prior_ok THEN
        RAISE EXCEPTION 'The first one of these to this destination needs a person to approve it.' USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE: identity never moves. While it is still waiting, the person
  -- approving may revise the text that will be sent. After that, the plan is fixed.
  IF NOT (OLD.status = 'awaiting_approval' AND NEW.status = 'awaiting_approval') THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
      OR NEW.plain_summary IS DISTINCT FROM OLD.plain_summary
      OR NEW.preview IS DISTINCT FROM OLD.preview
      OR NEW.input_hash IS DISTINCT FROM OLD.input_hash THEN
      RAISE EXCEPTION 'What an execution does cannot change after it is requested.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.tool_call_id IS DISTINCT FROM OLD.tool_call_id
    OR NEW.execution_type IS DISTINCT FROM OLD.execution_type
    OR NEW.destination_id IS DISTINCT FROM OLD.destination_id
    OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
    OR NEW.gate_mode IS DISTINCT FROM OLD.gate_mode
    OR NEW.requested_by_member_id IS DISTINCT FROM OLD.requested_by_member_id
    OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'What an execution does cannot change after it is requested.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'awaiting_approval' AND NEW.status = 'awaiting_approval' THEN
    IF NEW.gate_satisfied_by IS NOT NULL OR NEW.approved_by_member_id IS NOT NULL
      OR NEW.rejected_by_member_id IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.finished_at IS NOT NULL THEN
      RAISE EXCEPTION 'A revision cannot approve, reject, or run the execution.' USING ERRCODE = '42501';
    END IF;
    IF left(btrim(NEW.preview), 1) IN ('{', '[') OR left(btrim(NEW.plain_summary), 1) IN ('{', '[') THEN
      RAISE EXCEPTION 'A revision is plain language, not a payload.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('rejected', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'This execution is finished. It is not retried or reopened.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'awaiting_approval' THEN
    IF NEW.status = 'approved' THEN
      IF NEW.gate_satisfied_by IS DISTINCT FROM 'in_conversation_approval'
        OR NEW.approved_by_member_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'Approval is recorded as the person who approved it.' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.status = 'rejected' THEN
      IF NEW.rejected_by_member_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'A rejection is recorded as the person who rejected it.' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A pending execution can only be approved or rejected.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status <> 'running' THEN
      RAISE EXCEPTION 'An approved execution can only start running.' USING ERRCODE = '42501';
    END IF;
    IF NEW.approved_by_member_id IS DISTINCT FROM OLD.approved_by_member_id
      OR NEW.gate_satisfied_by IS DISTINCT FROM OLD.gate_satisfied_by THEN
      RAISE EXCEPTION 'Approval cannot change once given.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'running' THEN
    IF NEW.status NOT IN ('succeeded', 'failed') THEN
      RAISE EXCEPTION 'A running execution can only succeed or fail.' USING ERRCODE = '42501';
    END IF;
    IF NEW.approved_by_member_id IS DISTINCT FROM OLD.approved_by_member_id
      OR NEW.gate_satisfied_by IS DISTINCT FROM OLD.gate_satisfied_by THEN
      RAISE EXCEPTION 'Approval cannot change once given.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'That execution state change is not allowed.' USING ERRCODE = '42501';
END;
$$;

