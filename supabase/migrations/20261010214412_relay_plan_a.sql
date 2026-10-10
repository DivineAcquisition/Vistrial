-- Plan A: Vistrial still never sends to leads. This closes the gaps around
-- the draft-only gate:
--   1. Follow-up drafts are approved through the gate, not their own screen.
--   2. Required disclosures are checked when a message is approved and when
--      it is marked sent.
--   3. Email bounces and complaints are kept per lead, and stop email.

-- ---------------------------------------------------------------------------
-- 1. Follow-up drafts on the gate.
-- ---------------------------------------------------------------------------

ALTER TABLE public.relay_drafts DROP CONSTRAINT IF EXISTS relay_drafts_trigger_check;
ALTER TABLE public.relay_drafts ADD CONSTRAINT relay_drafts_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'follow_up'));

ALTER TABLE public.relay_drafts
  ADD COLUMN IF NOT EXISTS follow_up_draft_id uuid REFERENCES public.follow_up_drafts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS relay_drafts_follow_up_idx
  ON public.relay_drafts (follow_up_draft_id) WHERE follow_up_draft_id IS NOT NULL;

COMMENT ON COLUMN public.relay_drafts.follow_up_draft_id IS
  'Set when a person handed a follow-up draft to the gate. The follow-up draft follows this request.';

-- ---------------------------------------------------------------------------
-- 2. Disclosures and email suppression, checked by the database.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gate_normalize_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(regexp_replace(COALESCE(p_text, ''), '\s+', ' ', 'g')));
$$;

-- The first required disclosure the message does not contain, or NULL.
-- Matches missingDisclosures() in src/lib/compliance/rules.ts.
CREATE OR REPLACE FUNCTION public.gate_missing_disclosure(p_org_id uuid, p_text text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list jsonb;
  v_line text;
  v_text text := public.gate_normalize_text(p_text);
BEGIN
  v_list := public.config_effective_at(p_org_id) -> 'values' -> 'compliance.required_disclosures';
  IF v_list IS NULL OR jsonb_typeof(v_list) <> 'array' THEN
    RETURN NULL;
  END IF;
  FOR v_line IN SELECT jsonb_array_elements_text(v_list) LOOP
    IF public.gate_normalize_text(v_line) <> '' AND position(public.gate_normalize_text(v_line) IN v_text) = 0 THEN
      RETURN btrim(v_line);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lead_email_suppressions (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('bounced', 'complained')),
  provider text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend')),
  provider_id text CHECK (provider_id IS NULL OR char_length(provider_id) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, lead_id),
  CONSTRAINT lead_email_suppressions_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lead_email_suppressions IS
  'Leads whose email bounced or who marked a message as spam. Nothing is emailed to them again.';

CREATE OR REPLACE FUNCTION public.gate_email_suppressed(p_org_id uuid, p_lead_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_email_suppressions s
    WHERE s.org_id = p_org_id AND s.lead_id = ANY (p_lead_ids)
  );
$$;

CREATE OR REPLACE FUNCTION public.relay_withdraw_email_for_lead(p_org_id uuid, p_lead_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH items AS (
    UPDATE public.approval_items
    SET status = 'withdrawn', withdrawn_reason = left(p_reason, 300), decided_at = now()
    WHERE org_id = p_org_id
      AND agent_id = 'relay'
      AND action_type = 'send_email'
      AND p_lead_id = ANY (lead_ids)
      AND status IN ('pending', 'approved')
    RETURNING id, run_id
  ), drafts AS (
    UPDATE public.relay_drafts d
    SET status = 'withdrawn', withdrawn_reason = left(p_reason, 300)
    FROM items
    WHERE d.approval_item_id = items.id AND d.status IN ('waiting', 'approved')
    RETURNING d.id
  ), runs AS (
    UPDATE public.agent_activity_runs r
    SET status = 'stopped', needs_person = NULL, current_step_label = NULL,
        reason_summary = left('Withdrawn: ' || p_reason, 2000), finished_at = now(), last_progress_at = now()
    FROM items
    WHERE r.id = items.run_id AND r.status IN ('queued', 'working', 'waiting_person')
    RETURNING r.id, r.org_id
  ), events AS (
    INSERT INTO public.agent_activity_events (org_id, run_id, agent_id, kind, label)
    SELECT runs.org_id, runs.id, 'relay', 'run_finished', left('Withdrawn: ' || p_reason, 300) FROM runs
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM items;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_email_suppression_withdraw()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.relay_withdraw_email_for_lead(
    NEW.org_id, NEW.lead_id,
    CASE WHEN NEW.reason = 'complained' THEN 'The lead marked an email as spam.' ELSE 'Email to this lead bounced.' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_email_suppression_withdraw ON public.lead_email_suppressions;
CREATE TRIGGER lead_email_suppression_withdraw
  AFTER INSERT ON public.lead_email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.lead_email_suppression_withdraw();

-- ---------------------------------------------------------------------------
-- 3. Deciding and marking sent, now with the disclosure and email checks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gate_decide(
  p_item_id uuid,
  p_decision text,
  p_body text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_answer text DEFAULT NULL,
  p_edit_distance integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.approval_items%ROWTYPE;
  v_member uuid;
  v_people boolean;
  v_block text;
  v_draft public.relay_drafts%ROWTYPE;
  v_body text;
  v_decider text;
  v_missing text;
BEGIN
  IF p_decision NOT IN ('approve', 'reject', 'answer') THEN
    RAISE EXCEPTION 'Unknown decision.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_item FROM public.approval_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.gate_can_decide(v_item.org_id, v_item.action_type, v_item.assigned_member_id) THEN
    RAISE EXCEPTION 'You cannot decide this under this workspace''s approval settings.' USING ERRCODE = '42501';
  END IF;
  IF v_item.status <> 'pending' THEN
    SELECT display_name INTO v_decider FROM public.org_members WHERE id = v_item.decided_by_member_id;
    RETURN jsonb_build_object('state', v_item.status, 'already', true, 'by', v_decider);
  END IF;
  v_member := public.user_member_id(v_item.org_id);
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace.' USING ERRCODE = '42501';
  END IF;
  v_people := COALESCE((SELECT t.reaches_people FROM public.approval_action_types t WHERE t.action_type = v_item.action_type), true);
  SELECT * INTO v_draft FROM public.relay_drafts WHERE approval_item_id = v_item.id;

  IF p_decision = 'reject' THEN
    UPDATE public.approval_items
    SET status = 'dismissed', decided_by_member_id = v_member, decided_at = now(), dismiss_reason = left(NULLIF(btrim(p_reason), ''), 500)
    WHERE id = v_item.id;
    IF v_draft.id IS NOT NULL THEN
      UPDATE public.relay_drafts SET status = 'rejected', rejected_reason = left(NULLIF(btrim(p_reason), ''), 500) WHERE id = v_draft.id;
      INSERT INTO public.relay_feedback (org_id, relay_draft_id, kind, channel, original_body, reason, created_by_member_id)
      VALUES (v_item.org_id, v_draft.id, 'rejected', v_draft.channel, v_draft.body, left(NULLIF(btrim(p_reason), ''), 500), v_member);
    END IF;
    PERFORM public.ws_log(v_item.org_id, 'gate.rejected', 'approval_items', v_item.id::text,
      jsonb_build_object('agent', v_item.agent_id, 'action_type', v_item.action_type), auth.uid());
    RETURN jsonb_build_object('state', 'rejected');
  END IF;

  IF v_item.expires_at IS NOT NULL AND v_item.expires_at <= now() THEN
    UPDATE public.approval_items SET status = 'expired', decided_at = now() WHERE id = v_item.id;
    UPDATE public.relay_drafts SET status = 'expired' WHERE approval_item_id = v_item.id AND status = 'waiting';
    RETURN jsonb_build_object('state', 'expired');
  END IF;

  IF v_people THEN
    v_block := public.gate_lead_block(v_item.org_id, v_item.lead_ids, v_item.created_at);
    IF v_block IS NOT NULL THEN
      PERFORM public.relay_withdraw_for_lead(v_item.org_id, v_item.lead_ids[1], v_block);
      UPDATE public.approval_items SET status = 'withdrawn', withdrawn_reason = v_block, decided_at = now()
      WHERE id = v_item.id AND status = 'pending';
      RETURN jsonb_build_object('state', 'withdrawn', 'reason', v_block);
    END IF;
    IF v_item.action_type = 'send_email' AND public.gate_email_suppressed(v_item.org_id, v_item.lead_ids) THEN
      PERFORM public.relay_withdraw_email_for_lead(v_item.org_id, v_item.lead_ids[1], 'Email to this lead bounced or was marked as spam.');
      RETURN jsonb_build_object('state', 'withdrawn', 'reason', 'Email to this lead bounced or was marked as spam.');
    END IF;
    v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
    IF p_body IS NOT NULL AND v_body IS NULL THEN
      RAISE EXCEPTION 'The message cannot be empty.' USING ERRCODE = '22023';
    END IF;
    IF v_draft.id IS NOT NULL AND v_draft.channel = 'email' AND NULLIF(btrim(COALESCE(p_subject, v_draft.subject, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Email needs a subject.' USING ERRCODE = '22023';
    END IF;
    IF v_draft.id IS NOT NULL THEN
      v_missing := public.gate_missing_disclosure(v_item.org_id, COALESCE(v_body, v_draft.body) || ' ' || COALESCE(v_draft.footer, ''));
      IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'This message is missing a required disclosure: "%". Add it to the message, then approve.', v_missing USING ERRCODE = '22023';
      END IF;
    END IF;
    UPDATE public.approval_items
    SET status = 'approved', run_mode = 'approved', decided_by_member_id = v_member, decided_at = now(),
        preview = COALESCE(left(v_body, 4000), preview)
    WHERE id = v_item.id;
    IF v_draft.id IS NOT NULL THEN
      UPDATE public.relay_drafts
      SET status = 'approved',
          final_body = COALESCE(left(v_body, 4000), body),
          final_subject = CASE WHEN channel = 'email' THEN left(COALESCE(NULLIF(btrim(p_subject), ''), subject), 200) END,
          edit_distance = p_edit_distance,
          approved_by_member_id = v_member,
          approved_at = now()
      WHERE id = v_draft.id;
      INSERT INTO public.relay_feedback (org_id, relay_draft_id, kind, channel, original_body, final_body, edit_distance, created_by_member_id)
      VALUES (
        v_item.org_id, v_draft.id,
        CASE WHEN v_body IS NOT NULL AND v_body <> v_draft.body THEN 'edited' ELSE 'approved_as_is' END,
        v_draft.channel, v_draft.body, COALESCE(v_body, v_draft.body), p_edit_distance, v_member
      );
    END IF;
    PERFORM public.ws_log(v_item.org_id, 'gate.approved', 'approval_items', v_item.id::text,
      jsonb_build_object('agent', v_item.agent_id, 'action_type', v_item.action_type, 'edited', v_body IS NOT NULL AND v_body IS DISTINCT FROM v_draft.body), auth.uid());
    RETURN jsonb_build_object('state', 'approved');
  END IF;

  UPDATE public.approval_items
  SET status = 'succeeded', run_mode = 'approved', decided_by_member_id = v_member, decided_at = now(),
      answer_text = left(NULLIF(btrim(p_answer), ''), 2000),
      preview = COALESCE(left(NULLIF(btrim(p_body), ''), 4000), preview)
  WHERE id = v_item.id;
  PERFORM public.ws_log(v_item.org_id, CASE WHEN p_decision = 'answer' THEN 'gate.answered' ELSE 'gate.approved' END,
    'approval_items', v_item.id::text, jsonb_build_object('agent', v_item.agent_id, 'action_type', v_item.action_type), auth.uid());
  RETURN jsonb_build_object('state', 'performed');
END;
$$;

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
  v_missing text;
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
  IF v_draft.channel = 'email' AND public.gate_email_suppressed(v_item.org_id, v_item.lead_ids) THEN
    PERFORM public.relay_withdraw_email_for_lead(v_item.org_id, v_draft.lead_id, 'Email to this lead bounced or was marked as spam.');
    RETURN jsonb_build_object('state', 'withdrawn', 'reason', 'Email to this lead bounced or was marked as spam.');
  END IF;
  v_missing := public.gate_missing_disclosure(v_item.org_id, COALESCE(v_draft.final_body, v_draft.body) || ' ' || COALESCE(v_draft.footer, ''));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'This message is missing a required disclosure: "%". Withdraw it and draft it again.', v_missing USING ERRCODE = '22023';
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

-- ---------------------------------------------------------------------------
-- 4. Handing a follow-up draft to the gate. Runs as the signed-in person.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.follow_up_to_gate(
  p_draft_id uuid,
  p_body text,
  p_subject text,
  p_footer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft public.follow_up_drafts%ROWTYPE;
  v_lead record;
  v_member uuid;
  v_action text;
  v_assigned uuid;
  v_block text;
  v_body text := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_subject text := NULLIF(btrim(COALESCE(p_subject, '')), '');
  v_footer text := NULLIF(btrim(COALESCE(p_footer, '')), '');
  v_missing text;
  v_existing uuid;
  v_item uuid;
  v_name text;
BEGIN
  SELECT * INTO v_draft FROM public.follow_up_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR v_draft.org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = 'P0002';
  END IF;
  v_member := public.user_member_id(v_draft.org_id);
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace.' USING ERRCODE = '42501';
  END IF;

  SELECT id, first_name, last_name, assigned_setter_id, assigned_closer_id INTO v_lead
  FROM public.leads WHERE id = v_draft.lead_id AND org_id = v_draft.org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That lead is not in this workspace.' USING ERRCODE = 'P0002';
  END IF;
  v_assigned := COALESCE(v_lead.assigned_setter_id, v_lead.assigned_closer_id);
  v_action := CASE WHEN v_draft.channel = 'email' THEN 'send_email' ELSE 'send_text' END;
  IF NOT (public.gate_can_decide(v_draft.org_id, v_action, v_assigned) OR v_assigned IS NOT DISTINCT FROM v_member) THEN
    RAISE EXCEPTION 'Only an approver or the person this lead is assigned to can send this for approval.' USING ERRCODE = '42501';
  END IF;

  SELECT d.approval_item_id INTO v_existing
  FROM public.relay_drafts d
  WHERE d.follow_up_draft_id = v_draft.id AND d.status IN ('waiting', 'approved')
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'waiting', 'already', true, 'item_id', v_existing);
  END IF;

  IF v_draft.status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'This draft is not waiting for approval.' USING ERRCODE = '22023';
  END IF;
  IF v_draft.expires_at <= now() THEN
    RAISE EXCEPTION 'This draft is stale. Regenerate it first.' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'The message cannot be empty.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'The message is too long.' USING ERRCODE = '22023';
  END IF;
  IF v_draft.channel = 'email' AND v_subject IS NULL THEN
    RAISE EXCEPTION 'Email needs a subject.' USING ERRCODE = '22023';
  END IF;

  v_block := public.gate_lead_block(v_draft.org_id, ARRAY[v_draft.lead_id], v_draft.created_at);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION 'Not sent for approval: %', v_block USING ERRCODE = '22023';
  END IF;
  IF v_draft.channel = 'email' AND public.gate_email_suppressed(v_draft.org_id, ARRAY[v_draft.lead_id]) THEN
    RAISE EXCEPTION 'Not sent for approval: email to this lead bounced or was marked as spam.' USING ERRCODE = '22023';
  END IF;
  v_missing := public.gate_missing_disclosure(v_draft.org_id, v_body || ' ' || COALESCE(v_footer, ''));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'This message is missing a required disclosure: "%".', v_missing USING ERRCODE = '22023';
  END IF;

  v_name := COALESCE(NULLIF(btrim(v_lead.first_name), ''), 'this lead');

  INSERT INTO public.approval_items (
    org_id, area, kind, action_type, status, urgency, title, preview, reason, lead_ids,
    assigned_member_id, dedupe_key, agent_id, expires_at, config_version
  ) VALUES (
    v_draft.org_id, 'sales', 'relay_draft', v_action, 'pending', 60,
    CASE WHEN v_draft.channel = 'email' THEN 'Email for ' ELSE 'Text for ' END || v_name,
    v_body,
    'A follow-up after the call. Approve it, then send it from your CRM.',
    ARRAY[v_draft.lead_id], v_assigned,
    'follow_up:' || v_draft.id::text || ':' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text,
    'relay', v_draft.expires_at, public.config_version_stamp(v_draft.org_id)
  )
  RETURNING id INTO v_item;

  INSERT INTO public.relay_drafts (
    org_id, lead_id, approval_item_id, trigger, channel, body, subject, footer, model, expires_at, follow_up_draft_id
  ) VALUES (
    v_draft.org_id, v_draft.lead_id, v_item, 'follow_up',
    CASE WHEN v_draft.channel = 'email' THEN 'email' ELSE 'sms' END,
    v_body,
    CASE WHEN v_draft.channel = 'email' THEN left(v_subject, 200) END,
    left(v_footer, 1200), v_draft.model_version, v_draft.expires_at, v_draft.id
  );

  UPDATE public.follow_up_drafts
  SET edited_body = v_body,
      edited_subject = CASE WHEN v_draft.channel = 'email' THEN v_subject END,
      status = 'pending',
      failure_reason = NULL
  WHERE id = v_draft.id;

  PERFORM public.ws_log(v_draft.org_id, 'gate.requested', 'approval_items', v_item::text,
    jsonb_build_object('agent', 'relay', 'action_type', v_action, 'follow_up_draft', v_draft.id), auth.uid());
  RETURN jsonb_build_object('state', 'waiting', 'item_id', v_item);
END;
$$;

-- The follow-up draft follows its request: sent, rejected, withdrawn, expired.
CREATE OR REPLACE FUNCTION public.relay_follow_up_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rejector uuid;
BEGIN
  IF NEW.follow_up_draft_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'performed' THEN
    UPDATE public.follow_up_drafts
    SET status = 'sent',
        approved_by_member_id = NEW.approved_by_member_id,
        approved_at = COALESCE(NEW.approved_at, now()),
        touch_id = NEW.touch_id,
        sent_body = COALESCE(NEW.final_body, NEW.body),
        sent_subject = COALESCE(NEW.final_subject, NEW.subject),
        sent_at = COALESCE(NEW.performed_at, now())
    WHERE id = NEW.follow_up_draft_id AND status IN ('pending', 'failed');
  ELSIF NEW.status = 'rejected' THEN
    SELECT decided_by_member_id INTO v_rejector FROM public.approval_items WHERE id = NEW.approval_item_id;
    UPDATE public.follow_up_drafts
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by_member_id = v_rejector,
        rejected_reason = COALESCE(NEW.rejected_reason, 'Rejected in Needs your approval.')
    WHERE id = NEW.follow_up_draft_id AND status IN ('pending', 'failed') AND v_rejector IS NOT NULL;
  ELSIF NEW.status = 'withdrawn' THEN
    UPDATE public.follow_up_drafts
    SET status = 'discarded', discarded_reason = left(COALESCE(NEW.withdrawn_reason, 'Withdrawn.'), 300)
    WHERE id = NEW.follow_up_draft_id AND status IN ('pending', 'failed');
  ELSIF NEW.status = 'expired' THEN
    UPDATE public.follow_up_drafts
    SET status = 'expired'
    WHERE id = NEW.follow_up_draft_id AND status IN ('pending', 'failed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relay_follow_up_sync ON public.relay_drafts;
CREATE TRIGGER relay_follow_up_sync
  AFTER UPDATE OF status ON public.relay_drafts
  FOR EACH ROW EXECUTE FUNCTION public.relay_follow_up_sync();

-- ---------------------------------------------------------------------------
-- Row level security and grants.
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_email_suppressions_select ON public.lead_email_suppressions;
CREATE POLICY lead_email_suppressions_select ON public.lead_email_suppressions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.lead_email_suppressions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.lead_email_suppressions TO authenticated;
GRANT ALL ON TABLE public.lead_email_suppressions TO service_role;

REVOKE ALL ON FUNCTION public.gate_normalize_text(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_missing_disclosure(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gate_email_suppressed(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relay_withdraw_email_for_lead(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_email_suppression_withdraw() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relay_follow_up_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.follow_up_to_gate(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_decide(uuid, text, text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_mark_sent(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gate_normalize_text(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gate_missing_disclosure(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gate_email_suppressed(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.relay_withdraw_email_for_lead(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.follow_up_to_gate(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gate_decide(uuid, text, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gate_mark_sent(uuid) TO authenticated;
