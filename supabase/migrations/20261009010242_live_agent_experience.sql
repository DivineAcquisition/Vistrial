-- Live agent experience: one shared, customer-safe record of what agents do.
--
-- agent_activity_runs     one piece of work by one agent in one workspace
-- agent_activity_steps    the visible stages of a run, in order
-- agent_activity_events   timestamped happenings, the live feed's source
-- agent_activity_outputs  what a run produced (summary, score, draft, change)
-- agent_activity_staff    technical detail, staff only
-- agent_presence_controls pause and resume, per workspace and agent
-- user_preferences        calm mode
--
-- Everything is written by the service role (jobs, the simulator, server
-- actions after their own checks). Signed-in people only read, and only what
-- agent_activity_visible() allows; Realtime applies the same policies to every
-- change it delivers, so the live channel cannot leak across workspaces.
-- The Operator agent's runtime tables (agent_runs, agent_run_steps) stay
-- staff-only and unchanged.

-- ---------------------------------------------------------------------------
-- 1. Test workspaces. Only a Platform Admin (or a job) may flag one.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_test_workspace boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_test_workspace IS
  'A workspace for testing. The agent simulator and synthetic samples run only here. Only a Platform Admin can set it.';

CREATE OR REPLACE FUNCTION public.organizations_guard_test_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_test_workspace IS DISTINCT FROM OLD.is_test_workspace
     AND public.ws_end_user_request()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can mark a workspace for testing.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_guard_test_flag ON public.organizations;
CREATE TRIGGER organizations_guard_test_flag
  BEFORE UPDATE OF is_test_workspace ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_guard_test_flag();

-- ---------------------------------------------------------------------------
-- 2. Who may see an agent's activity.
--   Staff and Owners: everything in the workspace (Compass: their own only).
--   Members: everything except other people's Compass conversations.
--   Operators: activity on leads they may see, and their own Compass runs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agent_activity_visible(
  p_org_id uuid,
  p_lead_id uuid,
  p_agent_id text,
  p_actor_member_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE public.ws_access(p_org_id)
      WHEN 'platform_admin' THEN true
      WHEN 'service_team' THEN true
      WHEN 'owner' THEN p_agent_id <> 'compass' OR p_actor_member_id = public.user_member_id(p_org_id)
      WHEN 'member' THEN p_agent_id <> 'compass' OR p_actor_member_id = public.user_member_id(p_org_id)
      WHEN 'operator' THEN
        (p_agent_id = 'compass' AND p_actor_member_id = public.user_member_id(p_org_id))
        OR (
          p_agent_id <> 'compass'
          AND p_lead_id IS NOT NULL
          AND p_lead_id IN (SELECT public.operator_visible_lead_ids())
        )
      ELSE false
    END,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.agent_activity_visible(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_activity_visible(uuid, uuid, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Runs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_activity_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  lead_id uuid REFERENCES public.leads (id) ON DELETE SET NULL,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  trigger_key text NOT NULL,
  subject_label text NOT NULL,
  subject_href text,
  status text NOT NULL DEFAULT 'queued',
  current_step_label text,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_summary text,
  plain_error text,
  needs_person jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  config_version text,
  batch_id uuid,
  simulated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_progress_at timestamptz NOT NULL DEFAULT now(),
  stuck_flagged_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_activity_runs_id_org UNIQUE (id, org_id),
  CONSTRAINT agent_activity_runs_trigger UNIQUE (org_id, agent_id, trigger_key),
  CONSTRAINT agent_activity_runs_agent CHECK (agent_id IN ('sentry', 'scribe', 'relay', 'compass')),
  CONSTRAINT agent_activity_runs_status CHECK (status IN (
    'queued', 'working', 'waiting_person', 'waiting_provider', 'paused',
    'completed', 'needs_person', 'failed', 'stopped', 'expired', 'stuck'
  )),
  CONSTRAINT agent_activity_runs_plan_array CHECK (jsonb_typeof(plan) = 'array'),
  CONSTRAINT agent_activity_runs_sources_array CHECK (jsonb_typeof(sources) = 'array'),
  CONSTRAINT agent_activity_runs_subject_present CHECK (btrim(subject_label) <> ''),
  CONSTRAINT agent_activity_runs_text_lengths CHECK (
    char_length(subject_label) <= 200
    AND (current_step_label IS NULL OR char_length(current_step_label) <= 200)
    AND (reason_summary IS NULL OR char_length(reason_summary) <= 2000)
    AND (plain_error IS NULL OR char_length(plain_error) <= 600)
  )
);

COMMENT ON TABLE public.agent_activity_runs IS
  'One piece of work by one agent, start to finish. Customer-safe: plain language and references only, never transcript or message text.';

CREATE INDEX IF NOT EXISTS agent_activity_runs_org_recent_idx
  ON public.agent_activity_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_activity_runs_org_agent_idx
  ON public.agent_activity_runs (org_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_activity_runs_lead_idx
  ON public.agent_activity_runs (lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_activity_runs_open_idx
  ON public.agent_activity_runs (status, last_progress_at)
  WHERE status IN ('queued', 'working', 'waiting_provider');

-- A simulated run can only ever exist in a test workspace.
CREATE OR REPLACE FUNCTION public.agent_activity_runs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.simulated AND NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = NEW.org_id AND o.is_test_workspace
  ) THEN
    RAISE EXCEPTION 'Simulated agent activity is only allowed in a test workspace.' USING ERRCODE = '42501';
  END IF;
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'agent_activity_runs.lead_id must belong to the same workspace';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_activity_runs_guard ON public.agent_activity_runs;
CREATE TRIGGER agent_activity_runs_guard
  BEFORE INSERT OR UPDATE ON public.agent_activity_runs
  FOR EACH ROW EXECUTE FUNCTION public.agent_activity_runs_guard();

-- ---------------------------------------------------------------------------
-- 4. Steps, events, outputs. Each carries the run's workspace, agent, lead and
-- actor so visibility (and Realtime) is checked on the row itself.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_activity_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_id uuid NOT NULL,
  agent_id text NOT NULL,
  lead_id uuid,
  actor_member_id uuid,
  seq integer NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'working',
  detail text,
  reason text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  CONSTRAINT agent_activity_steps_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.agent_activity_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT agent_activity_steps_run_seq UNIQUE (run_id, seq),
  CONSTRAINT agent_activity_steps_status CHECK (status IN ('pending', 'working', 'done', 'failed', 'skipped', 'waiting', 'paused')),
  CONSTRAINT agent_activity_steps_label_len CHECK (btrim(label) <> '' AND char_length(label) <= 200),
  CONSTRAINT agent_activity_steps_text_len CHECK (
    (detail IS NULL OR char_length(detail) <= 2000) AND (reason IS NULL OR char_length(reason) <= 2000)
  )
);

CREATE INDEX IF NOT EXISTS agent_activity_steps_run_idx ON public.agent_activity_steps (run_id, seq);

CREATE TABLE IF NOT EXISTS public.agent_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_id uuid NOT NULL,
  agent_id text NOT NULL,
  lead_id uuid,
  actor_member_id uuid,
  kind text NOT NULL,
  label text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_activity_events_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.agent_activity_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT agent_activity_events_kind CHECK (kind IN (
    'run_started', 'step_started', 'step_finished', 'output', 'input_needed',
    'approval_requested', 'approval_given', 'approval_rejected', 'error',
    'run_finished', 'paused', 'resumed', 'stuck', 'waiting_provider'
  )),
  CONSTRAINT agent_activity_events_label_len CHECK (btrim(label) <> '' AND char_length(label) <= 300)
);

CREATE INDEX IF NOT EXISTS agent_activity_events_org_recent_idx
  ON public.agent_activity_events (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS agent_activity_events_run_idx
  ON public.agent_activity_events (run_id, occurred_at);

CREATE TABLE IF NOT EXISTS public.agent_activity_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_id uuid NOT NULL,
  agent_id text NOT NULL,
  lead_id uuid,
  actor_member_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_activity_outputs_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.agent_activity_runs (id, org_id) ON DELETE CASCADE,
  CONSTRAINT agent_activity_outputs_kind CHECK (kind IN ('summary', 'score', 'draft', 'alert', 'file', 'change', 'answer', 'note')),
  CONSTRAINT agent_activity_outputs_title_len CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  CONSTRAINT agent_activity_outputs_body_len CHECK (body IS NULL OR char_length(body) <= 8000)
);

CREATE INDEX IF NOT EXISTS agent_activity_outputs_run_idx ON public.agent_activity_outputs (run_id, created_at);

CREATE TABLE IF NOT EXISTS public.agent_activity_staff (
  run_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_detail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_activity_staff_run_fkey FOREIGN KEY (run_id, org_id)
    REFERENCES public.agent_activity_runs (id, org_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.agent_activity_staff IS
  'Technical run detail (durations, retries, model, raw errors). Service Team and Platform Admin only.';

-- Children copy the run's scope so a writer cannot attach a step to the wrong lead.
CREATE OR REPLACE FUNCTION public.agent_activity_child_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run public.agent_activity_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.agent_activity_runs WHERE id = NEW.run_id AND org_id = NEW.org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown agent run';
  END IF;
  NEW.agent_id := v_run.agent_id;
  NEW.lead_id := v_run.lead_id;
  NEW.actor_member_id := v_run.actor_member_id;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_activity_steps', 'agent_activity_events', 'agent_activity_outputs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS agent_activity_child_scope ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER agent_activity_child_scope BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.agent_activity_child_scope()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Pause and resume, per workspace and agent.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_presence_controls (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  changed_by_name text,
  reason text,
  PRIMARY KEY (org_id, agent_id),
  CONSTRAINT agent_presence_controls_agent CHECK (agent_id IN ('sentry', 'scribe', 'relay', 'compass')),
  CONSTRAINT agent_presence_controls_reason_len CHECK (reason IS NULL OR char_length(reason) <= 300)
);

-- Owners and staff pause and resume. Logged in the workspace activity log.
CREATE OR REPLACE FUNCTION public.set_agent_paused(
  p_org_id uuid,
  p_agent_id text,
  p_paused boolean,
  p_reason text DEFAULT NULL
)
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
  SELECT COALESCE(NULLIF(btrim(m.display_name), ''), m.email) INTO v_name
  FROM public.org_members m
  WHERE m.id = v_member;

  INSERT INTO public.agent_presence_controls (org_id, agent_id, paused, changed_at, changed_by_member_id, changed_by_name, reason)
  VALUES (p_org_id, p_agent_id, p_paused, now(), v_member, v_name, NULLIF(btrim(COALESCE(p_reason, '')), ''))
  ON CONFLICT (org_id, agent_id) DO UPDATE
    SET paused = EXCLUDED.paused,
        changed_at = EXCLUDED.changed_at,
        changed_by_member_id = EXCLUDED.changed_by_member_id,
        changed_by_name = EXCLUDED.changed_by_name,
        reason = EXCLUDED.reason
  RETURNING * INTO v_row;

  -- Open runs show paused, and continue or stop when resumed or cancelled.
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

REVOKE ALL ON FUNCTION public.set_agent_paused(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agent_paused(uuid, text, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Calm mode and other personal display settings.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  calm_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Approval and input requests: one shared request per decision.
-- ---------------------------------------------------------------------------

INSERT INTO public.approval_action_types (action_type, area, reaches_people, default_mode)
VALUES ('agent_question', 'sales', false, 'ask_first')
ON CONFLICT (action_type) DO NOTHING;

ALTER TABLE public.approval_items
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.agent_activity_runs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS answer_text text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_items_agent_id') THEN
    ALTER TABLE public.approval_items
      ADD CONSTRAINT approval_items_agent_id CHECK (agent_id IS NULL OR agent_id IN ('sentry', 'scribe', 'relay', 'compass')),
      ADD CONSTRAINT approval_items_answer_len CHECK (answer_text IS NULL OR char_length(answer_text) <= 2000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS approval_items_run_idx ON public.approval_items (run_id) WHERE run_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. Stuck runs. Anything working without progress past the limit is marked,
-- given an event, and returned so the job can tell the Service Team.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agent_activity_mark_stuck(p_minutes integer DEFAULT 10)
RETURNS TABLE (run_id uuid, org_id uuid, agent_id text, subject_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stuck AS (
    UPDATE public.agent_activity_runs r
      SET status = 'stuck', stuck_flagged_at = now(), current_step_label = NULL,
          plain_error = COALESCE(r.plain_error, 'This stopped making progress. The Vistrial team has been told.')
      WHERE r.status IN ('working', 'queued')
        AND r.last_progress_at < now() - make_interval(mins => GREATEST(p_minutes, 1))
      RETURNING r.id, r.org_id, r.agent_id, r.subject_label
  ), ev AS (
    INSERT INTO public.agent_activity_events (org_id, run_id, agent_id, kind, label)
    SELECT s.org_id, s.id, s.agent_id, 'stuck', 'Stopped making progress'
    FROM stuck s
  )
  SELECT s.id, s.org_id, s.agent_id, s.subject_label FROM stuck s;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_activity_mark_stuck(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_activity_mark_stuck(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Row level security.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_activity_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_presence_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_activity_runs_select ON public.agent_activity_runs;
CREATE POLICY agent_activity_runs_select ON public.agent_activity_runs FOR SELECT TO authenticated
  USING (public.agent_activity_visible(org_id, lead_id, agent_id, actor_member_id));

DROP POLICY IF EXISTS agent_activity_steps_select ON public.agent_activity_steps;
CREATE POLICY agent_activity_steps_select ON public.agent_activity_steps FOR SELECT TO authenticated
  USING (public.agent_activity_visible(org_id, lead_id, agent_id, actor_member_id));

DROP POLICY IF EXISTS agent_activity_events_select ON public.agent_activity_events;
CREATE POLICY agent_activity_events_select ON public.agent_activity_events FOR SELECT TO authenticated
  USING (public.agent_activity_visible(org_id, lead_id, agent_id, actor_member_id));

DROP POLICY IF EXISTS agent_activity_outputs_select ON public.agent_activity_outputs;
CREATE POLICY agent_activity_outputs_select ON public.agent_activity_outputs FOR SELECT TO authenticated
  USING (public.agent_activity_visible(org_id, lead_id, agent_id, actor_member_id));

DROP POLICY IF EXISTS agent_activity_staff_select ON public.agent_activity_staff;
CREATE POLICY agent_activity_staff_select ON public.agent_activity_staff FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()));

DROP POLICY IF EXISTS agent_presence_controls_select ON public.agent_presence_controls;
CREATE POLICY agent_presence_controls_select ON public.agent_presence_controls FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS user_preferences_own ON public.user_preferences;
CREATE POLICY user_preferences_own ON public.user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE
  public.agent_activity_runs, public.agent_activity_steps, public.agent_activity_events,
  public.agent_activity_outputs, public.agent_activity_staff, public.agent_presence_controls,
  public.user_preferences
FROM PUBLIC, anon;

GRANT SELECT ON TABLE
  public.agent_activity_runs, public.agent_activity_steps, public.agent_activity_events,
  public.agent_activity_outputs, public.agent_activity_staff, public.agent_presence_controls
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_preferences TO authenticated;

GRANT ALL ON TABLE
  public.agent_activity_runs, public.agent_activity_steps, public.agent_activity_events,
  public.agent_activity_outputs, public.agent_activity_staff, public.agent_presence_controls,
  public.user_preferences
TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Live delivery. Realtime checks the SELECT policies above for every
-- subscriber and every change.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'agent_activity_runs', 'agent_activity_steps', 'agent_activity_events',
    'agent_activity_outputs', 'agent_presence_controls', 'approval_items'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
