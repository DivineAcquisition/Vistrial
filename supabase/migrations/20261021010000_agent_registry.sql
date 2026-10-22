-- Prompt 24, step 1: the agent registry, the one decision on whether an agent
-- may run, the Postgres copy of the live record, and the shared summary.
--
-- 1. agent_areas and agent_registry hold every agent Vistrial can host. They
--    start from src/lib/agents/roster.ts (a test keeps the seed identical).
--    Every table that names an agent now points at the registry instead of a
--    typed list, so Assay and any later agent are known everywhere at once.
-- 2. Plan requirements are registry data, enforced through entitlement_check
--    ('agent:<id>') and agent_may_run.
-- 3. Pause and the platform halt are written in Postgres (audited) and read
--    from Postgres by every agent. The "Stop all agents" switch is enforced.
-- 4. live_record_copy keeps the Postgres copy of the agent activity record
--    that every screen reads: idempotent, newest-wins, safe fields only.
-- 5. agent_summary returns, in one call, everything the sidebar, status strip,
--    panel, crew band, Decisions counts and badges need, scoped by row-level
--    security to the person asking.

-- ---------------------------------------------------------------------------
-- 1. Areas and agents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_areas (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 40),
  description text NOT NULL CHECK (char_length(description) <= 300),
  record_kind text NOT NULL CHECK (record_kind ~ '^[a-z_]{2,30}$'),
  work_page jsonb,
  home_page jsonb,
  availability text NOT NULL CHECK (availability IN ('available', 'coming_soon')),
  sort integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.agent_areas IS
  'Areas of work agents serve (Sales, Client Retention). An area with no enabled agent never appears in a customer sidebar.';

CREATE TABLE IF NOT EXISTS public.agent_registry (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  area_id text REFERENCES public.agent_areas (id),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 40),
  sublabel text NOT NULL CHECK (char_length(sublabel) <= 60),
  description text NOT NULL CHECK (char_length(description) <= 200),
  long_description text NOT NULL CHECK (char_length(long_description) <= 1000),
  glyph text NOT NULL CHECK (glyph IN ('scroll', 'shield', 'send', 'compass', 'scale', 'spark')),
  accent text NOT NULL CHECK (accent IN ('brand', 'chart-2', 'info', 'chart-4', 'chart-3', 'neutral')),
  promise text NOT NULL CHECK (char_length(promise) <= 300),
  works_on text[] NOT NULL DEFAULT '{}',
  availability text NOT NULL CHECK (availability IN ('available', 'beta', 'coming_soon')),
  beta_org_ids uuid[] NOT NULL DEFAULT '{}',
  included_plans text[] NOT NULL DEFAULT '{}',
  add_on boolean NOT NULL DEFAULT false,
  locked_reason text NOT NULL CHECK (char_length(locked_reason) <= 300),
  prerequisites text[] NOT NULL DEFAULT '{}',
  autonomy jsonb NOT NULL DEFAULT '{"automatic": [], "suggests": [], "never": []}'::jsonb,
  config_sections text[] NOT NULL DEFAULT '{}',
  sort integer NOT NULL,
  starts_on boolean NOT NULL DEFAULT false,
  private_runs boolean NOT NULL DEFAULT false,
  activity_source text NOT NULL DEFAULT 'runs' CHECK (activity_source IN ('runs', 'scores')),
  output_source text NOT NULL DEFAULT 'activity' CHECK (output_source IN ('activity', 'requests', 'windows', 'tiers')),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT agent_registry_autonomy_shape CHECK (
    jsonb_typeof(autonomy -> 'automatic') = 'array'
    AND jsonb_typeof(autonomy -> 'suggests') = 'array'
    AND jsonb_typeof(autonomy -> 'never') = 'array'
  )
);

COMMENT ON TABLE public.agent_registry IS
  'Every agent Vistrial can host. Seeded from src/lib/agents/roster.ts. Plan requirements here are enforced by entitlement_check and agent_may_run.';
COMMENT ON COLUMN public.agent_registry.beta_org_ids IS
  'Workspaces in a beta cohort. Never returned to customers.';

CREATE TABLE IF NOT EXISTS public.agent_registry_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('agent', 'area')),
  entry_id text NOT NULL,
  version integer NOT NULL,
  entry jsonb NOT NULL,
  note text NOT NULL CHECK (btrim(note) <> '' AND char_length(note) <= 500),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, entry_id, version)
);

ALTER TABLE public.agent_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_registry_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_areas, public.agent_registry, public.agent_registry_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_areas, public.agent_registry, public.agent_registry_versions TO service_role;

-- Descriptions are not secret. The beta cohort is.
GRANT SELECT ON public.agent_areas TO authenticated;
GRANT SELECT (
  id, area_id, name, sublabel, description, long_description, glyph, accent, promise, works_on,
  availability, included_plans, add_on, locked_reason, prerequisites, autonomy, config_sections,
  sort, starts_on, private_runs, activity_source, output_source, version, updated_at
) ON public.agent_registry TO authenticated;
GRANT SELECT ON public.agent_registry_versions TO authenticated;

DROP POLICY IF EXISTS agent_areas_select ON public.agent_areas;
CREATE POLICY agent_areas_select ON public.agent_areas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS agent_registry_select ON public.agent_registry;
CREATE POLICY agent_registry_select ON public.agent_registry FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS agent_registry_versions_select ON public.agent_registry_versions;
CREATE POLICY agent_registry_versions_select ON public.agent_registry_versions FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- agent-registry-seed (generated from src/lib/agents/roster.ts; a test checks it)
DO $do$
DECLARE
  v_seed jsonb := $seed${"areas":[{"id":"sales","name":"Sales","description":"Agents that turn new leads into booked work.","record_kind":"lead","work_page":{"label":"Case Files","href":"/app/cases","roles":["owner","operator","service_team","platform_admin"]},"home_page":{"href":"/app/agents","roles":["owner","service_team","platform_admin"]},"availability":"available","sort":1},{"id":"client_retention","name":"Client Retention","description":"Agents that keep your clients coming back.","record_kind":"customer","work_page":null,"home_page":null,"availability":"coming_soon","sort":2}],"agents":[{"id":"scribe","area_id":"sales","name":"Scribe","sublabel":"Sales Analyst","description":"Turns your calls, emails and texts into case files.","long_description":"Scribe reads each sales call and conversation and keeps a case file for every lead: what they want, when, and what is still unclear. It asks you when it is unsure of a fact.","glyph":"scroll","accent":"brand","promise":"Scribe never contacts a lead and never changes your CRM.","works_on":["call","case_file"],"availability":"available","included_plans":["private_access","custom","internal","pilot"],"add_on":false,"locked_reason":"Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.","prerequisites":["call_source"],"autonomy":{"automatic":["Builds and updates case files from your calls"],"suggests":["Asks you when it is unsure of a fact"],"never":["Contacts a lead","Changes your CRM"]},"config_sections":["qualification","industry","sources"],"sort":2,"starts_on":false,"private_runs":false,"activity_source":"runs","output_source":"activity"},{"id":"sentry","area_id":"sales","name":"Sentry","sublabel":"Pipeline Manager","description":"Watches your response times and flags leads waiting too long.","long_description":"Sentry starts a reply window when a new lead arrives and watches it against your business hours. When a lead waits too long, it tells the right person on your team.","glyph":"shield","accent":"chart-2","promise":"Sentry only alerts your team. It never sends anything to a lead.","works_on":["lead","task"],"availability":"available","included_plans":["private_access","custom","internal","pilot"],"add_on":false,"locked_reason":"Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.","prerequisites":["crm_connected"],"autonomy":{"automatic":["Watches reply windows on new leads","Alerts your team when a lead waits too long"],"suggests":["Suggests tasks you accept or dismiss"],"never":["Sends anything to a lead","Chases leads from before you connected"]},"config_sections":["response","escalation"],"sort":1,"starts_on":false,"private_runs":false,"activity_source":"runs","output_source":"windows"},{"id":"relay","area_id":"sales","name":"Relay","sublabel":"Sales Development Rep","description":"Drafts your follow-ups and sends them once you approve.","long_description":"Relay drafts follow-ups after calls and after missed reply windows, in your tone. Every draft waits for a person to approve it, and you send it from your CRM.","glyph":"send","accent":"info","promise":"Relay never sends anything. You approve each draft and send it from your CRM.","works_on":["lead"],"availability":"available","included_plans":["private_access","custom","internal","pilot"],"add_on":false,"locked_reason":"Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.","prerequisites":["crm_connected"],"autonomy":{"automatic":["Drafts follow-ups after calls and missed reply windows"],"suggests":["Every draft waits under Decisions waiting"],"never":["Sends a message. You approve each draft and send it from your CRM"]},"config_sections":["tone","approval","compliance"],"sort":3,"starts_on":false,"private_runs":false,"activity_source":"runs","output_source":"requests"},{"id":"compass","area_id":null,"name":"Compass","sublabel":"Sales Director","description":"Answers your questions, coordinates the team, and reports what it did.","long_description":"Compass answers questions about your leads, calls and numbers from the records you can already open. It can suggest a draft, a task, or a case file refresh, and nothing happens until you confirm.","glyph":"compass","accent":"chart-4","promise":"Compass only reads. It never sends a message, and nothing changes until you confirm a suggestion.","works_on":["lead","case_file","booking","task"],"availability":"available","included_plans":["private_access","custom","internal","pilot"],"add_on":false,"locked_reason":"Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.","prerequisites":[],"autonomy":{"automatic":["Answers questions from records you can open"],"suggests":["Drafts, tasks, and case file refreshes, only after you confirm"],"never":["Sends a message","Changes anything without your tap"]},"config_sections":["approval","integrations"],"sort":0,"starts_on":false,"private_runs":true,"activity_source":"runs","output_source":"activity"},{"id":"assay","area_id":"sales","name":"Assay","sublabel":"Lead Qualifier","description":"Scores your leads and puts your queue in order.","long_description":"Assay scores every lead from what they did, what fits your business, and what was said on calls, and keeps your list in order. Each score shows the reasons that raised or lowered it.","glyph":"scale","accent":"chart-3","promise":"Assay only scores and orders your leads. It never contacts a lead, and past leads are scored quietly.","works_on":["lead","task"],"availability":"available","included_plans":["private_access","custom","internal","pilot"],"add_on":false,"locked_reason":"Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.","prerequisites":[],"autonomy":{"automatic":["Scores leads and puts your list in order"],"suggests":["Who to work next, with the reasons"],"never":["Contacts a lead","Alerts you about past leads. They are scored quietly"]},"config_sections":[],"sort":4,"starts_on":true,"private_runs":false,"activity_source":"scores","output_source":"tiers"}]}$seed$::jsonb;
BEGIN
  INSERT INTO public.agent_areas (id, name, description, record_kind, work_page, home_page, availability, sort)
  SELECT a.id, a.name, a.description, a.record_kind, a.work_page, a.home_page, a.availability, a.sort
  FROM jsonb_to_recordset(v_seed -> 'areas') AS a(
    id text, name text, description text, record_kind text, work_page jsonb, home_page jsonb, availability text, sort integer
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.agent_registry (
    id, area_id, name, sublabel, description, long_description, glyph, accent, promise, works_on,
    availability, included_plans, add_on, locked_reason, prerequisites, autonomy, config_sections,
    sort, starts_on, private_runs, activity_source, output_source
  )
  SELECT r.id, r.area_id, r.name, r.sublabel, r.description, r.long_description, r.glyph, r.accent, r.promise,
    ARRAY(SELECT jsonb_array_elements_text(r.works_on)), r.availability,
    ARRAY(SELECT jsonb_array_elements_text(r.included_plans)), r.add_on, r.locked_reason,
    ARRAY(SELECT jsonb_array_elements_text(r.prerequisites)), r.autonomy,
    ARRAY(SELECT jsonb_array_elements_text(r.config_sections)),
    r.sort, r.starts_on, r.private_runs, r.activity_source, r.output_source
  FROM jsonb_to_recordset(v_seed -> 'agents') AS r(
    id text, area_id text, name text, sublabel text, description text, long_description text, glyph text,
    accent text, promise text, works_on jsonb, availability text, included_plans jsonb, add_on boolean,
    locked_reason text, prerequisites jsonb, autonomy jsonb, config_sections jsonb, sort integer,
    starts_on boolean, private_runs boolean, activity_source text, output_source text
  )
  ON CONFLICT (id) DO NOTHING;
END
$do$;

INSERT INTO public.agent_registry_versions (kind, entry_id, version, entry, note)
SELECT 'area', a.id, a.version, to_jsonb(a), 'Seeded from the agent roster.'
FROM public.agent_areas a
ON CONFLICT (kind, entry_id, version) DO NOTHING;

INSERT INTO public.agent_registry_versions (kind, entry_id, version, entry, note)
SELECT 'agent', r.id, r.version, to_jsonb(r) - 'beta_org_ids', 'Seeded from the agent roster.'
FROM public.agent_registry r
ON CONFLICT (kind, entry_id, version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Every agent column points at the registry. No more typed lists.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_activity_runs DROP CONSTRAINT IF EXISTS agent_activity_runs_agent;
ALTER TABLE public.agent_activity_runs
  ADD CONSTRAINT agent_activity_runs_agent FOREIGN KEY (agent_id) REFERENCES public.agent_registry (id) NOT VALID;
ALTER TABLE public.agent_activity_runs VALIDATE CONSTRAINT agent_activity_runs_agent;

ALTER TABLE public.agent_presence_controls DROP CONSTRAINT IF EXISTS agent_presence_controls_agent;
ALTER TABLE public.agent_presence_controls
  ADD CONSTRAINT agent_presence_controls_agent FOREIGN KEY (agent_id) REFERENCES public.agent_registry (id) NOT VALID;
ALTER TABLE public.agent_presence_controls VALIDATE CONSTRAINT agent_presence_controls_agent;

ALTER TABLE public.approval_items DROP CONSTRAINT IF EXISTS approval_items_agent_id;
ALTER TABLE public.approval_items
  ADD CONSTRAINT approval_items_agent_id FOREIGN KEY (agent_id) REFERENCES public.agent_registry (id) NOT VALID;
ALTER TABLE public.approval_items VALIDATE CONSTRAINT approval_items_agent_id;

ALTER TABLE public.platform_agent_halts DROP CONSTRAINT IF EXISTS platform_agent_halts_agent_id_check;
ALTER TABLE public.platform_agent_halts DROP CONSTRAINT IF EXISTS platform_agent_halts_agent;
ALTER TABLE public.platform_agent_halts
  ADD CONSTRAINT platform_agent_halts_agent FOREIGN KEY (agent_id) REFERENCES public.agent_registry (id) NOT VALID;
ALTER TABLE public.platform_agent_halts VALIDATE CONSTRAINT platform_agent_halts_agent;

ALTER TABLE public.workspace_agent_activation DROP CONSTRAINT IF EXISTS workspace_agent_activation_agent_id_check;
ALTER TABLE public.workspace_agent_activation DROP CONSTRAINT IF EXISTS workspace_agent_activation_agent;
ALTER TABLE public.workspace_agent_activation
  ADD CONSTRAINT workspace_agent_activation_agent FOREIGN KEY (agent_id) REFERENCES public.agent_registry (id) NOT VALID;
ALTER TABLE public.workspace_agent_activation VALIDATE CONSTRAINT workspace_agent_activation_agent;

-- Assay has scored every workspace since it shipped, so it is On everywhere.
-- New workspaces get the same row for every agent that starts on.
CREATE OR REPLACE FUNCTION public.agent_activation_starts_on()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order, activated_at, activated_by_label, note)
  SELECT NEW.id, r.id, 'on', 0, now(), 'Vistrial', 'On from the start for every workspace.'
  FROM public.agent_registry r
  WHERE r.starts_on
  ON CONFLICT (org_id, agent_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_activation_starts_on ON public.organizations;
CREATE TRIGGER agent_activation_starts_on
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.agent_activation_starts_on();

INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order, activated_at, activated_by_label, note)
SELECT o.id, r.id, 'on', 0, now(), 'Vistrial', 'On for every workspace when the registry was created.'
FROM public.organizations o
CROSS JOIN public.agent_registry r
WHERE r.starts_on
ON CONFLICT (org_id, agent_id) DO NOTHING;

-- Tier changes for "Show its work", newest first per workspace.
CREATE INDEX IF NOT EXISTS lead_score_history_org_recent_idx
  ON public.lead_score_history (org_id, created_at DESC)
  WHERE NOT historic;

CREATE INDEX IF NOT EXISTS agent_activity_outputs_org_agent_idx
  ON public.agent_activity_outputs (org_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS approval_items_agent_open_idx
  ON public.approval_items (org_id, agent_id)
  WHERE agent_id IS NOT NULL AND status IN ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- 3. Plans, and the one decision on whether an agent may run
-- ---------------------------------------------------------------------------

-- Whether the workspace's plan includes the agent. An override with key
-- 'agent:<id>' wins until it expires, like every other entitlement.
CREATE OR REPLACE FUNCTION public.agent_plan_allows(p_org_id uuid, p_agent_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override boolean;
  v_plan text;
BEGIN
  SELECT o.enabled INTO v_override
  FROM public.billing_overrides o
  WHERE o.org_id = p_org_id AND o.entitlement_key = 'agent:' || p_agent_id AND o.enabled IS NOT NULL
    AND (o.expires_at IS NULL OR o.expires_at > now())
  ORDER BY o.created_at DESC
  LIMIT 1;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;
  SELECT a.plan_id INTO v_plan FROM public.billing_accounts a WHERE a.org_id = p_org_id;
  RETURN EXISTS (
    SELECT 1 FROM public.agent_registry r
    WHERE r.id = p_agent_id AND v_plan IS NOT NULL AND v_plan = ANY (r.included_plans)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_plan_allows(uuid, text) FROM PUBLIC, anon, authenticated;

-- Overrides may name one agent ('agent:relay'), so staff can grant or lock a
-- single agent for one workspace without a plan change.
ALTER TABLE public.billing_overrides DROP CONSTRAINT IF EXISTS billing_overrides_entitlement_key_check;
ALTER TABLE public.billing_overrides ADD CONSTRAINT billing_overrides_entitlement_key_check
  CHECK (entitlement_key ~ '^[a-z_]{2,40}$' OR entitlement_key ~ '^agent:[a-z][a-z0-9_]{1,39}$');
GRANT EXECUTE ON FUNCTION public.agent_plan_allows(uuid, text) TO service_role;

-- Whether this agent may act in this workspace right now. Every agent asks
-- this before working; a failed read waits. Order matters: the most
-- fundamental reason is reported.
CREATE OR REPLACE FUNCTION public.agent_may_run(p_org_id uuid, p_agent_id text, p_sample boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.agent_registry%ROWTYPE;
  v_status text;
  v_halted_all boolean;
  v_stage text;
BEGIN
  SELECT * INTO r FROM public.agent_registry WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;
  SELECT o.status::text, COALESCE(o.agents_halted, false) INTO v_status, v_halted_all
  FROM public.organizations o WHERE o.id = p_org_id;
  IF v_status IS NULL OR v_status NOT IN ('active', 'onboarding') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'workspace');
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_agent_halts h WHERE h.agent_id = p_agent_id AND h.halted) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paused', 'by', 'vistrial');
  END IF;
  IF v_halted_all THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paused', 'by', 'workspace_stop');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_presence_controls c
    WHERE c.org_id = p_org_id AND c.agent_id = p_agent_id AND c.paused
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paused', 'by', 'person');
  END IF;
  IF r.availability = 'coming_soon'
     OR (r.availability = 'beta' AND NOT (p_org_id = ANY (r.beta_org_ids))) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_available');
  END IF;
  IF NOT public.agent_plan_allows(p_org_id, p_agent_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;
  SELECT a.stage INTO v_stage FROM public.workspace_agent_activation a WHERE a.org_id = p_org_id AND a.agent_id = p_agent_id;
  -- Staged activation: an agent acts only once switched on. The onboarding
  -- sample is the one exception, and it never reaches a real lead.
  IF NOT p_sample AND v_stage IS NOT NULL AND v_stage NOT IN ('on', 'watch', 'drafts_only') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_activated');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_may_run(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_may_run(uuid, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The Postgres copy of the live record
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_activity_runs ADD COLUMN IF NOT EXISTS source_at timestamptz;
ALTER TABLE public.agent_activity_runs ADD COLUMN IF NOT EXISTS copied_at timestamptz;
ALTER TABLE public.agent_activity_steps ADD COLUMN IF NOT EXISTS source_at timestamptz;
ALTER TABLE public.agent_activity_events ADD COLUMN IF NOT EXISTS copied_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.agent_activity_runs.source_at IS
  'When the newest applied change happened at its source. An older change arriving late is ignored.';
COMMENT ON COLUMN public.agent_activity_events.copied_at IS
  'When the event reached Postgres. copied_at minus occurred_at is the delay to the screens.';

CREATE INDEX IF NOT EXISTS agent_activity_events_copied_idx
  ON public.agent_activity_events (copied_at DESC);

-- Applies one change from the live record writer. Idempotent: inserts are
-- keyed by id (and a run by its trigger key), and an update older than the
-- newest one applied is skipped, so a repeated or late change never counts
-- twice or rolls state back. Only customer-safe columns are written: output
-- bodies and before/after values (which can hold message text) stay out.
CREATE OR REPLACE FUNCTION public.live_record_copy(p_op jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := p_op ->> 'kind';
  v_action text := p_op ->> 'action';
  v_row jsonb := COALESCE(p_op -> 'row', '{}'::jsonb);
  v_at timestamptz := COALESCE((p_op ->> 'occurredAt')::timestamptz, now());
  v_org uuid := COALESCE((p_op ->> 'workspaceId')::uuid, (v_row ->> 'org_id')::uuid);
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'A copied change needs its workspace.' USING ERRCODE = '22023';
  END IF;
  IF (v_row ->> 'org_id') IS NOT NULL AND (v_row ->> 'org_id')::uuid <> v_org THEN
    RAISE EXCEPTION 'A copied change cannot leave its workspace.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('vistrial.live_record_replica', 'on', true);

  IF v_kind = 'run' AND v_action = 'insert' THEN
    INSERT INTO public.agent_activity_runs (
      id, org_id, agent_id, trigger_key, subject_label, subject_href, lead_id, actor_member_id, status,
      plan, config_version, sources, simulated, batch_id, created_at, last_progress_at, source_at, copied_at
    ) VALUES (
      (v_row ->> 'id')::uuid, v_org, v_row ->> 'agent_id', left(v_row ->> 'trigger_key', 300),
      left(COALESCE(NULLIF(btrim(v_row ->> 'subject_label'), ''), 'a piece of work'), 200),
      v_row ->> 'subject_href', (v_row ->> 'lead_id')::uuid, (v_row ->> 'actor_member_id')::uuid,
      COALESCE(v_row ->> 'status', 'queued'),
      COALESCE(v_row -> 'plan', '[]'::jsonb), v_row ->> 'config_version', COALESCE(v_row -> 'sources', '[]'::jsonb),
      COALESCE((v_row ->> 'simulated')::boolean, false), (v_row ->> 'batch_id')::uuid,
      COALESCE((v_row ->> 'created_at')::timestamptz, v_at), v_at, v_at, now()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT r.id INTO v_id FROM public.agent_activity_runs r
      WHERE r.org_id = v_org AND r.agent_id = v_row ->> 'agent_id' AND r.trigger_key = left(v_row ->> 'trigger_key', 300);
      RETURN jsonb_build_object('applied', false, 'id', v_id, 'existing', true);
    END IF;
    RETURN jsonb_build_object('applied', true, 'id', v_id);
  END IF;

  IF v_kind = 'run' THEN
    UPDATE public.agent_activity_runs r SET
      status = CASE WHEN v_row ? 'status' THEN v_row ->> 'status' ELSE r.status END,
      current_step_label = CASE WHEN v_row ? 'current_step_label' THEN left(v_row ->> 'current_step_label', 200) ELSE r.current_step_label END,
      needs_person = CASE WHEN v_row ? 'needs_person' THEN v_row -> 'needs_person' ELSE r.needs_person END,
      reason_summary = CASE WHEN v_row ? 'reason_summary' THEN left(v_row ->> 'reason_summary', 2000) ELSE r.reason_summary END,
      plain_error = CASE WHEN v_row ? 'plain_error' THEN left(v_row ->> 'plain_error', 600) ELSE r.plain_error END,
      sources = CASE WHEN v_row ? 'sources' THEN COALESCE(v_row -> 'sources', '[]'::jsonb) ELSE r.sources END,
      started_at = CASE WHEN v_row ? 'started_at' THEN (v_row ->> 'started_at')::timestamptz ELSE r.started_at END,
      finished_at = CASE WHEN v_row ? 'finished_at' THEN (v_row ->> 'finished_at')::timestamptz ELSE r.finished_at END,
      last_progress_at = COALESCE((v_row ->> 'last_progress_at')::timestamptz, v_at),
      source_at = v_at,
      copied_at = now()
    WHERE r.id = (v_row ->> 'id')::uuid AND r.org_id = v_org
      AND (r.source_at IS NULL OR r.source_at <= v_at);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    -- A change for a run that is not here yet goes back to the outbox and is retried.
    IF v_count = 0 AND NOT EXISTS (
      SELECT 1 FROM public.agent_activity_runs r WHERE r.id = (v_row ->> 'id')::uuid AND r.org_id = v_org
    ) THEN
      RAISE EXCEPTION 'That run has not been copied yet.' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('applied', v_count > 0, 'id', v_row ->> 'id');
  END IF;

  IF v_kind = 'step' AND v_action = 'insert' THEN
    INSERT INTO public.agent_activity_steps (id, org_id, run_id, agent_id, seq, label, status, detail, reason, sources, started_at, source_at)
    VALUES (
      (v_row ->> 'id')::uuid, v_org, (v_row ->> 'run_id')::uuid, COALESCE(v_row ->> 'agent_id', ''),
      (v_row ->> 'seq')::integer, left(COALESCE(NULLIF(btrim(v_row ->> 'label'), ''), 'Working'), 200),
      COALESCE(v_row ->> 'status', 'working'), left(v_row ->> 'detail', 2000), left(v_row ->> 'reason', 2000),
      COALESCE(v_row -> 'sources', '[]'::jsonb), COALESCE((v_row ->> 'started_at')::timestamptz, v_at), v_at
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('applied', v_count > 0, 'id', v_row ->> 'id');
  END IF;

  IF v_kind = 'step' THEN
    UPDATE public.agent_activity_steps s SET
      status = CASE WHEN v_row ? 'status' THEN v_row ->> 'status' ELSE s.status END,
      detail = CASE WHEN v_row ? 'detail' THEN left(v_row ->> 'detail', 2000) ELSE s.detail END,
      reason = CASE WHEN v_row ? 'reason' THEN left(v_row ->> 'reason', 2000) ELSE s.reason END,
      sources = CASE WHEN v_row ? 'sources' THEN COALESCE(v_row -> 'sources', '[]'::jsonb) ELSE s.sources END,
      finished_at = CASE WHEN v_row ? 'finished_at' THEN (v_row ->> 'finished_at')::timestamptz ELSE s.finished_at END,
      duration_ms = CASE WHEN v_row ? 'duration_ms' THEN (v_row ->> 'duration_ms')::integer ELSE s.duration_ms END,
      source_at = v_at
    WHERE s.org_id = v_org AND s.run_id = (v_row ->> 'run_id')::uuid AND s.seq = (v_row ->> 'seq')::integer
      AND (s.source_at IS NULL OR s.source_at <= v_at);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 AND NOT EXISTS (
      SELECT 1 FROM public.agent_activity_steps s
      WHERE s.org_id = v_org AND s.run_id = (v_row ->> 'run_id')::uuid AND s.seq = (v_row ->> 'seq')::integer
    ) THEN
      RAISE EXCEPTION 'That step has not been copied yet.' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('applied', v_count > 0);
  END IF;

  IF v_kind = 'event' THEN
    INSERT INTO public.agent_activity_events (id, org_id, run_id, agent_id, kind, label, occurred_at)
    VALUES (
      (v_row ->> 'id')::uuid, v_org, (v_row ->> 'run_id')::uuid, COALESCE(v_row ->> 'agent_id', ''),
      v_row ->> 'kind', left(COALESCE(NULLIF(btrim(v_row ->> 'label'), ''), 'Update'), 300),
      COALESCE((v_row ->> 'occurred_at')::timestamptz, v_at)
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('applied', v_count > 0, 'id', v_row ->> 'id');
  END IF;

  IF v_kind = 'output' THEN
    -- Title only. The body and before/after values stay in the source record.
    INSERT INTO public.agent_activity_outputs (id, org_id, run_id, agent_id, kind, title, created_at)
    VALUES (
      (v_row ->> 'id')::uuid, v_org, (v_row ->> 'run_id')::uuid, COALESCE(v_row ->> 'agent_id', ''),
      v_row ->> 'kind', left(COALESCE(NULLIF(btrim(v_row ->> 'title'), ''), 'Output'), 200),
      COALESCE((v_row ->> 'created_at')::timestamptz, v_at)
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('applied', v_count > 0, 'id', v_row ->> 'id');
  END IF;

  IF v_kind = 'staff' THEN
    -- Staff-only by row-level security. Raw error text never reaches a customer column.
    INSERT INTO public.agent_activity_staff (run_id, org_id, detail, error_detail, updated_at)
    VALUES (
      (v_row ->> 'run_id')::uuid, v_org, COALESCE(v_row -> 'detail', '{}'::jsonb), left(v_row ->> 'error_detail', 4000), v_at
    )
    ON CONFLICT (run_id) DO UPDATE
      SET detail = EXCLUDED.detail,
          error_detail = COALESCE(EXCLUDED.error_detail, public.agent_activity_staff.error_detail),
          updated_at = EXCLUDED.updated_at
      WHERE public.agent_activity_staff.updated_at <= EXCLUDED.updated_at;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('applied', v_count > 0);
  END IF;

  RAISE EXCEPTION 'Unknown change kind.' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.live_record_copy(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_record_copy(jsonb) TO service_role;

-- How far the copy is behind for one workspace: changes still waiting in the
-- outbox, and how old the oldest is. Read by the shared summary.
CREATE OR REPLACE FUNCTION public.live_record_backlog(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending', count(*)::integer,
    'oldestSeconds', COALESCE(EXTRACT(EPOCH FROM now() - min(o.created_at))::integer, 0)
  )
  FROM public.live_record_outbox o
  WHERE o.workspace_id = p_org_id AND o.delivered_at IS NULL AND o.phase = 'replicate';
$$;

REVOKE ALL ON FUNCTION public.live_record_backlog(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_record_backlog(uuid) TO service_role;

-- Delay from a change to Postgres, for staff. Percentiles over a window.
CREATE OR REPLACE FUNCTION public.live_record_copy_delay(p_minutes integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'events', count(*)::integer,
    'p50Ms', COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d))::integer, 0),
    'p95Ms', COALESCE(round(percentile_cont(0.95) WITHIN GROUP (ORDER BY d))::integer, 0),
    'maxMs', COALESCE(round(max(d))::integer, 0),
    'over2s', count(*) FILTER (WHERE d > 2000)::integer
  ) INTO v_out
  FROM (
    SELECT GREATEST(EXTRACT(EPOCH FROM (e.copied_at - e.occurred_at)) * 1000, 0) AS d
    FROM public.agent_activity_events e
    WHERE e.copied_at > now() - make_interval(mins => GREATEST(p_minutes, 1))
  ) x;
  RETURN v_out || jsonb_build_object(
    'backlog', (SELECT count(*)::integer FROM public.live_record_outbox o WHERE o.delivered_at IS NULL AND o.phase = 'replicate')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.live_record_copy_delay(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_record_copy_delay(integer) TO authenticated, service_role;

-- Reconciliation results: what the Convex record holds against the copy.
CREATE TABLE IF NOT EXISTS public.live_record_drift (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  window_hours integer NOT NULL,
  convex_runs integer NOT NULL,
  postgres_runs integer NOT NULL,
  missing_in_postgres integer NOT NULL,
  missing_in_convex integer NOT NULL,
  status_mismatch integer NOT NULL,
  sample_run_ids uuid[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS live_record_drift_recent_idx ON public.live_record_drift (checked_at DESC);

COMMENT ON TABLE public.live_record_drift IS
  'Run counts in the Convex record against the Postgres copy, per workspace. Identifiers and counts only.';

ALTER TABLE public.live_record_drift ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_record_drift FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.live_record_drift TO service_role;
GRANT SELECT ON public.live_record_drift TO authenticated;
DROP POLICY IF EXISTS live_record_drift_select ON public.live_record_drift;
CREATE POLICY live_record_drift_select ON public.live_record_drift FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()));

-- The Postgres side of the reconciliation: runs in a window, ids and status only.
CREATE OR REPLACE FUNCTION public.live_record_run_ids(p_org_id uuid, p_since timestamptz)
RETURNS TABLE (id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.status FROM public.agent_activity_runs r
  WHERE r.org_id = p_org_id AND r.created_at >= p_since
  ORDER BY r.created_at DESC
  LIMIT 2000;
$$;

REVOKE ALL ON FUNCTION public.live_record_run_ids(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_record_run_ids(uuid, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The shared summary
-- ---------------------------------------------------------------------------

-- The one definition of "waiting on you": an agent request that is open
-- (pending, or approved and waiting for a person to send it). Every count
-- reads this view under the asking person's row-level security, so the
-- sidebar, the Overview badge, the Decisions section, the panel and the
-- strip cannot disagree.
CREATE OR REPLACE VIEW public.agent_waiting_items
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.org_id,
  a.agent_id,
  a.run_id,
  CASE WHEN a.action_type = 'agent_question' THEN 'question' ELSE 'approval' END AS kind,
  a.status,
  a.title,
  a.lead_ids,
  a.created_at
FROM public.approval_items a
WHERE a.agent_id IS NOT NULL
  AND a.status IN ('pending', 'approved');

COMMENT ON VIEW public.agent_waiting_items IS
  'The one definition of an item waiting on a person. Read under the caller''s row-level security.';

REVOKE ALL ON public.agent_waiting_items FROM PUBLIC, anon;
GRANT SELECT ON public.agent_waiting_items TO authenticated, service_role;

-- Facts that row-level security would hide from the person but that they
-- are entitled to as states: registry entries, plan, pause, halt, stage,
-- the workspace switch, the copy backlog, and Assay's queue. No lead data.
CREATE OR REPLACE FUNCTION public.agent_summary_frame(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  o public.organizations%ROWTYPE;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  RETURN jsonb_build_object(
    'access', v_access,
    'workspace', jsonb_build_object(
      'status', o.status::text,
      'agentsHalted', COALESCE(o.agents_halted, false),
      'billingState', (SELECT a.state FROM public.billing_accounts a WHERE a.org_id = p_org_id)
    ),
    'backlog', public.live_record_backlog(p_org_id),
    'areas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'description', a.description, 'recordKind', a.record_kind,
        'workPage', a.work_page, 'homePage', a.home_page, 'availability', a.availability, 'sort', a.sort
      ) ORDER BY a.sort, a.id)
      FROM public.agent_areas a
    ), '[]'::jsonb),
    'agents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'area', r.area_id, 'name', r.name, 'sublabel', r.sublabel, 'description', r.description,
        'glyph', r.glyph, 'accent', r.accent, 'promise', r.promise, 'availability', r.availability,
        'inCohort', r.availability <> 'beta' OR p_org_id = ANY (r.beta_org_ids),
        'planAllowed', public.agent_plan_allows(p_org_id, r.id),
        'lockedReason', r.locked_reason,
        'prerequisites', to_jsonb(r.prerequisites),
        'sort', r.sort, 'startsOn', r.starts_on, 'privateRuns', r.private_runs,
        'activitySource', r.activity_source, 'outputSource', r.output_source, 'version', r.version,
        'stage', w.stage,
        'paused', COALESCE(c.paused, false),
        'pausedByName', CASE WHEN c.paused THEN c.changed_by_name END,
        'pausedAt', CASE WHEN c.paused THEN c.changed_at END,
        'pausedReason', CASE WHEN c.paused AND v_access IN ('owner', 'service_team', 'platform_admin') THEN c.reason END,
        'halted', COALESCE(h.halted, false),
        'haltedAt', CASE WHEN h.halted THEN h.changed_at END,
        'queue', CASE WHEN r.activity_source = 'scores' THEN (
          SELECT jsonb_build_object(
            'running', count(*) FILTER (WHERE j.status = 'running')::integer,
            'pending', count(*) FILTER (WHERE j.status = 'pending' AND NOT j.silent)::integer,
            'oldestRunningAt', min(j.claimed_at) FILTER (WHERE j.status = 'running')
          )
          FROM public.assay_jobs j
          WHERE j.org_id = p_org_id AND j.status IN ('pending', 'running')
        ) END
      ) ORDER BY r.sort, r.id)
      FROM public.agent_registry r
      LEFT JOIN public.workspace_agent_activation w ON w.org_id = p_org_id AND w.agent_id = r.id
      LEFT JOIN public.agent_presence_controls c ON c.org_id = p_org_id AND c.agent_id = r.id
      LEFT JOIN public.platform_agent_halts h ON h.agent_id = r.id
      WHERE r.availability <> 'beta' OR p_org_id = ANY (r.beta_org_ids) OR v_access IN ('service_team', 'platform_admin')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_summary_frame(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_summary_frame(uuid) TO authenticated, service_role;

-- The shared summary. Runs as the person asking, so every count, line and
-- name below is what their row-level security already lets them see:
-- Operators get only their own leads, Members get approvals only with the
-- approval grant, and Compass runs only for whoever asked. Lines carry
-- titles and names, never message or transcript text.
CREATE OR REPLACE FUNCTION public.agent_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_frame jsonb := public.agent_summary_frame(p_org_id);
  v_day timestamptz := date_trunc('day', now());
  v_agents jsonb := '[]'::jsonb;
  a jsonb;
  v_id text;
  v_live boolean;
  v_facts jsonb;
BEGIN
  FOR a IN SELECT value FROM jsonb_array_elements(v_frame -> 'agents') LOOP
    v_id := a ->> 'id';
    -- Locked or not-enabled agents return their registry description only.
    v_live := (a ->> 'planAllowed')::boolean
      AND (a ->> 'inCohort')::boolean
      AND a ->> 'availability' <> 'coming_soon'
      AND (a ->> 'stage' IS NULL OR a ->> 'stage' <> 'coming_soon');
    IF NOT v_live THEN
      v_agents := v_agents || jsonb_build_array(a || jsonb_build_object('facts', NULL));
      CONTINUE;
    END IF;

    SELECT jsonb_build_object(
      'waiting', (
        SELECT jsonb_build_object(
          'approvals', count(*) FILTER (WHERE w.kind = 'approval')::integer,
          'questions', count(*) FILTER (WHERE w.kind = 'question')::integer
        )
        FROM public.agent_waiting_items w
        WHERE w.org_id = p_org_id AND w.agent_id = v_id
      ),
      'openRun', (
        SELECT jsonb_build_object(
          'id', r.id, 'status', r.status, 'step', r.current_step_label, 'subject', r.subject_label,
          'leadId', r.lead_id, 'lastProgressAt', r.last_progress_at, 'createdAt', r.created_at
        )
        FROM public.agent_activity_runs r
        WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status IN ('queued', 'working', 'waiting_provider')
        ORDER BY r.created_at DESC
        LIMIT 1
      ),
      'latestRun', (
        SELECT jsonb_build_object(
          'id', r.id, 'status', r.status, 'subject', r.subject_label, 'plainError', r.plain_error,
          'finishedAt', r.finished_at, 'lastProgressAt', r.last_progress_at, 'createdAt', r.created_at
        )
        FROM public.agent_activity_runs r
        WHERE r.org_id = p_org_id AND r.agent_id = v_id
        ORDER BY r.created_at DESC
        LIMIT 1
      ),
      'waitingRunsWithoutItem', (
        SELECT count(*)::integer
        FROM public.agent_activity_runs r
        WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status = 'waiting_person'
          AND NOT EXISTS (SELECT 1 FROM public.agent_waiting_items w WHERE w.run_id = r.id)
      ),
      'doneToday', CASE WHEN a ->> 'activitySource' = 'scores' THEN (
          SELECT count(*)::integer FROM public.lead_score_history s
          WHERE s.org_id = p_org_id AND NOT s.historic AND s.created_at >= v_day
        ) ELSE (
          SELECT count(*)::integer FROM public.agent_activity_runs r
          WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status = 'completed' AND r.created_at >= v_day
        ) END,
      'lastDoneAt', CASE WHEN a ->> 'activitySource' = 'scores' THEN (
          SELECT max(s.created_at) FROM public.lead_score_history s
          WHERE s.org_id = p_org_id AND NOT s.historic AND s.created_at >= now() - interval '30 days'
        ) ELSE (
          SELECT max(COALESCE(r.finished_at, r.last_progress_at)) FROM public.agent_activity_runs r
          WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status = 'completed' AND r.created_at >= now() - interval '30 days'
        ) END,
      'outputs', CASE a ->> 'outputSource'
        WHEN 'requests' THEN COALESCE((
          SELECT jsonb_agg(x ORDER BY x ->> 'at' DESC) FROM (
            SELECT jsonb_build_object(
              'id', w.id, 'kind', w.kind, 'title', w.title, 'status', w.status, 'at', w.created_at,
              'runId', w.run_id, 'leadId', l.id, 'leadName', NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), '')
            ) AS x
            FROM public.agent_waiting_items w
            LEFT JOIN public.leads l ON l.id = w.lead_ids[1] AND l.org_id = p_org_id
            WHERE w.org_id = p_org_id AND w.agent_id = v_id
            ORDER BY w.created_at DESC
            LIMIT 5
          ) q
        ), '[]'::jsonb)
        WHEN 'windows' THEN COALESCE((
          SELECT jsonb_agg(x ORDER BY x ->> 'deadlineAt') FROM (
            SELECT jsonb_build_object(
              'id', k.id, 'kind', 'window', 'state', k.state, 'deadlineAt', k.deadline_at, 'at', k.updated_at,
              'leadId', l.id, 'leadName', NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), '')
            ) AS x
            FROM public.sentry_clocks k
            JOIN public.leads l ON l.id = k.lead_id AND l.org_id = p_org_id
            WHERE k.org_id = p_org_id AND k.state IN ('on_time', 'at_risk', 'missed') AND k.deadline_at IS NOT NULL
            ORDER BY k.deadline_at
            LIMIT 5
          ) q
        ), '[]'::jsonb)
        WHEN 'tiers' THEN COALESCE((
          SELECT jsonb_agg(x ORDER BY x ->> 'at' DESC) FROM (
            SELECT jsonb_build_object(
              'id', s.id, 'kind', 'tier', 'tier', s.tier, 'previousTier', s.previous_tier, 'at', s.created_at,
              'leadId', l.id, 'leadName', NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), '')
            ) AS x
            FROM public.lead_score_history s
            JOIN public.leads l ON l.id = s.lead_id AND l.org_id = p_org_id
            WHERE s.org_id = p_org_id AND NOT s.historic AND s.previous_tier IS DISTINCT FROM s.tier
              AND s.previous_tier IS NOT NULL
            ORDER BY s.created_at DESC
            LIMIT 5
          ) q
        ), '[]'::jsonb)
        ELSE COALESCE((
          SELECT jsonb_agg(x ORDER BY x ->> 'at' DESC) FROM (
            SELECT jsonb_build_object(
              'id', o.id, 'kind', o.kind, 'title', o.title, 'at', o.created_at, 'runId', o.run_id,
              'leadId', l.id, 'leadName', NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), '')
            ) AS x
            FROM public.agent_activity_outputs o
            LEFT JOIN public.leads l ON l.id = o.lead_id AND l.org_id = p_org_id
            WHERE o.org_id = p_org_id AND o.agent_id = v_id
            ORDER BY o.created_at DESC
            LIMIT 5
          ) q
        ), '[]'::jsonb)
      END
    ) INTO v_facts;

    v_agents := v_agents || jsonb_build_array(a || jsonb_build_object('facts', v_facts));
  END LOOP;

  RETURN jsonb_build_object(
    'orgId', p_org_id,
    'generatedAt', now(),
    'access', v_frame -> 'access',
    'workspace', v_frame -> 'workspace',
    'backlog', v_frame -> 'backlog',
    'areas', v_frame -> 'areas',
    'agents', v_agents,
    -- Every open agent request this person can see, whatever the agent's
    -- state. The Overview badge and the Decisions section show this number.
    'waitingTotal', (SELECT count(*)::integer FROM public.agent_waiting_items w WHERE w.org_id = p_org_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_summary(uuid) TO authenticated, service_role;

-- What a workspace has in place for each prerequisite, from real state.
-- Connector keys come from the connector catalog in code.
CREATE OR REPLACE FUNCTION public.agent_setup_facts(p_org_id uuid, p_crm_keys text[], p_call_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ws_access(p_org_id) IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'crm_connected',
      EXISTS (SELECT 1 FROM public.ghl_connections g WHERE g.org_id = p_org_id AND g.status = 'active')
      OR EXISTS (
        SELECT 1 FROM public.workspace_connections c
        WHERE c.org_id = p_org_id AND c.connector_key = ANY (p_crm_keys)
          AND c.status IN ('importing', 'live', 'delayed')
      ),
    'call_source',
      EXISTS (
        SELECT 1 FROM public.workspace_connections c
        WHERE c.org_id = p_org_id AND c.connector_key = ANY (p_call_keys)
          AND c.status IN ('importing', 'live', 'delayed')
      )
      OR EXISTS (SELECT 1 FROM public.calls k WHERE k.org_id = p_org_id AND k.created_at > now() - interval '90 days')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_setup_facts(uuid, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_setup_facts(uuid, text[], text[]) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. Existing functions read the registry instead of a typed list
-- ---------------------------------------------------------------------------

-- Pause and resume, for any registered agent. Assay included.
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
  v_prev public.agent_presence_controls;
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only an owner or the Vistrial team can pause or resume agents.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_registry r WHERE r.id = p_agent_id) THEN
    RAISE EXCEPTION 'Unknown agent.';
  END IF;
  IF v_access IN ('service_team', 'platform_admin') AND p_paused AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say why you are pausing it. The Owner sees this.' USING ERRCODE = '22023';
  END IF;
  v_name := public.member_public_name(v_member);
  SELECT * INTO v_prev FROM public.agent_presence_controls WHERE org_id = p_org_id AND agent_id = p_agent_id;
  -- Postgres holds the pause. Every agent and every screen reads it here.
  PERFORM set_config('vistrial.live_record_replica', 'on', true);

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
    -- Catch-up for the paused period is historic: Assay scores it quietly,
    -- with no tasks or notices.
    IF p_agent_id = 'assay' AND COALESCE(v_prev.paused, false) THEN
      UPDATE public.assay_jobs SET silent = true, updated_at = now()
        WHERE org_id = p_org_id AND status = 'pending' AND created_at >= v_prev.changed_at;
    END IF;
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

-- The platform halt is written in Postgres, where every agent reads it.
CREATE OR REPLACE FUNCTION public.set_platform_agent_halt(p_agent_id text, p_halted boolean, p_reason text)
RETURNS public.platform_agent_halts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.platform_agent_halts%ROWTYPE;
BEGIN
  PERFORM public.staff_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.agent_registry r WHERE r.id = p_agent_id) THEN
    RAISE EXCEPTION 'Unknown agent.' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A reason is required.' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('vistrial.live_record_replica', 'on', true);
  INSERT INTO public.platform_agent_halts (agent_id, halted, reason, changed_by, changed_by_name, changed_at)
  VALUES (p_agent_id, p_halted, left(btrim(p_reason), 300), auth.uid(), (SELECT display_name FROM public.platform_staff WHERE user_id = auth.uid()), now())
  ON CONFLICT (agent_id) DO UPDATE
    SET halted = EXCLUDED.halted, reason = EXCLUDED.reason, changed_by = EXCLUDED.changed_by,
        changed_by_name = EXCLUDED.changed_by_name, changed_at = now()
  RETURNING * INTO v_row;
  PERFORM public.ws_log(NULL, CASE WHEN p_halted THEN 'agent.platform_halted' ELSE 'agent.platform_resumed' END,
    'platform_agent_halts', p_agent_id, jsonb_build_object('agent', p_agent_id, 'reason', left(btrim(p_reason), 300)), auth.uid());
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_agent_overview(p_scope text DEFAULT 'all', p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  org_status text,
  agent_id text,
  paused boolean,
  paused_reason text,
  paused_by_owner boolean,
  platform_halted boolean,
  last_run_at timestamptz,
  last_run_id uuid,
  last_run_status text,
  runs_24h integer,
  failed_24h integer,
  stuck_now integer,
  waiting integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT o.id, o.name, o.status::text AS status FROM public.organizations o
    WHERE o.id IN (SELECT public.staff_scope_org_ids(p_scope)) AND (p_org_id IS NULL OR o.id = p_org_id)
  ),
  agents AS (SELECT r.id AS agent_id FROM public.agent_registry r WHERE r.availability <> 'coming_soon'),
  stats AS (
    SELECT r.org_id, r.agent_id,
      count(*) FILTER (WHERE r.created_at > now() - interval '24 hours')::int AS runs_24h,
      count(*) FILTER (WHERE r.created_at > now() - interval '24 hours' AND r.status IN ('failed', 'stuck')
        AND NOT EXISTS (SELECT 1 FROM public.staff_run_reviews v WHERE v.run_id = r.id))::int AS failed_24h,
      count(*) FILTER (WHERE r.status = 'stuck' AND NOT EXISTS (SELECT 1 FROM public.staff_run_reviews v WHERE v.run_id = r.id))::int AS stuck_now,
      count(*) FILTER (WHERE r.status IN ('waiting_person', 'needs_person'))::int AS waiting
    FROM public.agent_activity_runs r
    WHERE r.org_id IN (SELECT id FROM scope) AND NOT r.simulated AND r.created_at > now() - interval '7 days'
    GROUP BY r.org_id, r.agent_id
  )
  SELECT s.id, s.name, s.status, a.agent_id,
    COALESCE(p.paused, false), p.reason,
    COALESCE(m.seat::text = 'customer' AND m.role::text = 'owner', false),
    COALESCE(h.halted, false),
    lr.created_at, lr.id, lr.status,
    COALESCE(st.runs_24h, 0), COALESCE(st.failed_24h, 0), COALESCE(st.stuck_now, 0), COALESCE(st.waiting, 0)
  FROM scope s
  CROSS JOIN agents a
  LEFT JOIN public.agent_presence_controls p ON p.org_id = s.id AND p.agent_id = a.agent_id
  LEFT JOIN public.org_members m ON m.id = p.changed_by_member_id
  LEFT JOIN public.platform_agent_halts h ON h.agent_id = a.agent_id
  LEFT JOIN stats st ON st.org_id = s.id AND st.agent_id = a.agent_id
  LEFT JOIN LATERAL (
    SELECT r.id, r.created_at, r.status FROM public.agent_activity_runs r
    WHERE r.org_id = s.id AND r.agent_id = a.agent_id AND NOT r.simulated
    ORDER BY r.created_at DESC LIMIT 1
  ) lr ON true
  ORDER BY s.name, a.agent_id;
$$;

-- Private runs are a registry setting (Compass), not a typed name.
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
    CASE
      -- A Compass run is a private conversation's working record: only the
      -- person who asked sees it, staff and Platform Admins included.
      WHEN EXISTS (SELECT 1 FROM public.agent_registry r WHERE r.id = p_agent_id AND r.private_runs) THEN
        p_actor_member_id IS NOT NULL AND p_actor_member_id = public.user_member_id(p_org_id)
      ELSE CASE public.ws_access(p_org_id)
        WHEN 'platform_admin' THEN true
        WHEN 'service_team' THEN true
        WHEN 'owner' THEN true
        WHEN 'member' THEN true
        WHEN 'operator' THEN p_lead_id IS NOT NULL AND p_lead_id IN (SELECT public.operator_visible_lead_ids())
        ELSE false
      END
    END,
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.agent_activity_mark_stuck(p_minutes integer DEFAULT 10)
RETURNS TABLE (run_id uuid, org_id uuid, agent_id text, subject_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stuck runs are judged on the Postgres copy's own timestamps.
  PERFORM set_config('vistrial.live_record_replica', 'on', true);
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

CREATE OR REPLACE FUNCTION public.entitlement_check(p_org_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  v_limit integer;
  v_used integer;
  v_reset date := public.billing_period_end(p_org_id);
  v_feature boolean;
  v_blocked boolean := public.billing_blocks_cost(p_org_id);
  v_recovering boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND v_access IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;

  IF p_key = 'connectors' THEN
    RETURN public.connector_entitlement(p_org_id);
  END IF;

  -- Agents: the registry says which plans include each one.
  IF p_key LIKE 'agent:%' THEN
    v_feature := public.agent_plan_allows(p_org_id, substr(p_key, 7));
    RETURN jsonb_build_object('allowed', v_feature, 'feature', v_feature, 'reason',
      CASE WHEN v_feature THEN 'Included.'
        ELSE COALESCE((SELECT r.locked_reason FROM public.agent_registry r WHERE r.id = substr(p_key, 7)), 'Not included on this plan.') END,
      'reset_on', v_reset);
  END IF;

  SELECT recovering_until > now() INTO v_recovering FROM public.billing_accounts WHERE org_id = p_org_id;

  IF p_key IN ('compass', 'writeback', 'transcripts', 'agents', 'sso', 'api_access') THEN
    v_feature := public.billing_feature(p_org_id, p_key);
    IF p_key = 'compass' AND (v_blocked OR COALESCE(v_recovering, false)) THEN
      RETURN jsonb_build_object('allowed', false, 'feature', false, 'reason',
        'Compass is paused until billing is sorted. Ask your Owner.', 'reset_on', v_reset);
    END IF;
    RETURN jsonb_build_object('allowed', v_feature, 'feature', v_feature, 'reason',
      CASE WHEN v_feature THEN 'Included.' ELSE 'Not included on this plan.' END, 'reset_on', v_reset);
  END IF;

  IF p_key = 'team_members' THEN
    SELECT count(*)::integer INTO v_used FROM public.org_members
    WHERE org_id = p_org_id AND seat = 'customer' AND active;
    v_used := v_used + COALESCE((
      SELECT count(*)::integer FROM public.org_invites
      WHERE org_id = p_org_id AND accepted_at IS NULL AND expires_at > now()
    ), 0);
  ELSE
    v_used := public.billing_used(p_org_id, p_key);
  END IF;
  v_limit := public.billing_limit(p_org_id, p_key);

  IF v_blocked AND p_key IN ('leads_processed', 'transcript_minutes', 'compass_questions', 'relay_drafts') THEN
    RETURN jsonb_build_object(
      'allowed', false, 'capture', p_key = 'leads_processed', 'limit', v_limit, 'used', v_used,
      'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE greatest(v_limit - v_used, 0) END,
      'reason', 'This is paused until the workspace billing is sorted. Ask your Owner. Nothing already saved is removed.',
      'reset_on', v_reset
    );
  END IF;

  IF v_limit IS NOT NULL AND v_used >= v_limit AND p_key IN ('team_members', 'leads_processed', 'transcript_minutes', 'compass_questions') THEN
    RETURN jsonb_build_object(
      'allowed', false, 'capture', p_key = 'leads_processed', 'limit', v_limit, 'used', v_used, 'remaining', 0,
      'reason', 'The limit for this period has been reached. It resets on ' || to_char(v_reset, 'FMMonth FMDD') || '. Ask your Owner.',
      'reset_on', v_reset
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'capture', true, 'limit', v_limit, 'used', v_used,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE greatest(v_limit - v_used, 0) END,
    'reason', 'Within the plan.', 'reset_on', v_reset
  );
END;
$$;
