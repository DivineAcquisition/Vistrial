-- Home screen: approval gate settings, the approval queue, and their history.
-- Additive only. No existing table or column changes shape.
--
-- Every action Vistrial can take on a workspace's behalf has a type. Each
-- workspace decides per type whether it asks first (goes to the approval
-- queue), runs on its own, or never happens. A type with no workspace row
-- falls back to the registry default, and a type with no registry row is
-- treated as ask first: nothing new ever starts running on its own.

-- ---------------------------------------------------------------------------
-- Registry. One row per action type that exists in code. Adding an action
-- type (including one from a future area) is a migration that inserts here.
-- reaches_people is the database's own record of which actions message a lead
-- or a client, so the owner-only rule below cannot be talked around by a
-- caller passing its own flag.
-- ---------------------------------------------------------------------------

CREATE TABLE public.approval_action_types (
  action_type text PRIMARY KEY,
  area text NOT NULL,
  reaches_people boolean NOT NULL,
  default_mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_action_types_key_format CHECK (action_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  CONSTRAINT approval_action_types_area_format CHECK (area ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT approval_action_types_default_mode CHECK (default_mode IN ('ask_first', 'auto_run', 'off')),
  -- Anything that reaches a real person ships asking first.
  CONSTRAINT approval_action_types_people_ask_first CHECK (NOT reaches_people OR default_mode = 'ask_first')
);

COMMENT ON TABLE public.approval_action_types IS
  'Action types Vistrial can perform. Mirrors src/lib/home/catalog.ts. Seeded by migration only.';

INSERT INTO public.approval_action_types (action_type, area, reaches_people, default_mode)
VALUES
  ('quiet_lead_follow_up', 'sales', true, 'ask_first'),
  ('no_show_rebook', 'sales', true, 'ask_first'),
  ('first_reply', 'sales', true, 'ask_first'),
  ('client_report', 'sales', true, 'ask_first'),
  ('crm_stage_change', 'sales', false, 'ask_first'),
  ('setter_nudge', 'sales', false, 'auto_run'),
  ('owner_escalation', 'sales', false, 'auto_run')
ON CONFLICT (action_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Workspace-wide limits on what runs on its own.
-- ---------------------------------------------------------------------------

CREATE TABLE public.approval_gate_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  quiet_hours_start time NOT NULL DEFAULT '20:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  daily_send_limit_per_lead integer NOT NULL DEFAULT 2,
  queue_wait_limit_minutes integer NOT NULL DEFAULT 240,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_gate_settings_send_limit CHECK (daily_send_limit_per_lead BETWEEN 1 AND 20),
  CONSTRAINT approval_gate_settings_wait_limit CHECK (queue_wait_limit_minutes BETWEEN 15 AND 10080)
);

COMMENT ON TABLE public.approval_gate_settings IS
  'Quiet hours, per-lead daily send limit, and queue wait limit for one workspace. Missing row means defaults.';
COMMENT ON COLUMN public.approval_gate_settings.reviewed_at IS
  'When the onboarding approval step was saved or skipped. Skipping keeps the defaults.';

CREATE TRIGGER approval_gate_settings_set_updated_at
  BEFORE UPDATE ON public.approval_gate_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per action type: mode and who may approve.
-- ---------------------------------------------------------------------------

CREATE TABLE public.approval_gate_actions (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  action_type text NOT NULL REFERENCES public.approval_action_types (action_type) ON DELETE CASCADE,
  mode text NOT NULL,
  approver text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, action_type),
  CONSTRAINT approval_gate_actions_mode CHECK (mode IN ('ask_first', 'auto_run', 'off')),
  CONSTRAINT approval_gate_actions_approver CHECK (approver IN ('owner_only', 'owners_and_managers', 'assigned'))
);

COMMENT ON TABLE public.approval_gate_actions IS
  'Workspace choice per action type. Missing row means the registry default and owners_and_managers.';

CREATE TRIGGER approval_gate_actions_set_updated_at
  BEFORE UPDATE ON public.approval_gate_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- History. Every change, who made it, and when. Written only by the setter
-- functions below.
-- ---------------------------------------------------------------------------

CREATE TABLE public.approval_gate_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  actor_user_id uuid,
  actor_label text NOT NULL,
  action_type text,
  field text NOT NULL,
  from_value text,
  to_value text,
  CONSTRAINT approval_gate_changes_field CHECK (field IN (
    'mode', 'approver', 'quiet_hours_start', 'quiet_hours_end',
    'daily_send_limit_per_lead', 'queue_wait_limit_minutes', 'reviewed'
  ))
);

CREATE INDEX approval_gate_changes_org_created_idx
  ON public.approval_gate_changes (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- The approval queue. One row is one decision a person makes: a batch of
-- drafts of the same kind for leads with the same assignee, or one task.
-- drafts holds, per lead, what would be sent and what happened when it ran,
-- so a partial failure retries only what did not go out.
-- ---------------------------------------------------------------------------

CREATE TABLE public.approval_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  area text NOT NULL DEFAULT 'sales',
  kind text NOT NULL,
  action_type text NOT NULL REFERENCES public.approval_action_types (action_type),
  status text NOT NULL DEFAULT 'pending',
  urgency smallint NOT NULL DEFAULT 50,
  title text NOT NULL,
  preview text,
  reason text,
  lead_ids uuid[] NOT NULL DEFAULT '{}',
  assigned_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  drafts jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_mode text,
  decided_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  decided_at timestamptz,
  dismiss_reason text,
  failure_reason text,
  attempt_count integer NOT NULL DEFAULT 0,
  escalated_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_items_kind_format CHECK (kind ~ '^[a-z][a-z0-9_]{2,63}$'),
  CONSTRAINT approval_items_status CHECK (status IN ('pending', 'running', 'failed', 'succeeded', 'dismissed')),
  CONSTRAINT approval_items_run_mode CHECK (run_mode IS NULL OR run_mode IN ('approved', 'auto_run')),
  CONSTRAINT approval_items_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT approval_items_drafts_array CHECK (jsonb_typeof(drafts) = 'array'),
  CONSTRAINT approval_items_dismiss_reason_len CHECK (dismiss_reason IS NULL OR char_length(dismiss_reason) <= 500),
  -- Succeeded with no named approver must have been allowed to auto-run.
  CONSTRAINT approval_items_succeeded_has_mode CHECK (status <> 'succeeded' OR run_mode IS NOT NULL),
  CONSTRAINT approval_items_approved_has_person CHECK (
    run_mode IS DISTINCT FROM 'approved' OR decided_by_member_id IS NOT NULL
  ),
  CONSTRAINT approval_items_org_dedupe_key UNIQUE (org_id, dedupe_key)
);

COMMENT ON TABLE public.approval_items IS
  'Drafts and tasks waiting on a person. Written by the service role after the app checks the approver.';

CREATE INDEX approval_items_org_open_idx
  ON public.approval_items (org_id, urgency, created_at)
  WHERE status IN ('pending', 'running', 'failed');
CREATE INDEX approval_items_org_assignee_idx
  ON public.approval_items (org_id, assigned_member_id)
  WHERE status IN ('pending', 'running', 'failed');
CREATE INDEX approval_items_lead_ids_idx
  ON public.approval_items USING gin (lead_ids);

CREATE TRIGGER approval_items_set_updated_at
  BEFORE UPDATE ON public.approval_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A lead in this item must belong to the same workspace.
CREATE OR REPLACE FUNCTION public.approval_items_same_org_leads()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF cardinality(NEW.lead_ids) = 0 THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.lead_ids) AS item(lead_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = item.lead_id AND l.org_id = NEW.org_id
    )
  ) THEN
    RAISE EXCEPTION 'approval_items.lead_ids must belong to the same org';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER approval_items_same_org_leads
  BEFORE INSERT OR UPDATE OF lead_ids, org_id ON public.approval_items
  FOR EACH ROW EXECUTE FUNCTION public.approval_items_same_org_leads();

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approval_gate_mode(p_org_id uuid, p_action_type text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT a.mode FROM public.approval_gate_actions a
      WHERE a.org_id = p_org_id AND a.action_type = p_action_type),
    (SELECT t.default_mode FROM public.approval_action_types t WHERE t.action_type = p_action_type),
    'ask_first'
  );
$$;

COMMENT ON FUNCTION public.approval_gate_mode(uuid, text) IS
  'Effective mode. An action type nobody registered asks first.';

-- ---------------------------------------------------------------------------
-- Writes. Owners only. Each changed field leaves a history row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approval_gate_actor(p_org_id uuid)
RETURNS TABLE (member_id uuid, label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, COALESCE(NULLIF(btrim(m.display_name), ''), m.email, 'Divine Acquisition')
  FROM public.org_members m
  WHERE m.org_id = p_org_id AND m.user_id = auth.uid() AND m.active
  UNION ALL
  SELECT NULL::uuid, 'Divine Acquisition'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.user_id = auth.uid() AND m.active
  )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.approval_gate_require_owner(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_org_role(p_org_id, 'owner') THEN
    RAISE EXCEPTION 'Only an owner can change approval settings.' USING ERRCODE = '42501';
  END IF;
END;
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
  v_actor record;
BEGIN
  PERFORM public.approval_gate_require_owner(p_org_id);

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
  -- Stated on its own so it survives if managers are ever allowed to edit
  -- the internal rows.
  IF v_type.reaches_people AND p_mode = 'auto_run' AND NOT public.user_has_org_role(p_org_id, 'owner') THEN
    RAISE EXCEPTION 'Only an owner can let messages to leads or clients send without review.'
      USING ERRCODE = '42501';
  END IF;

  SELECT mode, approver INTO v_old_mode, v_old_approver
  FROM public.approval_gate_actions
  WHERE org_id = p_org_id AND action_type = p_action_type
  FOR UPDATE;
  v_old_mode := COALESCE(v_old_mode, v_type.default_mode);
  v_old_approver := COALESCE(v_old_approver, 'owners_and_managers');

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

CREATE OR REPLACE FUNCTION public.set_approval_gate_limits(
  p_org_id uuid,
  p_quiet_hours_start time,
  p_quiet_hours_end time,
  p_daily_send_limit_per_lead integer,
  p_queue_wait_limit_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.approval_gate_settings%ROWTYPE;
  v_actor record;
BEGIN
  PERFORM public.approval_gate_require_owner(p_org_id);

  INSERT INTO public.approval_gate_settings (org_id) VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;
  SELECT * INTO v_old FROM public.approval_gate_settings WHERE org_id = p_org_id FOR UPDATE;

  UPDATE public.approval_gate_settings
  SET quiet_hours_start = p_quiet_hours_start,
      quiet_hours_end = p_quiet_hours_end,
      daily_send_limit_per_lead = p_daily_send_limit_per_lead,
      queue_wait_limit_minutes = p_queue_wait_limit_minutes
  WHERE org_id = p_org_id;

  SELECT * INTO v_actor FROM public.approval_gate_actor(p_org_id);

  INSERT INTO public.approval_gate_changes
    (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
  SELECT p_org_id, v_actor.member_id, auth.uid(), v_actor.label, NULL, c.field, c.from_value, c.to_value
  FROM (
    VALUES
      ('quiet_hours_start', to_char(v_old.quiet_hours_start, 'HH24:MI'), to_char(p_quiet_hours_start, 'HH24:MI')),
      ('quiet_hours_end', to_char(v_old.quiet_hours_end, 'HH24:MI'), to_char(p_quiet_hours_end, 'HH24:MI')),
      ('daily_send_limit_per_lead', v_old.daily_send_limit_per_lead::text, p_daily_send_limit_per_lead::text),
      ('queue_wait_limit_minutes', v_old.queue_wait_limit_minutes::text, p_queue_wait_limit_minutes::text)
  ) AS c(field, from_value, to_value)
  WHERE c.from_value IS DISTINCT FROM c.to_value;
END;
$$;

-- Saving or skipping the onboarding step. Owners and admins walk the wizard;
-- marking it reviewed changes no setting, so admins may do it too.
CREATE OR REPLACE FUNCTION public.mark_approval_gate_reviewed(p_org_id uuid, p_skipped boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_was timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_org_role(p_org_id, 'owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can finish this step.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.approval_gate_settings (org_id) VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;
  SELECT reviewed_at INTO v_was FROM public.approval_gate_settings WHERE org_id = p_org_id FOR UPDATE;
  IF v_was IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public.approval_gate_settings SET reviewed_at = now() WHERE org_id = p_org_id;

  SELECT * INTO v_actor FROM public.approval_gate_actor(p_org_id);
  INSERT INTO public.approval_gate_changes
    (org_id, actor_member_id, actor_user_id, actor_label, action_type, field, from_value, to_value)
  VALUES
    (p_org_id, v_actor.member_id, auth.uid(), v_actor.label, NULL, 'reviewed', NULL,
     CASE WHEN p_skipped THEN 'skipped' ELSE 'saved' END);
END;
$$;

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE public.approval_action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_gate_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_gate_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_gate_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_action_types_select
  ON public.approval_action_types FOR SELECT TO authenticated
  USING (true);

-- Everyone in the workspace reads the modes: the queue shows who can approve
-- and the log shows how something ran.
CREATE POLICY approval_gate_settings_select
  ON public.approval_gate_settings FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY approval_gate_actions_select
  ON public.approval_gate_actions FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY approval_gate_changes_select
  ON public.approval_gate_changes FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner'));

-- Owners and admins see the whole queue. Everyone else sees what is theirs.
CREATE POLICY approval_items_select
  ON public.approval_items FOR SELECT TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    OR (
      assigned_member_id IS NOT NULL
      AND assigned_member_id = public.user_member_id(org_id)
    )
  );

REVOKE ALL ON TABLE public.approval_action_types FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.approval_gate_settings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.approval_gate_actions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.approval_gate_changes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.approval_items FROM PUBLIC, anon;

GRANT SELECT ON public.approval_action_types TO authenticated;
GRANT SELECT ON public.approval_gate_settings TO authenticated;
GRANT SELECT ON public.approval_gate_actions TO authenticated;
GRANT SELECT ON public.approval_gate_changes TO authenticated;
GRANT SELECT ON public.approval_items TO authenticated;

GRANT ALL ON TABLE public.approval_action_types TO service_role;
GRANT ALL ON TABLE public.approval_gate_settings TO service_role;
GRANT ALL ON TABLE public.approval_gate_actions TO service_role;
GRANT ALL ON TABLE public.approval_gate_changes TO service_role;
GRANT ALL ON TABLE public.approval_items TO service_role;

REVOKE ALL ON FUNCTION public.approval_gate_mode(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_gate_actor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_gate_require_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_approval_gate_action(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_approval_gate_limits(uuid, time, time, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_approval_gate_reviewed(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_items_same_org_leads() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approval_gate_mode(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approval_gate_actor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approval_gate_require_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_approval_gate_action(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_approval_gate_limits(uuid, time, time, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_approval_gate_reviewed(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- The job that drafts queue items, runs auto-run ones, and escalates waits.
-- ---------------------------------------------------------------------------

INSERT INTO public.ops_job_catalog (job_name, cron_expr, interval_seconds, grace_seconds, check_first)
VALUES (
  'home-agents',
  '*/15 * * * *',
  900,
  900,
  'Open /api/cron/home-agents logs and approval_items created in the last hour. Confirm CRON_SECRET and that Vercel Cron still lists this path.'
)
ON CONFLICT (job_name) DO NOTHING;
