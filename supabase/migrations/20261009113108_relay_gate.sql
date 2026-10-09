-- Relay and the approval gate.
--
-- 1. Sending to leads is off everywhere until a Platform Admin turns it on.
--    Test workspaces can never send, whatever the switch says.
-- 2. Anything that reaches a lead or client always waits for a person.
-- 3. approval_items is the one shared request record. New states: approved
--    (a person approved it; someone sends it from the CRM), expired, withdrawn.
-- 4. Relay's drafts, jobs, feedback, quality history, and heartbeat.
-- 5. Messaging readiness, confirmed by staff.
-- 6. Touches remember who drafted and who approved.
-- 7. Requests withdraw on their own when they stop making sense.
-- 8. The decision functions, which enforce who may decide.

-- ---------------------------------------------------------------------------
-- 1. The sending switch.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_messaging (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  lead_sending_enabled boolean NOT NULL DEFAULT false,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_messaging (id, lead_sending_enabled) VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.platform_messaging IS
  'Whether Vistrial may send messages to leads at all. Off: people send approved messages from their CRM.';

CREATE OR REPLACE FUNCTION public.lead_sending_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT m.lead_sending_enabled FROM public.platform_messaging m WHERE m.id), false);
$$;

CREATE OR REPLACE FUNCTION public.set_lead_sending(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can turn sending on or off.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_messaging
  SET lead_sending_enabled = p_enabled, changed_by = auth.uid(), changed_at = now()
  WHERE id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghl_dispatches_sending_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.claimed_at IS NULL OR NEW.claimed_at IS NOT DISTINCT FROM OLD.claimed_at) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = NEW.org_id AND o.is_test_workspace) THEN
    RAISE EXCEPTION 'test_workspace_never_sends' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.lead_sending_enabled() THEN
    RAISE EXCEPTION 'lead_sending_off' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ghl_dispatches_sending_guard ON public.ghl_dispatches;
CREATE TRIGGER ghl_dispatches_sending_guard
  BEFORE INSERT ON public.ghl_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.ghl_dispatches_sending_guard();

DROP TRIGGER IF EXISTS ghl_dispatches_claim_guard ON public.ghl_dispatches;
CREATE TRIGGER ghl_dispatches_claim_guard
  BEFORE UPDATE OF claimed_at ON public.ghl_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.ghl_dispatches_sending_guard();

-- ---------------------------------------------------------------------------
-- 2. Nothing that reaches people runs without a person.
-- ---------------------------------------------------------------------------

UPDATE public.approval_action_types SET default_mode = 'ask_first'
WHERE reaches_people AND default_mode = 'auto_run';

CREATE OR REPLACE FUNCTION public.approval_people_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_auto boolean;
BEGIN
  v_auto := CASE TG_TABLE_NAME
    WHEN 'approval_gate_actions' THEN NEW.mode = 'auto_run'
    ELSE NEW.run_mode IS NOT DISTINCT FROM 'auto_run'
  END;
  IF v_auto AND COALESCE(
    (SELECT t.reaches_people FROM public.approval_action_types t WHERE t.action_type = NEW.action_type),
    true
  ) THEN
    RAISE EXCEPTION 'Messages to leads and clients always need a person to approve them.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_gate_actions_people_guard ON public.approval_gate_actions;
CREATE TRIGGER approval_gate_actions_people_guard
  BEFORE INSERT OR UPDATE OF mode ON public.approval_gate_actions
  FOR EACH ROW EXECUTE FUNCTION public.approval_people_guard();

DROP TRIGGER IF EXISTS approval_items_people_guard ON public.approval_items;
CREATE TRIGGER approval_items_people_guard
  BEFORE INSERT OR UPDATE OF run_mode ON public.approval_items
  FOR EACH ROW EXECUTE FUNCTION public.approval_people_guard();

-- ---------------------------------------------------------------------------
-- 3. The shared request record.
-- ---------------------------------------------------------------------------

ALTER TABLE public.approval_items DROP CONSTRAINT IF EXISTS approval_items_status;
ALTER TABLE public.approval_items ADD CONSTRAINT approval_items_status CHECK (
  status IN ('pending', 'approved', 'running', 'failed', 'succeeded', 'dismissed', 'expired', 'withdrawn')
);

ALTER TABLE public.approval_items
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text,
  ADD COLUMN IF NOT EXISTS performed_at timestamptz,
  ADD COLUMN IF NOT EXISTS performed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_items_approved_by_person') THEN
    ALTER TABLE public.approval_items
      ADD CONSTRAINT approval_items_approved_by_person CHECK (status <> 'approved' OR decided_by_member_id IS NOT NULL),
      ADD CONSTRAINT approval_items_withdrawn_reason_len CHECK (withdrawn_reason IS NULL OR char_length(withdrawn_reason) <= 300);
  END IF;
END $$;

DROP INDEX IF EXISTS public.approval_items_org_open_idx;
CREATE INDEX approval_items_org_open_idx
  ON public.approval_items (org_id, urgency, created_at)
  WHERE status IN ('pending', 'approved', 'running', 'failed');

-- Approvers who are not owners see what they can decide.
DROP POLICY IF EXISTS approval_items_select ON public.approval_items;
CREATE POLICY approval_items_select
  ON public.approval_items FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.ws_is_staff(org_id)
    OR org_id IN (SELECT public.user_approver_org_ids())
    OR (
      assigned_member_id IS NOT NULL
      AND assigned_member_id = public.user_member_id(org_id)
    )
  );

ALTER TABLE public.sentry_handoffs DROP CONSTRAINT IF EXISTS sentry_handoffs_status_check;
ALTER TABLE public.sentry_handoffs ADD CONSTRAINT sentry_handoffs_status_check
  CHECK (status IN ('relay_unavailable', 'requested', 'relay_queued'));

-- ---------------------------------------------------------------------------
-- 4. Relay.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.relay_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  approval_item_id uuid UNIQUE REFERENCES public.approval_items (id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_activity_runs (id) ON DELETE SET NULL,
  job_id uuid,
  trigger text NOT NULL CHECK (trigger IN ('after_call', 'missed_window')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  body text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 4000),
  subject text CHECK (subject IS NULL OR char_length(subject) <= 200),
  footer text CHECK (footer IS NULL OR char_length(footer) <= 1200),
  facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(facts) = 'array'),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'approved', 'rejected', 'expired', 'withdrawn', 'performed', 'failed')),
  final_body text CHECK (final_body IS NULL OR char_length(final_body) <= 4000),
  final_subject text CHECK (final_subject IS NULL OR char_length(final_subject) <= 200),
  edit_distance integer,
  approved_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_reason text CHECK (rejected_reason IS NULL OR char_length(rejected_reason) <= 500),
  withdrawn_reason text CHECK (withdrawn_reason IS NULL OR char_length(withdrawn_reason) <= 300),
  performed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  performed_at timestamptz,
  touch_id uuid,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  check_faults jsonb NOT NULL DEFAULT '[]'::jsonb,
  simulated boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relay_drafts_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE,
  CONSTRAINT relay_drafts_approved_has_person CHECK (status NOT IN ('approved', 'performed') OR approved_by_member_id IS NOT NULL),
  CONSTRAINT relay_drafts_performed_has_touch CHECK (status <> 'performed' OR (touch_id IS NOT NULL AND performed_by_member_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS relay_drafts_org_status_idx ON public.relay_drafts (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS relay_drafts_lead_idx ON public.relay_drafts (org_id, lead_id, created_at DESC);

DROP TRIGGER IF EXISTS relay_drafts_set_updated_at ON public.relay_drafts;
CREATE TRIGGER relay_drafts_set_updated_at
  BEFORE UPDATE ON public.relay_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.relay_drafts IS
  'Messages Relay drafted. Each waits on one approval request. Vistrial never sends these; a person does, from the CRM.';

CREATE TABLE IF NOT EXISTS public.relay_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('after_call', 'missed_window')),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'skipped', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 200),
  result text CHECK (result IS NULL OR char_length(result) <= 300),
  draft_id uuid REFERENCES public.relay_drafts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, dedupe_key),
  CONSTRAINT relay_jobs_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS relay_jobs_pending_idx ON public.relay_jobs (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS relay_jobs_dead_idx ON public.relay_jobs (org_id, updated_at DESC) WHERE status = 'dead';

DROP TRIGGER IF EXISTS relay_jobs_set_updated_at ON public.relay_jobs;
CREATE TRIGGER relay_jobs_set_updated_at
  BEFORE UPDATE ON public.relay_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.relay_jobs.last_error IS 'A short code. Never message or transcript text.';

-- Fair claiming: at most p_per_org jobs from one workspace per pass, so one
-- busy workspace cannot starve the rest. Runs stuck for ten minutes go back.
CREATE OR REPLACE FUNCTION public.relay_claim_jobs(p_limit integer DEFAULT 10, p_per_org integer DEFAULT 2)
RETURNS SETOF public.relay_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.relay_jobs
  SET status = 'pending', claimed_at = NULL
  WHERE status = 'running' AND claimed_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH ranked AS (
    SELECT j.id, row_number() OVER (PARTITION BY j.org_id ORDER BY j.next_attempt_at, j.created_at) AS rn, j.next_attempt_at
    FROM public.relay_jobs j
    WHERE j.status = 'pending' AND j.next_attempt_at <= now()
  ), picked AS (
    SELECT r.id FROM ranked r
    WHERE r.rn <= GREATEST(p_per_org, 1)
    ORDER BY r.rn, r.next_attempt_at
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE public.relay_jobs j
  SET status = 'running', attempts = j.attempts + 1, claimed_at = now()
  FROM picked
  WHERE j.id = picked.id AND j.status = 'pending'
  RETURNING j.*;
END;
$$;

CREATE TABLE IF NOT EXISTS public.relay_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  relay_draft_id uuid NOT NULL REFERENCES public.relay_drafts (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('approved_as_is', 'edited', 'rejected')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  original_body text NOT NULL,
  final_body text,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  edit_distance integer,
  created_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relay_feedback_org_idx ON public.relay_feedback (org_id, created_at DESC);

COMMENT ON TABLE public.relay_feedback IS
  'What approvers changed or rejected. Read back only for the same workspace.';

CREATE TABLE IF NOT EXISTS public.relay_quality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug text NOT NULL,
  config_hash text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('checks_only', 'with_model')),
  scenarios integer NOT NULL,
  passed_count integer NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed boolean NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relay_quality_runs_template_idx ON public.relay_quality_runs (template_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS public.relay_runtime (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_pass_at timestamptz,
  last_pass jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.relay_runtime (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Messaging readiness. The CRM holds the number and domain settings, so
--    staff confirm them here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messaging_readiness (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  sender_number_confirmed_at timestamptz,
  sender_number_confirmed_by uuid,
  sending_domain_confirmed_at timestamptz,
  sending_domain_confirmed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_messaging_readiness(p_org_id uuid, p_item text, p_confirmed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Only the Vistrial team can confirm messaging setup.' USING ERRCODE = '42501';
  END IF;
  IF p_item NOT IN ('sender_number', 'sending_domain') THEN
    RAISE EXCEPTION 'Unknown readiness item.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.messaging_readiness (org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  IF p_item = 'sender_number' THEN
    UPDATE public.messaging_readiness
    SET sender_number_confirmed_at = CASE WHEN p_confirmed THEN now() END,
        sender_number_confirmed_by = CASE WHEN p_confirmed THEN auth.uid() END,
        updated_at = now()
    WHERE org_id = p_org_id;
  ELSE
    UPDATE public.messaging_readiness
    SET sending_domain_confirmed_at = CASE WHEN p_confirmed THEN now() END,
        sending_domain_confirmed_by = CASE WHEN p_confirmed THEN auth.uid() END,
        updated_at = now()
    WHERE org_id = p_org_id;
  END IF;
  PERFORM public.ws_log(p_org_id, 'messaging.readiness_' || CASE WHEN p_confirmed THEN 'confirmed' ELSE 'cleared' END,
    'messaging_readiness', p_org_id::text, jsonb_build_object('item', p_item), auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Touches remember the drafter and the approver.
-- ---------------------------------------------------------------------------

ALTER TABLE public.touches
  ADD COLUMN IF NOT EXISTS drafted_by_agent text,
  ADD COLUMN IF NOT EXISTS approved_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'touches_drafted_by_agent') THEN
    ALTER TABLE public.touches
      ADD CONSTRAINT touches_drafted_by_agent CHECK (drafted_by_agent IS NULL OR drafted_by_agent = 'relay');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Withdrawing requests that no longer make sense.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.relay_withdraw_for_lead(p_org_id uuid, p_lead_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.relay_jobs
  SET status = 'skipped', result = left(p_reason, 300), claimed_at = NULL
  WHERE org_id = p_org_id AND lead_id = p_lead_id AND status = 'pending';

  WITH items AS (
    UPDATE public.approval_items
    SET status = 'withdrawn', withdrawn_reason = left(p_reason, 300), decided_at = now()
    WHERE org_id = p_org_id
      AND agent_id = 'relay'
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

CREATE OR REPLACE FUNCTION public.relay_withdraw_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'lead_opt_outs' THEN
    PERFORM public.relay_withdraw_for_lead(NEW.org_id, NEW.lead_id, 'The lead opted out.');
  ELSIF TG_TABLE_NAME = 'leads' THEN
    IF NEW.do_not_contact AND NOT COALESCE(OLD.do_not_contact, false) THEN
      PERFORM public.relay_withdraw_for_lead(NEW.org_id, NEW.id, 'The lead is marked do not contact.');
    ELSIF NEW.merged_into IS NOT NULL AND OLD.merged_into IS NULL THEN
      PERFORM public.relay_withdraw_for_lead(NEW.org_id, NEW.id, 'The lead was merged into another record.');
    ELSIF NEW.status IN ('closed_won', 'closed_lost') AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.relay_withdraw_for_lead(NEW.org_id, NEW.id, 'The lead was closed.');
    END IF;
  ELSIF TG_TABLE_NAME = 'touches' THEN
    IF NEW.direction = 'inbound' THEN
      PERFORM public.relay_withdraw_for_lead(NEW.org_id, NEW.lead_id, 'The lead replied, so a person should answer them.');
    ELSIF NEW.type = 'human' THEN
      PERFORM public.relay_withdraw_for_lead(NEW.org_id, NEW.lead_id, 'Someone on the team already reached this lead.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relay_withdraw_on_opt_out ON public.lead_opt_outs;
CREATE TRIGGER relay_withdraw_on_opt_out
  AFTER INSERT ON public.lead_opt_outs
  FOR EACH ROW EXECUTE FUNCTION public.relay_withdraw_trigger();

DROP TRIGGER IF EXISTS relay_withdraw_on_lead_change ON public.leads;
CREATE TRIGGER relay_withdraw_on_lead_change
  AFTER UPDATE OF do_not_contact, merged_into, status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.relay_withdraw_trigger();

DROP TRIGGER IF EXISTS relay_withdraw_on_touch ON public.touches;
CREATE TRIGGER relay_withdraw_on_touch
  AFTER INSERT ON public.touches
  FOR EACH ROW EXECUTE FUNCTION public.relay_withdraw_trigger();

CREATE OR REPLACE FUNCTION public.relay_expire_requests()
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
    SET status = 'expired', decided_at = now()
    WHERE agent_id = 'relay' AND status IN ('pending', 'approved') AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id, run_id
  ), drafts AS (
    UPDATE public.relay_drafts d SET status = 'expired'
    FROM items WHERE d.approval_item_id = items.id AND d.status IN ('waiting', 'approved')
    RETURNING d.id
  ), runs AS (
    UPDATE public.agent_activity_runs r
    SET status = 'expired', needs_person = NULL, current_step_label = NULL,
        reason_summary = 'Nobody sent this in time, so it expired. Nothing was sent.', finished_at = now(), last_progress_at = now()
    FROM items WHERE r.id = items.run_id AND r.status IN ('queued', 'working', 'waiting_person')
    RETURNING r.id, r.org_id
  ), events AS (
    INSERT INTO public.agent_activity_events (org_id, run_id, agent_id, kind, label)
    SELECT runs.org_id, runs.id, 'relay', 'run_finished', 'Expired. Nothing was sent.' FROM runs
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM items;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Deciding. These run as the signed-in person, so the database decides
--    who may approve, not the screen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gate_can_decide(p_org_id uuid, p_action_type text, p_assigned_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.ws_is_staff(p_org_id) OR p_org_id IN (SELECT public.user_owner_org_ids()) THEN
    RETURN true;
  END IF;
  v_rule := COALESCE(
    (SELECT a.approver FROM public.approval_gate_actions a WHERE a.org_id = p_org_id AND a.action_type = p_action_type),
    'owners_and_managers'
  );
  IF v_rule = 'owner_only' THEN RETURN false; END IF;
  IF p_org_id NOT IN (SELECT public.user_approver_org_ids()) THEN RETURN false; END IF;
  IF v_rule = 'assigned' AND p_assigned_member_id IS NOT NULL THEN
    RETURN p_assigned_member_id = public.user_member_id(p_org_id);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.gate_lead_block(p_org_id uuid, p_lead_ids uuid[], p_since timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.lead_opt_outs o WHERE o.org_id = p_org_id AND o.lead_id = ANY (p_lead_ids))
      THEN 'The lead opted out.'
    WHEN EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND l.id = ANY (p_lead_ids) AND l.do_not_contact)
      THEN 'The lead is marked do not contact.'
    WHEN EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND l.id = ANY (p_lead_ids) AND l.merged_into IS NOT NULL)
      THEN 'The lead was merged into another record.'
    WHEN EXISTS (
      SELECT 1 FROM public.touches t
      WHERE t.org_id = p_org_id AND t.lead_id = ANY (p_lead_ids) AND t.direction = 'inbound' AND t.occurred_at > p_since
    ) THEN 'The lead replied, so a person should answer them.'
  END;
$$;

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
    v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
    IF p_body IS NOT NULL AND v_body IS NULL THEN
      RAISE EXCEPTION 'The message cannot be empty.' USING ERRCODE = '22023';
    END IF;
    IF v_draft.id IS NOT NULL AND v_draft.channel = 'email' AND NULLIF(btrim(COALESCE(p_subject, v_draft.subject, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Email needs a subject.' USING ERRCODE = '22023';
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

-- The person sent the approved message from the CRM. Once, and only while it
-- still makes sense to.
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
    OR v_item.assigned_member_id = v_member
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

CREATE OR REPLACE FUNCTION public.gate_withdraw(p_item_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.approval_items%ROWTYPE;
  v_reason text := left(COALESCE(NULLIF(btrim(p_reason), ''), 'Withdrawn by a person.'), 300);
BEGIN
  SELECT * INTO v_item FROM public.approval_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.org_id NOT IN (SELECT public.user_org_ids()) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.gate_can_decide(v_item.org_id, v_item.action_type, v_item.assigned_member_id) THEN
    RAISE EXCEPTION 'You cannot withdraw this.' USING ERRCODE = '42501';
  END IF;
  IF v_item.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('state', v_item.status, 'already', true);
  END IF;
  UPDATE public.approval_items SET status = 'withdrawn', withdrawn_reason = v_reason, decided_at = now() WHERE id = v_item.id;
  UPDATE public.relay_drafts SET status = 'withdrawn', withdrawn_reason = v_reason WHERE approval_item_id = v_item.id AND status IN ('waiting', 'approved');
  UPDATE public.agent_activity_runs
  SET status = 'stopped', needs_person = NULL, current_step_label = NULL, reason_summary = 'Withdrawn: ' || v_reason,
      finished_at = now(), last_progress_at = now()
  WHERE id = v_item.run_id AND status IN ('queued', 'working', 'waiting_person');
  PERFORM public.ws_log(v_item.org_id, 'gate.withdrawn', 'approval_items', v_item.id::text,
    jsonb_build_object('agent', v_item.agent_id, 'action_type', v_item.action_type), auth.uid());
  RETURN jsonb_build_object('state', 'withdrawn');
END;
$$;

-- ---------------------------------------------------------------------------
-- Row level security and grants.
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_messaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_quality_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_readiness ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_messaging_select ON public.platform_messaging;
CREATE POLICY platform_messaging_select ON public.platform_messaging FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS relay_drafts_select ON public.relay_drafts;
CREATE POLICY relay_drafts_select ON public.relay_drafts FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.ws_is_staff(org_id)
    OR org_id IN (SELECT public.user_approver_org_ids())
    OR public.ws_can_work_lead(org_id, lead_id)
  );

DROP POLICY IF EXISTS relay_jobs_select ON public.relay_jobs;
CREATE POLICY relay_jobs_select ON public.relay_jobs FOR SELECT TO authenticated
  USING (public.ws_is_staff(org_id));

DROP POLICY IF EXISTS relay_feedback_select ON public.relay_feedback;
CREATE POLICY relay_feedback_select ON public.relay_feedback FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR public.ws_is_staff(org_id)
    OR org_id IN (SELECT public.user_approver_org_ids())
  );

DROP POLICY IF EXISTS relay_quality_runs_select ON public.relay_quality_runs;
CREATE POLICY relay_quality_runs_select ON public.relay_quality_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()));

DROP POLICY IF EXISTS relay_runtime_select ON public.relay_runtime;
CREATE POLICY relay_runtime_select ON public.relay_runtime FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.user_staff_org_ids()));

DROP POLICY IF EXISTS messaging_readiness_select ON public.messaging_readiness;
CREATE POLICY messaging_readiness_select ON public.messaging_readiness FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

REVOKE ALL ON TABLE public.platform_messaging, public.relay_drafts, public.relay_jobs, public.relay_feedback,
  public.relay_quality_runs, public.relay_runtime, public.messaging_readiness FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.platform_messaging, public.relay_drafts, public.relay_jobs, public.relay_feedback,
  public.relay_quality_runs, public.relay_runtime, public.messaging_readiness TO authenticated;
GRANT ALL ON TABLE public.platform_messaging, public.relay_drafts, public.relay_jobs, public.relay_feedback,
  public.relay_quality_runs, public.relay_runtime, public.messaging_readiness TO service_role;

REVOKE ALL ON FUNCTION public.lead_sending_enabled() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_lead_sending(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ghl_dispatches_sending_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_people_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relay_claim_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relay_withdraw_for_lead(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relay_withdraw_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relay_expire_requests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_messaging_readiness(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_can_decide(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_lead_block(uuid, uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gate_decide(uuid, text, text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_mark_sent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gate_withdraw(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.lead_sending_enabled() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_lead_sending(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relay_claim_jobs(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.relay_withdraw_for_lead(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.relay_expire_requests() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_messaging_readiness(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gate_can_decide(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gate_lead_block(uuid, uuid[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.gate_decide(uuid, text, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gate_mark_sent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gate_withdraw(uuid, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'relay_drafts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.relay_drafts;
  END IF;
END $$;

-- config-registry:begin (generated from src/lib/config; do not edit by hand)
INSERT INTO public.config_fields (key, section, field_type, label, required, workspace_only, default_lock, tighten, owner_editable, rules, sort_order) VALUES
  ('identity.business_name', 'identity', 'text', 'Business name', true, true, false, NULL, NULL, $cfg${"minLength":2,"maxLength":120}$cfg$::jsonb, 1),
  ('identity.display_name', 'identity', 'text', 'Name used in messages', true, true, false, NULL, NULL, $cfg${"minLength":2,"maxLength":80}$cfg$::jsonb, 2),
  ('identity.timezone', 'identity', 'choice', 'Time zone', true, false, false, NULL, NULL, $cfg${"timezone":true}$cfg$::jsonb, 3),
  ('identity.business_hours', 'identity', 'schedule', 'Business hours', true, false, false, NULL, 'when_allowed', $cfg${}$cfg$::jsonb, 4),
  ('identity.owners_can_edit_hours', 'identity', 'boolean', 'Owners can change business hours', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 5),
  ('identity.primary_contact', 'identity', 'key_value', 'Primary contact', true, true, false, NULL, 'always', $cfg${"valueType":"text","keys":["name","email","phone"]}$cfg$::jsonb, 6),
  ('identity.escalation_contact', 'identity', 'key_value', 'Escalation contact', false, true, false, NULL, NULL, $cfg${"valueType":"text","keys":["name","email","phone"]}$cfg$::jsonb, 7),
  ('qualification.ready_criteria', 'qualification', 'list', 'Ready to buy when', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"itemMaxLength":200}$cfg$::jsonb, 8),
  ('qualification.not_ready_criteria', 'qualification', 'list', 'Needs nurturing when', false, false, false, NULL, NULL, $cfg${"maxItems":30,"itemMaxLength":200}$cfg$::jsonb, 9),
  ('qualification.disqualifiers', 'qualification', 'list', 'Stop pursuing when', false, false, false, NULL, NULL, $cfg${"maxItems":30,"itemFields":[{"key":"reason","type":"text","required":true,"maxLength":200},{"key":"closing_message","type":"long_text","maxLength":600}]}$cfg$::jsonb, 10),
  ('qualification.scoring_bands', 'qualification', 'list', 'Score bands', true, false, false, NULL, NULL, $cfg${"minItems":2,"maxItems":6,"uniqueBy":"name","itemFields":[{"key":"name","type":"text","required":true,"maxLength":40},{"key":"min_score","type":"number","required":true,"min":0,"max":100},{"key":"meaning","type":"text","required":true,"maxLength":200},{"key":"next_step","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 11),
  ('qualification.ready_threshold', 'qualification', 'number', 'Ready from score', true, false, false, NULL, NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 12),
  ('qualification.factor_weights', 'qualification', 'key_value', 'How much each factor counts', true, false, false, NULL, NULL, $cfg${"min":0,"max":100,"valueType":"number","keys":["timeline","investment_capacity","decision_authority","pain_severity"]}$cfg$::jsonb, 13),
  ('qualification.minimum_info', 'qualification', 'list', 'Must know before qualifying', false, false, false, NULL, NULL, $cfg${"maxItems":20,"itemMaxLength":60}$cfg$::jsonb, 14),
  ('response.first_touch_minutes', 'response', 'duration', 'First touch within', true, false, false, NULL, NULL, $cfg${"min":1,"max":10080,"integer":true}$cfg$::jsonb, 15),
  ('response.follow_up_cadence', 'response', 'list', 'Longest gap between touches, by stage', false, false, false, NULL, NULL, $cfg${"maxItems":12,"uniqueBy":"stage","itemFields":[{"key":"stage","type":"choice","required":true,"options":["new","working","call_booked","follow_up","objection_hold","no_show","ghost"]},{"key":"max_gap_hours","type":"number","required":true,"min":1,"max":2160}]}$cfg$::jsonb, 16),
  ('response.after_hours', 'response', 'choice', 'Outside business hours', true, false, false, NULL, NULL, $cfg${"options":["pause","keep_running","separate_window"]}$cfg$::jsonb, 17),
  ('response.after_hours_window_minutes', 'response', 'duration', 'After-hours window', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 18),
  ('response.counted_touch_types', 'response', 'multi_choice', 'Counts as a human touch', true, false, false, NULL, NULL, $cfg${"minItems":1,"options":["call","text","email"]}$cfg$::jsonb, 19),
  ('response.relay_counts_as_human_touch', 'response', 'boolean', 'An approved Relay message counts as a human touch', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 20),
  ('response.warning_threshold_percent', 'response', 'number', 'Nudge at', false, false, false, NULL, NULL, $cfg${"min":50,"max":95,"integer":true}$cfg$::jsonb, 21),
  ('response.ghost_days_soft', 'response', 'number', 'Going quiet after', true, false, false, NULL, NULL, $cfg${"min":1,"max":365,"integer":true}$cfg$::jsonb, 22),
  ('response.ghost_days_hard', 'response', 'number', 'Gone quiet after', true, false, false, NULL, NULL, $cfg${"min":2,"max":365,"integer":true}$cfg$::jsonb, 23),
  ('response.max_sequence_length', 'response', 'number', 'Most follow-ups in a row', false, false, false, NULL, NULL, $cfg${"min":1,"max":8,"integer":true}$cfg$::jsonb, 24),
  ('response.max_sequence_days', 'response', 'number', 'Follow-up runs for at most', false, false, false, NULL, NULL, $cfg${"min":1,"max":90,"integer":true}$cfg$::jsonb, 25),
  ('response.draft_stale_days', 'response', 'number', 'Unapproved drafts expire after', false, false, false, NULL, NULL, $cfg${"min":1,"max":14,"integer":true}$cfg$::jsonb, 26),
  ('response.quiet_lead_hours', 'response', 'number', 'A lead is quiet after', false, false, false, NULL, NULL, $cfg${"min":1,"max":720,"integer":true}$cfg$::jsonb, 27),
  ('response.untouched_window_days', 'response', 'number', 'Look back for untouched leads', false, false, false, NULL, NULL, $cfg${"min":1,"max":30,"integer":true}$cfg$::jsonb, 28),
  ('response.no_show_window_days', 'response', 'number', 'Rebook no-shows within', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 29),
  ('tone.formality', 'tone', 'choice', 'Formality', true, false, false, NULL, NULL, $cfg${"options":["formal","friendly","casual"]}$cfg$::jsonb, 30),
  ('tone.use_contractions', 'tone', 'boolean', 'Use contractions', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 31),
  ('tone.sender_identity', 'tone', 'text', 'Messages come from', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 32),
  ('tone.greeting', 'tone', 'text', 'Greeting', false, false, false, NULL, NULL, $cfg${"maxLength":60}$cfg$::jsonb, 33),
  ('tone.sign_off', 'tone', 'text', 'Sign-off', false, false, false, NULL, NULL, $cfg${"maxLength":80}$cfg$::jsonb, 34),
  ('tone.sms_max_chars', 'tone', 'number', 'Longest text message', true, false, false, NULL, NULL, $cfg${"min":40,"max":480,"integer":true}$cfg$::jsonb, 35),
  ('tone.email_max_chars', 'tone', 'number', 'Longest email', true, false, false, NULL, NULL, $cfg${"min":120,"max":4000,"integer":true}$cfg$::jsonb, 36),
  ('tone.emoji', 'tone', 'choice', 'Emoji', false, false, false, NULL, NULL, $cfg${"options":["never","sparing","natural"]}$cfg$::jsonb, 37),
  ('tone.punctuation_rules', 'tone', 'long_text', 'Punctuation rules', false, false, false, NULL, NULL, $cfg${"maxLength":500}$cfg$::jsonb, 38),
  ('tone.language', 'tone', 'choice', 'Language and spelling', false, false, false, NULL, NULL, $cfg${"options":["en-US","en-GB","en-CA","en-AU","es-US"]}$cfg$::jsonb, 39),
  ('tone.preferred_terms', 'tone', 'list', 'Words to use', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":80}$cfg$::jsonb, 40),
  ('tone.banned_terms', 'tone', 'list', 'Words and phrases to avoid', false, false, false, NULL, NULL, $cfg${"maxItems":200,"itemMaxLength":120}$cfg$::jsonb, 41),
  ('tone.examples', 'tone', 'list', 'Example messages', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"channel","type":"choice","required":true,"options":["sms","email"]},{"key":"body","type":"long_text","required":true,"maxLength":2000}]}$cfg$::jsonb, 42),
  ('industry.business_description', 'industry', 'text', 'What kind of business this is', true, false, false, NULL, NULL, $cfg${"minLength":5,"maxLength":200}$cfg$::jsonb, 43),
  ('industry.offers', 'industry', 'list', 'What the business sells', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":50,"uniqueBy":"name","itemFields":[{"key":"name","type":"text","required":true,"maxLength":100},{"key":"ticket_min","type":"number","min":0,"max":10000000},{"key":"ticket_max","type":"number","min":0,"max":10000000},{"key":"recurring","type":"boolean"}]}$cfg$::jsonb, 44),
  ('industry.case_facts', 'industry', 'list', 'Case-file facts', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":40,"uniqueBy":"key","itemFields":[{"key":"key","type":"text","required":true,"maxLength":60},{"key":"label","type":"text","required":true,"maxLength":80},{"key":"type","type":"choice","required":true,"options":["text","number","choice","yes_no","date"]},{"key":"required","type":"boolean"}]}$cfg$::jsonb, 45),
  ('industry.urgency_signals', 'industry', 'list', 'Act-now signals', false, false, false, NULL, NULL, $cfg${"maxItems":50,"itemMaxLength":120}$cfg$::jsonb, 46),
  ('industry.objections', 'industry', 'list', 'Objection library', false, false, false, NULL, NULL, $cfg${"maxItems":200,"uniqueBy":"label","itemFields":[{"key":"label","type":"text","required":true,"maxLength":80},{"key":"category","type":"choice","required":true,"options":["price","timing","spouse_partner","trust","fit","competitor","other"]},{"key":"recognize","type":"long_text","maxLength":500},{"key":"guidance","type":"long_text","maxLength":1000}]}$cfg$::jsonb, 47),
  ('industry.lead_sources', 'industry', 'list', 'Lead sources', false, false, false, NULL, NULL, $cfg${"maxItems":30,"uniqueBy":"source","itemFields":[{"key":"source","type":"text","required":true,"maxLength":80},{"key":"priority","type":"choice","required":true,"options":["high","normal","low"]},{"key":"treatment","type":"text","maxLength":300}]}$cfg$::jsonb, 48),
  ('escalation.levels', 'escalation', 'list', 'Who hears about what', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":8,"itemFields":[{"key":"severity","type":"choice","required":true,"options":["info","warning","urgent","critical"]},{"key":"trigger","type":"text","required":true,"maxLength":200},{"key":"after_windows","type":"number","min":1,"max":20},{"key":"notify","type":"multi_choice","required":true,"options":["assignee","setters","closers","managers","service_team"]},{"key":"channels","type":"multi_choice","required":true,"options":["push","email","sms","team_channel","discord"]}]}$cfg$::jsonb, 49),
  ('escalation.quiet_hours', 'escalation', 'choice', 'Quiet hours for the team', false, false, false, NULL, NULL, $cfg${"options":["outside_business_hours","none"]}$cfg$::jsonb, 50),
  ('escalation.urgent_exception', 'escalation', 'choice', 'Break quiet hours for', false, false, false, NULL, NULL, $cfg${"options":["critical","urgent_and_critical","none"]}$cfg$::jsonb, 51),
  ('escalation.unacknowledged_minutes', 'escalation', 'duration', 'If no one acknowledges within', false, false, false, NULL, NULL, $cfg${"min":5,"max":1440,"integer":true}$cfg$::jsonb, 52),
  ('escalation.unacknowledged_next', 'escalation', 'choice', 'Then tell', false, false, false, NULL, NULL, $cfg${"options":["assignee","setters","closers","managers","service_team"]}$cfg$::jsonb, 53),
  ('approval.actions', 'approval', 'list', 'What needs approval', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"uniqueBy":"action","itemFields":[{"key":"action","type":"choice","required":true,"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]},{"key":"mode","type":"choice","required":true,"options":["ask_first","auto_run","off"]},{"key":"approver","type":"choice","required":true,"options":["owners_and_managers","owner_only","assigned"]},{"key":"max_wait_minutes","type":"number","min":15,"max":10080},{"key":"auto_run_confirmed","type":"boolean"}]}$cfg$::jsonb, 54),
  ('approval.never_auto', 'approval', 'multi_choice', 'Always needs approval', false, false, true, 'superset_list', NULL, $cfg${"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]}$cfg$::jsonb, 55),
  ('approval.timeout_minutes', 'approval', 'duration', 'Waiting too long after', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 56),
  ('approval.timeout_behavior', 'approval', 'choice', 'When no one approves in time', false, false, false, NULL, NULL, $cfg${"options":["nothing","escalate","proceed"]}$cfg$::jsonb, 57),
  ('approval.timeout_proceed_confirmed', 'approval', 'boolean', 'I understand waiting items will proceed without approval', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 58),
  ('integrations.crm', 'integrations', 'reference', 'CRM', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 59),
  ('integrations.messaging_numbers', 'integrations', 'list', 'Messaging numbers', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"number","itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"number","type":"text","required":true,"maxLength":20},{"key":"provider","type":"choice","required":true,"options":["crm","telnyx"]},{"key":"sender_name","type":"text","maxLength":60}]}$cfg$::jsonb, 60),
  ('integrations.calendar', 'integrations', 'reference', 'Calendar', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 61),
  ('integrations.email_domain', 'integrations', 'text', 'Email sending domain', false, false, false, NULL, NULL, $cfg${"maxLength":120,"pattern":"^$|^([a-z0-9-]+\\.)+[a-z]{2,}$"}$cfg$::jsonb, 62),
  ('integrations.chat_channels', 'integrations', 'list', 'Chat channels', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"kind","type":"choice","required":true,"options":["slack","discord","teams"]},{"key":"connection_id","type":"text","required":true,"maxLength":64}]}$cfg$::jsonb, 63),
  ('integrations.file_folder', 'integrations', 'text', 'File storage folder', false, false, false, NULL, NULL, $cfg${"minLength":1,"maxLength":120}$cfg$::jsonb, 64),
  ('sources.allowed', 'sources', 'multi_choice', 'Agents may read', true, false, false, NULL, NULL, $cfg${"options":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 65),
  ('sources.retention_days', 'sources', 'key_value', 'Keep for (days)', false, false, false, NULL, NULL, $cfg${"min":30,"max":3650,"valueType":"number","keys":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 66),
  ('sources.agent_run_history_days', 'sources', 'number', 'Keep agent run history for (days)', false, false, false, NULL, NULL, $cfg${"min":7,"max":730,"integer":true}$cfg$::jsonb, 67),
  ('sources.scribe_calls_per_hour', 'sources', 'number', 'Calls Scribe reads per hour', false, false, false, NULL, NULL, $cfg${"min":1,"max":1000,"integer":true}$cfg$::jsonb, 68),
  ('sources.excluded', 'sources', 'list', 'Never read', false, false, false, NULL, NULL, $cfg${"maxItems":10,"uniqueBy":"source","itemFields":[{"key":"source","type":"choice","required":true,"options":["call_transcripts","email","text_messages","forms","crm_notes"]},{"key":"reason","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 69),
  ('sources.forsight_history_weeks', 'sources', 'number', 'Forsight shows (weeks)', false, false, false, NULL, NULL, $cfg${"min":4,"max":52,"integer":true}$cfg$::jsonb, 70),
  ('sources.forsight_quiet_days', 'sources', 'number', 'Forsight: going quiet after (days)', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 71),
  ('sources.forsight_silent_days', 'sources', 'number', 'Forsight: silent after (days)', false, false, false, NULL, NULL, $cfg${"min":2,"max":120,"integer":true}$cfg$::jsonb, 72),
  ('sources.forsight_long_silent_days', 'sources', 'number', 'Forsight: long silent after (days)', false, false, false, NULL, NULL, $cfg${"min":3,"max":365,"integer":true}$cfg$::jsonb, 73),
  ('sources.stellar_stage_labels', 'sources', 'key_value', 'Stellar build stage names', false, false, false, NULL, NULL, $cfg${"valueType":"text","keys":["getting_set_up","building_system","testing","live","running_smoothly"]}$cfg$::jsonb, 74),
  ('operators.assignment_mode', 'operators', 'choice', 'How leads are assigned', true, false, false, NULL, NULL, $cfg${"options":["manual","round_robin","by_source","by_service"]}$cfg$::jsonb, 75),
  ('operators.extra_permissions', 'operators', 'multi_choice', 'Operators may also', false, false, false, NULL, NULL, $cfg${"options":["view_unassigned_details","reassign_own_leads"]}$cfg$::jsonb, 76),
  ('operators.summary_time', 'operators', 'choice', 'Daily summary', false, false, false, NULL, NULL, $cfg${"options":["start_of_day","end_of_day"]}$cfg$::jsonb, 77),
  ('operators.summary_confirmer', 'operators', 'choice', 'Summaries are confirmed by', false, false, false, NULL, NULL, $cfg${"options":["operator","owner","service_team"]}$cfg$::jsonb, 78),
  ('compliance.opt_out_words', 'compliance', 'list', 'Opt-out words', false, false, true, 'superset_list', NULL, $cfg${"maxItems":30,"itemMaxLength":30}$cfg$::jsonb, 79),
  ('compliance.quiet_hours', 'compliance', 'time_window', 'No messages between', true, false, true, 'wider_window', NULL, $cfg${}$cfg$::jsonb, 80),
  ('compliance.quiet_hours_basis', 'compliance', 'choice', 'Quiet hours follow', false, false, true, NULL, NULL, $cfg${"options":["lead_local","workspace"]}$cfg$::jsonb, 81),
  ('compliance.daily_cap_per_lead', 'compliance', 'number', 'Most messages per lead per day', true, false, true, 'lower_number', NULL, $cfg${"min":1,"max":20,"integer":true}$cfg$::jsonb, 82),
  ('compliance.cap_applies_to', 'compliance', 'choice', 'The daily limit covers', false, false, true, NULL, NULL, $cfg${"options":["every_send","auto_run_only"]}$cfg$::jsonb, 83),
  ('compliance.weekly_cap_per_lead', 'compliance', 'number', 'Most messages per lead per week', false, false, true, 'lower_number_zero_is_unlimited', NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 84),
  ('compliance.required_disclosures', 'compliance', 'list', 'Required disclosures', false, false, true, 'superset_list', NULL, $cfg${"maxItems":10,"itemMaxLength":300}$cfg$::jsonb, 85)
ON CONFLICT (key) DO UPDATE SET section = EXCLUDED.section, field_type = EXCLUDED.field_type, label = EXCLUDED.label, required = EXCLUDED.required, workspace_only = EXCLUDED.workspace_only, default_lock = EXCLUDED.default_lock, tighten = EXCLUDED.tighten, owner_editable = EXCLUDED.owner_editable, rules = EXCLUDED.rules, sort_order = EXCLUDED.sort_order;
CREATE OR REPLACE FUNCTION public.config_profile_labels() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT $cfg${"signals":{"has_budget":"They can afford it","existing_revenue":"They already have revenue","urgent_timeline":"They want to start soon","sole_decision_maker":"They can decide alone","has_team":"They have a team behind them","clear_pain":"The problem is costing them now","tried_alternatives":"They have tried other things","right_industry":"They are in a market you serve","other":"Something else"},"disqualifiers":{"no_budget":"No budget at all","pre_revenue":"Pre-revenue","wrong_industry":"An industry you do not serve","needs_partner_approval":"Cannot decide without a partner","seeking_employment":"Looking for a job, not a service","out_of_geography":"Outside the places you work","competitor":"A competitor","other":"Something else"},"channels":{"meta_ads":"Facebook or Instagram ads","google_ads":"Google ads","youtube_ads":"YouTube ads","tiktok_ads":"TikTok ads","organic_social":"Organic social","email_list":"Your email list","referral":"Referrals","affiliate":"Affiliates or partners","webinar":"Webinars or masterclasses","cold_outbound":"Cold outbound","podcast":"Podcast","seo":"Search and content","events":"Live events","other":"Something else"},"offer_types":{"coaching":"Coaching","consulting":"Consulting","agency_service":"Agency service","course":"Course or programme","software":"Software","done_for_you":"Done-for-you delivery","other":"Something else"},"objection_types":{"price":"Price","timing":"Timing","spouse_partner":"Needs a partner's agreement","trust":"Trust","fit":"Fit","competitor":"Looking at someone else","other":"Something else"}}$cfg$::jsonb $fn$;
CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$ SELECT ARRAY['I hope this message finds you well', 'I hope you''re doing well', 'I wanted to reach out', 'just circling back', 'circling back', 'touching base', 'following up on our conversation', 'as we discussed', 'leverage', 'utilize', 'synergy', 'streamline', 'robust', 'seamless', 'journey', 'solution']::text[] $fn$;
SELECT public.config_seed_platform($cfg${"identity.timezone":"America/New_York","identity.business_hours":{"days":{"mon":[{"start":"08:00","end":"18:00"}],"tue":[{"start":"08:00","end":"18:00"}],"wed":[{"start":"08:00","end":"18:00"}],"thu":[{"start":"08:00","end":"18:00"}],"fri":[{"start":"08:00","end":"18:00"}],"sat":[],"sun":[]},"closures":[]},"identity.owners_can_edit_hours":false,"qualification.not_ready_criteria":[],"qualification.disqualifiers":[],"qualification.scoring_bands":[{"name":"Cold","min_score":0,"meaning":"Interested, but not ready to decide.","next_step":"Keep in touch with useful, low-pressure follow-up."},{"name":"Warm","min_score":40,"meaning":"Engaged, with some of what they need in place.","next_step":"Fill the gaps: timing, budget, and who decides."},{"name":"Hot","min_score":60,"meaning":"Ready to buy now.","next_step":"Call today and book the next step."}],"qualification.ready_threshold":60,"qualification.factor_weights":{"timeline":35,"investment_capacity":30,"decision_authority":20,"pain_severity":15},"qualification.minimum_info":[],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":72},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"response.after_hours":"keep_running","response.after_hours_window_minutes":120,"response.counted_touch_types":["call","text","email"],"response.relay_counts_as_human_touch":true,"response.warning_threshold_percent":75,"response.ghost_days_soft":14,"response.ghost_days_hard":30,"response.max_sequence_length":3,"response.max_sequence_days":21,"response.draft_stale_days":5,"response.quiet_lead_hours":48,"response.untouched_window_days":3,"response.no_show_window_days":7,"tone.formality":"casual","tone.use_contractions":true,"tone.sender_identity":"","tone.greeting":"","tone.sign_off":"","tone.sms_max_chars":240,"tone.email_max_chars":900,"tone.emoji":"never","tone.punctuation_rules":"","tone.language":"en-US","tone.preferred_terms":[],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution"],"tone.examples":[],"industry.business_description":"a business that sells through conversations with its leads","industry.urgency_signals":[],"industry.objections":[],"industry.lead_sources":[],"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]}],"escalation.quiet_hours":"outside_business_hours","escalation.urgent_exception":"critical","escalation.unacknowledged_minutes":60,"escalation.unacknowledged_next":"managers","approval.actions":[{"action":"first_reply","mode":"ask_first","approver":"owners_and_managers"},{"action":"quiet_lead_follow_up","mode":"ask_first","approver":"owners_and_managers"},{"action":"no_show_rebook","mode":"ask_first","approver":"owners_and_managers"},{"action":"client_report","mode":"ask_first","approver":"owners_and_managers"},{"action":"crm_stage_change","mode":"ask_first","approver":"owners_and_managers"},{"action":"setter_nudge","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"owner_escalation","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"slack_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"discord_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"drive_store","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_text","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_email","mode":"ask_first","approver":"owners_and_managers"},{"action":"create_asset","mode":"ask_first","approver":"owners_and_managers"}],"approval.never_auto":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","send_text","send_email"],"approval.timeout_minutes":240,"approval.timeout_behavior":"escalate","approval.timeout_proceed_confirmed":false,"integrations.crm":null,"integrations.messaging_numbers":[],"integrations.calendar":null,"integrations.email_domain":"","integrations.chat_channels":[],"integrations.file_folder":"Vistrial","sources.allowed":["call_transcripts","email","text_messages","forms","crm_notes"],"sources.retention_days":{"call_transcripts":365,"email":365,"text_messages":365,"forms":365,"crm_notes":365},"sources.agent_run_history_days":90,"sources.scribe_calls_per_hour":120,"sources.excluded":[],"sources.forsight_history_weeks":12,"sources.forsight_quiet_days":7,"sources.forsight_silent_days":14,"sources.forsight_long_silent_days":30,"sources.stellar_stage_labels":{"getting_set_up":"Getting set up","building_system":"Building your system","testing":"Testing","live":"Live","running_smoothly":"Running smoothly"},"operators.assignment_mode":"manual","operators.extra_permissions":[],"operators.summary_time":"start_of_day","operators.summary_confirmer":"operator","compliance.opt_out_words":[],"compliance.quiet_hours":{"start":"20:00","end":"08:00"},"compliance.quiet_hours_basis":"workspace","compliance.daily_cap_per_lead":2,"compliance.cap_applies_to":"auto_run_only","compliance.weekly_cap_per_lead":0,"compliance.required_disclosures":[]}$cfg$::jsonb, ARRAY['approval.never_auto', 'compliance.opt_out_words', 'compliance.quiet_hours', 'compliance.quiet_hours_basis', 'compliance.daily_cap_per_lead', 'compliance.cap_applies_to', 'compliance.weekly_cap_per_lead', 'compliance.required_disclosures']::text[], $cfg${"compliance.opt_out_words":["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"],"compliance.cap_applies_to":"every_send","compliance.quiet_hours_basis":"lead_local","response.after_hours":"pause"}$cfg$::jsonb, 'Launch compliance rules, switched on deliberately: opt-out words stop all messages; the daily per-lead limit covers every send; quiet hours (8pm to 8am) follow the lead''s local time; and the first-touch clock pauses outside business hours.');
SELECT public.config_seed_template('med-spa', 'Med Spa', 'Injectables, facials, laser and skin treatments, body contouring, and memberships.', $cfg${"industry.business_description":"a med spa offering injectables, facials, laser and skin treatments, and body contouring","industry.offers":[{"name":"Injectables (wrinkle relaxers and fillers)","ticket_min":300,"ticket_max":1500,"recurring":false},{"name":"Facials and peels","ticket_min":150,"ticket_max":400,"recurring":false},{"name":"Laser and skin treatments","ticket_min":300,"ticket_max":2500,"recurring":false},{"name":"Body contouring","ticket_min":600,"ticket_max":4000,"recurring":false},{"name":"Membership","ticket_min":99,"ticket_max":299,"recurring":true}],"industry.case_facts":[{"key":"treatment_interest","label":"Treatment of interest","type":"text","required":true},{"key":"concern","label":"What they want to change","type":"text","required":false},{"key":"prior_treatments","label":"Treatments they have had before","type":"text","required":false},{"key":"timeline","label":"When they want it done","type":"text","required":true},{"key":"budget_comfort","label":"Budget they are comfortable with","type":"text","required":false},{"key":"consultation_preference","label":"In-person or virtual consultation","type":"text","required":false}],"industry.urgency_signals":["An upcoming event, like a wedding, holiday, or trip","As soon as possible","This week","Asks about a promotion before it ends","Asks for the next available appointment"],"industry.objections":[{"label":"Cost","category":"price","recognize":"\"How much is it?\", \"That's more than I thought\", \"Do you have payment plans?\"","guidance":"Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure."},{"label":"Nervous about the treatment","category":"trust","recognize":"\"Does it hurt?\", \"I'm worried it will look fake\", \"What if something goes wrong?\"","guidance":"Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results."},{"label":"Timing","category":"timing","recognize":"\"Not right now\", \"Maybe after the holidays\", \"I'm too busy this month\"","guidance":"Ask whether there is an event or date they have in mind, and offer to hold a time that suits them."},{"label":"Trust in the provider","category":"trust","recognize":"\"Who does the treatment?\", \"Are they certified?\", \"Can I see before-and-after photos?\"","guidance":"Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first."},{"label":"Needs to think about it","category":"fit","recognize":"\"Let me think about it\", \"I'll get back to you\"","guidance":"Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure."}],"industry.lead_sources":[{"source":"Website booking form","priority":"high","treatment":"Reply quickly; they already chose a time slot or treatment."},{"source":"Google search","priority":"high","treatment":"Usually ready to book. Lead with availability."},{"source":"Instagram or Facebook ads","priority":"normal","treatment":"Often browsing. Start with the treatment they clicked on."},{"source":"Referral from a client","priority":"high","treatment":"Mention who referred them and thank them."}],"qualification.ready_criteria":["Asks about a specific treatment or its price.","Asks about availability or the next open appointment.","Has had a consultation or treatment with us before.","Mentions an event or a date they want to look their best for."],"qualification.not_ready_criteria":["General browsing with no treatment in mind.","Asks only about price, with no interest in a specific treatment.","Says they are \"just looking\"."],"qualification.disqualifiers":[{"reason":"Lives outside the area we serve.","closing_message":"Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby."},{"reason":"Below the minimum age for treatment.","closing_message":"Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in."},{"reason":"Wants a treatment we do not offer.","closing_message":"Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does."}],"qualification.minimum_info":["treatment_interest","timeline"],"response.first_touch_minutes":5,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":4},{"stage":"follow_up","max_gap_hours":24},{"stage":"objection_hold","max_gap_hours":24},{"stage":"no_show","max_gap_hours":4}],"response.ghost_days_soft":3,"response.ghost_days_hard":7,"response.max_sequence_days":7,"tone.formality":"friendly","tone.emoji":"sparing","tone.sms_max_chars":300,"tone.punctuation_rules":"At most one exclamation mark per message. No capitals for emphasis.","tone.preferred_terms":["consultation","treatment plan","provider","results vary"],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed results","cure","permanent","risk-free","pain-free","act now","last chance","limited time only"],"tone.examples":[{"channel":"sms","body":"Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?"},{"channel":"email","body":"Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('home-services', 'Home Services', 'Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.', $cfg${"industry.business_description":"a local home services company doing recurring and one-time jobs at people's homes","identity.business_hours":{"days":{"mon":[{"start":"07:00","end":"18:00"}],"tue":[{"start":"07:00","end":"18:00"}],"wed":[{"start":"07:00","end":"18:00"}],"thu":[{"start":"07:00","end":"18:00"}],"fri":[{"start":"07:00","end":"18:00"}],"sat":[{"start":"08:00","end":"14:00"}],"sun":[]},"closures":[]},"industry.offers":[{"name":"Recurring service (cleaning, lawn care, pest control)","ticket_min":100,"ticket_max":400,"recurring":true},{"name":"One-time job","ticket_min":150,"ticket_max":1500,"recurring":false},{"name":"Repair or emergency call-out","ticket_min":150,"ticket_max":800,"recurring":false},{"name":"Large project (roofing, HVAC replacement, remodeling)","ticket_min":3000,"ticket_max":40000,"recurring":false}],"industry.case_facts":[{"key":"service_type","label":"Service needed","type":"text","required":true},{"key":"property_type","label":"Property type (house, apartment, business)","type":"text","required":false},{"key":"property_size","label":"Property size","type":"text","required":false},{"key":"service_area","label":"Address or area","type":"text","required":true},{"key":"timing","label":"When they need it","type":"text","required":true},{"key":"frequency","label":"One-time or recurring","type":"text","required":false},{"key":"access_notes","label":"Access notes (gate code, pets, parking)","type":"text","required":false}],"industry.urgency_signals":["today","leak","flooding","broken","no heat","no AC","emergency","A move-in or move-out date"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"That's expensive\", \"Can you do it cheaper?\"","guidance":"Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job."},{"label":"Availability","category":"timing","recognize":"\"When can you come?\", \"I need it sooner than that\"","guidance":"Give the earliest real date. If an emergency, say what you can do today."},{"label":"Trust and reviews","category":"trust","recognize":"\"Are you insured?\", \"Do you have reviews?\"","guidance":"Confirm licensing and insurance, and share where to read reviews."},{"label":"Getting other quotes","category":"competitor","recognize":"\"I'm getting a few quotes\", \"Someone else quoted less\"","guidance":"That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days."},{"label":"Timing","category":"timing","recognize":"\"Not until next month\", \"After the holidays\"","guidance":"Offer to book a date now so they keep the slot, and set a reminder."}],"industry.lead_sources":[{"source":"Google local listing","priority":"high","treatment":"Usually needs help soon. Reply with the earliest date."},{"source":"Website quote form","priority":"high","treatment":"Confirm the job and the address, then give a time."},{"source":"Referral","priority":"high","treatment":"Mention who referred them."},{"source":"Lead marketplace (Angi, Thumbtack)","priority":"normal","treatment":"Reply fast; they contacted several companies."},{"source":"Flyers and door hangers","priority":"low","treatment":"Often price shopping. Lead with a clear starting price."}],"qualification.ready_criteria":["Described a specific job.","Gave an address or the area they are in.","Asked for a quote or a date.","Mentioned something urgent, like a leak or a broken system."],"qualification.not_ready_criteria":["Curious about prices in general.","Comparing many providers with no date in mind."],"qualification.disqualifiers":[{"reason":"Outside our service area.","closing_message":"Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful."},{"reason":"A job type we do not offer.","closing_message":"Thanks for asking. That's not a job we do, but a specialist will be able to help."},{"reason":"Below our minimum job size.","closing_message":"Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time."}],"qualification.minimum_info":["service_type","service_area","timing"],"response.first_touch_minutes":10,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":24},{"stage":"follow_up","max_gap_hours":48},{"stage":"objection_hold","max_gap_hours":48},{"stage":"no_show","max_gap_hours":24}],"response.ghost_days_soft":7,"response.ghost_days_hard":21,"response.max_sequence_days":14,"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]},{"severity":"urgent","trigger":"A lead mentions an emergency, like a leak, flooding, or no heat.","notify":["assignee","managers"],"channels":["push","sms"]}],"tone.formality":"friendly","tone.sms_max_chars":200,"tone.email_max_chars":600,"tone.punctuation_rules":"Plain words and short sentences. No exclamation marks in quotes or prices.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","kindly","do not hesitate","per our conversation"],"tone.examples":[{"channel":"sms","body":"Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?"},{"channel":"sms","body":"Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('coaches-consultants', 'Coaches and Consultants', 'High-ticket programs, group programs, one-to-one coaching, and consulting engagements.', $cfg${"industry.business_description":"a high-ticket coaching or consulting business that sells through sales calls","industry.offers":[{"name":"High-ticket program","ticket_min":3000,"ticket_max":25000,"recurring":false},{"name":"Group program","ticket_min":500,"ticket_max":5000,"recurring":false},{"name":"One-to-one coaching","ticket_min":1000,"ticket_max":10000,"recurring":true},{"name":"Consulting engagement","ticket_min":5000,"ticket_max":50000,"recurring":false}],"industry.case_facts":[{"key":"stated_goal","label":"What they want to achieve","type":"text","required":true},{"key":"current_situation","label":"Where they are now","type":"text","required":false},{"key":"budget_range","label":"Budget range","type":"text","required":true},{"key":"decision_maker","label":"Who makes the decision","type":"text","required":true},{"key":"timeline","label":"When they want to start","type":"text","required":true},{"key":"previous_coaching","label":"Coaching or consulting they have had before","type":"text","required":false},{"key":"objections_raised","label":"Objections raised on the call","type":"text","required":false}],"industry.urgency_signals":["A stated deadline","A launch date coming up","\"Ready to start\"","A recent trigger event, like losing a client or new funding"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"It's a lot of money right now\", \"I can't justify that\"","guidance":"Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists."},{"label":"Timing","category":"timing","recognize":"\"Now's not the right time\", \"Maybe next quarter\"","guidance":"Ask what would need to be true for the timing to be right, and what waiting costs them."},{"label":"Needs to talk to a partner or team","category":"spouse_partner","recognize":"\"I need to talk to my partner\", \"I have to run it by my team\"","guidance":"Offer a short call with the other decision-maker, and send a one-page summary they can share."},{"label":"Skeptical about results","category":"trust","recognize":"\"How do I know this will work for me?\"","guidance":"Share a relevant client story with specifics, and be honest about what the program needs from them."},{"label":"Past bad experience","category":"trust","recognize":"\"I've done a program before and it didn't work\"","guidance":"Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider."}],"industry.lead_sources":[{"source":"Referral","priority":"high","treatment":"Mention who referred them; trust is already there."},{"source":"Paid social ads","priority":"normal","treatment":"Confirm the problem they want solved before talking about the offer."},{"source":"Webinar or podcast","priority":"normal","treatment":"Reference what they watched or heard."},{"source":"Email list","priority":"normal","treatment":"They know you; ask what prompted them to reply now."}],"qualification.ready_criteria":["Has stated a clear problem and the goal they want.","Has acknowledged the budget.","The decision-maker is on the call.","Has stated a timeline for starting.","Has engaged with earlier touches."],"qualification.not_ready_criteria":["Curious, but with no clear goal.","No budget for this yet.","Needs approval from someone who is not on the call."],"qualification.disqualifiers":[{"reason":"Not at the right stage for the offer.","closing_message":"Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there."},{"reason":"No decision-making authority, with no path to the person who has it.","closing_message":null},{"reason":"Unwilling to commit to the program format.","closing_message":"Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it."}],"qualification.minimum_info":["stated_goal","budget_range","decision_maker","timeline"],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":96},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"tone.formality":"friendly","tone.punctuation_rules":"Confident and plain. No hype, no exclamation marks in follow-ups after a call.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed","life-changing","secret","hack","only a few spots left"],"tone.examples":[{"channel":"sms","body":"Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call."},{"channel":"email","body":"Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work?"}]}$cfg$::jsonb);
-- config-registry:end
