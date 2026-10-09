-- A request with nobody assigned must not let any member mark it sent.
CREATE OR REPLACE FUNCTION public.gate_mark_sent(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.approval_items%ROWTYPE;
  v_draft public.relay_drafts%ROWTYPE;
  v_member uuid;
  v_block text;
  v_touch uuid;
BEGIN
  SELECT * INTO v_item FROM public.approval_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = 'P0002';
  END IF;
  v_member := public.user_member_id(v_item.org_id);
  IF v_member IS NULL OR NOT (
    public.gate_can_decide(v_item.org_id, v_item.action_type, v_item.assigned_member_id)
    OR v_item.assigned_member_id IS NOT DISTINCT FROM v_member
  ) THEN
    RAISE EXCEPTION 'Only an approver or the person this lead is assigned to can mark it sent.' USING ERRCODE = '42501';
  END IF;
  IF v_item.status = 'succeeded' THEN
    RETURN jsonb_build_object('state', 'performed', 'already', true);
  END IF;
  IF v_item.status <> 'approved' THEN
    RAISE EXCEPTION 'This is not approved, so it cannot be marked sent.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_draft FROM public.relay_drafts WHERE approval_item_id = v_item.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no message on this request.' USING ERRCODE = '22023';
  END IF;
  v_block := public.gate_lead_block(v_item.org_id, v_item.lead_ids, v_item.created_at);
  IF v_block IS NOT NULL THEN
    PERFORM public.relay_withdraw_for_lead(v_item.org_id, v_draft.lead_id, v_block);
    RETURN jsonb_build_object('state', 'withdrawn', 'reason', v_block);
  END IF;

  UPDATE public.approval_items
  SET status = 'succeeded', performed_at = now(), performed_by_member_id = v_member
  WHERE id = v_item.id;

  INSERT INTO public.touches (org_id, lead_id, type, channel, direction, actor_member_id, summary, occurred_at, drafted_by_agent, approved_by_member_id)
  VALUES (
    v_item.org_id, v_draft.lead_id, 'human', v_draft.channel::public.touch_channel, 'outbound', v_member,
    CASE WHEN v_draft.channel = 'email' THEN 'Email sent from the CRM. Drafted by Relay.' ELSE 'Text sent from the CRM. Drafted by Relay.' END,
    now(), 'relay', v_draft.approved_by_member_id
  )
  RETURNING id INTO v_touch;

  UPDATE public.relay_drafts
  SET status = 'performed', performed_by_member_id = v_member, performed_at = now(), touch_id = v_touch
  WHERE id = v_draft.id;

  PERFORM public.ws_log(v_item.org_id, 'gate.performed', 'approval_items', v_item.id::text,
    jsonb_build_object('agent', v_item.agent_id, 'action_type', v_item.action_type, 'touch', v_touch), auth.uid());
  RETURN jsonb_build_object('state', 'performed', 'touch_id', v_touch);
END;
$$;
