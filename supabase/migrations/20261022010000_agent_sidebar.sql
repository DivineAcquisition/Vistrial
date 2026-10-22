-- Prompt 24, steps 3 to 7: the sidebar switch, the workspace agent states and
-- how agents get turned on, interest in agents that are not here yet, Run
-- now, a person's own hidden rows, and the Platform Admin registry tools.

-- ---------------------------------------------------------------------------
-- 1. Per-workspace switches, held in Postgres. The new sidebar is one.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_flags (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  flag text NOT NULL CHECK (flag IN ('agent_sidebar')),
  enabled boolean NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, flag)
);

ALTER TABLE public.workspace_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_flags TO authenticated;
GRANT ALL ON public.workspace_flags TO service_role;
DROP POLICY IF EXISTS workspace_flags_select ON public.workspace_flags;
CREATE POLICY workspace_flags_select ON public.workspace_flags FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IS NOT NULL);

-- Vistrial staff switch it, workspace by workspace. Logged.
CREATE OR REPLACE FUNCTION public.set_workspace_flag(p_org_id uuid, p_flag text, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') NOT IN ('service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only the Vistrial team can change this switch.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.workspace_flags (org_id, flag, enabled, changed_by, changed_at)
  VALUES (p_org_id, p_flag, p_enabled, auth.uid(), now())
  ON CONFLICT (org_id, flag) DO UPDATE SET enabled = EXCLUDED.enabled, changed_by = EXCLUDED.changed_by, changed_at = now();
  PERFORM public.ws_log(p_org_id, 'workspace.flag_changed', 'workspace_flags', p_flag,
    jsonb_build_object('flag', p_flag, 'enabled', p_enabled), auth.uid());
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_flag(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_flag(uuid, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Workspace agent states: pending confirmation and off by choice
-- ---------------------------------------------------------------------------

ALTER TABLE public.workspace_agent_activation DROP CONSTRAINT IF EXISTS workspace_agent_activation_stage_check;
ALTER TABLE public.workspace_agent_activation ADD CONSTRAINT workspace_agent_activation_stage_check
  CHECK (stage IN ('off', 'watch', 'on', 'drafts_only', 'coming_soon', 'pending', 'off_by_choice'));
ALTER TABLE public.workspace_agent_activation ADD COLUMN IF NOT EXISTS requested_by uuid;
ALTER TABLE public.workspace_agent_activation ADD COLUMN IF NOT EXISTS requested_by_label text;
ALTER TABLE public.workspace_agent_activation ADD COLUMN IF NOT EXISTS requested_at timestamptz;

COMMENT ON COLUMN public.workspace_agent_activation.stage IS
  'off and coming_soon: staged onboarding. pending: turned on by the Vistrial team, waiting for the Owner. off_by_choice: turned off by the Owner or staff, data kept.';

-- Turn an agent on or off for a workspace.
-- Owner: on (plan permitting, after go-live), off, or confirm what staff turned on.
-- Vistrial staff for the workspace: on waits for the Owner's confirmation; off is immediate.
-- Turning off can withdraw the agent's open requests, or keep them for review.
CREATE OR REPLACE FUNCTION public.agent_set_enabled(p_org_id uuid, p_agent_id text, p_on boolean, p_withdraw_open boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  r public.agent_registry%ROWTYPE;
  v_status text;
  v_stage text;
  v_next text;
  v_member uuid := public.user_member_id(p_org_id);
  v_label text;
  v_withdrawn integer := 0;
  v_action text;
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only the Owner or the Vistrial team can turn agents on or off.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.agent_registry WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown agent.' USING ERRCODE = '22023';
  END IF;
  SELECT o.status::text INTO v_status FROM public.organizations o WHERE o.id = p_org_id;
  SELECT a.stage INTO v_stage FROM public.workspace_agent_activation a WHERE a.org_id = p_org_id AND a.agent_id = p_agent_id;
  v_label := COALESCE(public.member_public_name(v_member), CASE WHEN v_access = 'owner' THEN 'The Owner' ELSE 'The Vistrial team' END);

  IF p_on THEN
    IF r.availability = 'coming_soon' OR (r.availability = 'beta' AND NOT (p_org_id = ANY (r.beta_org_ids))) THEN
      RAISE EXCEPTION 'This agent is not available to this workspace yet.' USING ERRCODE = '22023';
    END IF;
    IF NOT public.agent_plan_allows(p_org_id, p_agent_id) THEN
      RAISE EXCEPTION '%', r.locked_reason USING ERRCODE = '42501';
    END IF;
    IF v_access = 'owner' THEN
      IF v_status <> 'active' THEN
        RAISE EXCEPTION 'Agents turn on once your workspace is live. The Vistrial team switches them on with you.' USING ERRCODE = '22023';
      END IF;
      v_next := 'on';
      v_action := CASE WHEN v_stage = 'pending' THEN 'agent.confirmed' ELSE 'agent.enabled' END;
    ELSE
      v_next := CASE WHEN v_stage IN ('on', 'watch', 'drafts_only') THEN v_stage ELSE 'pending' END;
      v_action := CASE WHEN v_next = 'pending' THEN 'agent.enable_requested' ELSE 'agent.enabled' END;
    END IF;
  ELSE
    v_next := 'off_by_choice';
    v_action := 'agent.disabled';
  END IF;

  INSERT INTO public.workspace_agent_activation (
    org_id, agent_id, stage, step_order, activated_at, activated_by, activated_by_label, note,
    requested_by, requested_by_label, requested_at, updated_at
  )
  VALUES (
    p_org_id, p_agent_id, v_next, 0,
    CASE WHEN v_next = 'on' THEN now() END, CASE WHEN v_next = 'on' THEN auth.uid() END,
    CASE WHEN v_next = 'on' THEN v_label END, NULL,
    CASE WHEN v_next = 'pending' THEN auth.uid() END, CASE WHEN v_next = 'pending' THEN v_label END,
    CASE WHEN v_next = 'pending' THEN now() END, now()
  )
  ON CONFLICT (org_id, agent_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    activated_at = COALESCE(EXCLUDED.activated_at, public.workspace_agent_activation.activated_at),
    activated_by = COALESCE(EXCLUDED.activated_by, public.workspace_agent_activation.activated_by),
    activated_by_label = COALESCE(EXCLUDED.activated_by_label, public.workspace_agent_activation.activated_by_label),
    requested_by = EXCLUDED.requested_by,
    requested_by_label = EXCLUDED.requested_by_label,
    requested_at = EXCLUDED.requested_at,
    updated_at = now();

  IF NOT p_on AND p_withdraw_open THEN
    UPDATE public.approval_items
      SET status = 'withdrawn', withdrawn_reason = 'Withdrawn because the agent was turned off.', updated_at = now()
      WHERE org_id = p_org_id AND agent_id = p_agent_id AND status = 'pending';
    GET DIAGNOSTICS v_withdrawn = ROW_COUNT;
  END IF;

  PERFORM public.ws_log(p_org_id, v_action, 'workspace_agent_activation', p_agent_id,
    jsonb_build_object('agent', p_agent_id, 'stage', v_next, 'withdrawn', v_withdrawn), auth.uid());
  RETURN jsonb_build_object('stage', v_next, 'withdrawn', v_withdrawn, 'action', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_set_enabled(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_set_enabled(uuid, text, boolean, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Interest in agents and areas that are not here yet
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text REFERENCES public.agent_registry (id),
  area_id text REFERENCES public.agent_areas (id),
  kind text NOT NULL CHECK (kind IN ('notify_me', 'request_access', 'early_access')),
  plan_id text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_interest_target CHECK ((agent_id IS NULL) <> (area_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_interest_once_idx
  ON public.agent_interest (org_id, COALESCE(agent_id, ''), COALESCE(area_id, ''), kind);

ALTER TABLE public.agent_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_interest FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_interest TO authenticated;
GRANT ALL ON public.agent_interest TO service_role;
DROP POLICY IF EXISTS agent_interest_select ON public.agent_interest;
CREATE POLICY agent_interest_select ON public.agent_interest FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));

CREATE OR REPLACE FUNCTION public.agent_record_interest(p_org_id uuid, p_agent_id text, p_area_id text, p_kind text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Only the Owner can ask for an agent.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.agent_interest (org_id, agent_id, area_id, kind, plan_id, requested_by)
  VALUES (p_org_id, p_agent_id, p_area_id, p_kind,
    (SELECT a.plan_id FROM public.billing_accounts a WHERE a.org_id = p_org_id), auth.uid())
  ON CONFLICT DO NOTHING;
  PERFORM public.ws_log(p_org_id, 'agent.interest', 'agent_interest', COALESCE(p_agent_id, p_area_id),
    jsonb_build_object('agent', p_agent_id, 'area', p_area_id, 'kind', p_kind), auth.uid());
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_record_interest(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_record_interest(uuid, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Run now: one claim per request, with the cooldown and the daily cap
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_run_now_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES public.agent_registry (id),
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  outcome text CHECK (outcome IS NULL OR char_length(outcome) <= 200)
);

CREATE INDEX IF NOT EXISTS agent_run_now_log_recent_idx ON public.agent_run_now_log (org_id, agent_id, requested_at DESC);

ALTER TABLE public.agent_run_now_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_run_now_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_run_now_log TO service_role;

-- The server calls this after it has checked the person may use Run now. It
-- refuses while the agent may not run, inside the cooldown, or past the cap.
CREATE OR REPLACE FUNCTION public.agent_run_now_claim(
  p_org_id uuid, p_agent_id text, p_user_id uuid, p_cooldown_minutes integer, p_daily_cap integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_may jsonb := public.agent_may_run(p_org_id, p_agent_id);
  v_last timestamptz;
  v_today integer;
  v_id bigint;
BEGIN
  IF NOT COALESCE((v_may ->> 'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_may ->> 'reason', 'by', v_may ->> 'by');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('run_now:' || p_org_id::text || ':' || p_agent_id));
  SELECT max(l.requested_at), count(*) FILTER (WHERE l.requested_at > now() - interval '1 day')::integer
  INTO v_last, v_today
  FROM public.agent_run_now_log l
  WHERE l.org_id = p_org_id AND l.agent_id = p_agent_id AND l.requested_at > now() - interval '1 day';
  IF v_last IS NOT NULL AND v_last > now() - make_interval(mins => GREATEST(p_cooldown_minutes, 1)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown',
      'availableAt', v_last + make_interval(mins => GREATEST(p_cooldown_minutes, 1)));
  END IF;
  IF COALESCE(v_today, 0) >= GREATEST(p_daily_cap, 1) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap',
      'availableAt', (SELECT min(l.requested_at) + interval '1 day' FROM public.agent_run_now_log l
        WHERE l.org_id = p_org_id AND l.agent_id = p_agent_id AND l.requested_at > now() - interval '1 day'));
  END IF;
  INSERT INTO public.agent_run_now_log (org_id, agent_id, requested_by) VALUES (p_org_id, p_agent_id, p_user_id)
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'agent.run_now', 'agent_run_now_log', p_agent_id,
    jsonb_build_object('agent', p_agent_id), p_user_id);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_run_now_claim(uuid, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_run_now_claim(uuid, text, uuid, integer, integer) TO service_role;

-- Relay's Run now: follow-ups already queued for this workspace are brought
-- forward to the next pass. Nothing is sent; drafts wait for approval.
CREATE OR REPLACE FUNCTION public.relay_bring_forward(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.relay_jobs SET next_attempt_at = now(), updated_at = now()
  WHERE org_id = p_org_id AND status = 'pending' AND next_attempt_at > now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.relay_bring_forward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relay_bring_forward(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. A person can hide a row from their own sidebar. It stays on.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_hidden (
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES public.agent_registry (id),
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id, agent_id)
);

ALTER TABLE public.agent_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_hidden FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.agent_hidden TO authenticated;
GRANT ALL ON public.agent_hidden TO service_role;
DROP POLICY IF EXISTS agent_hidden_own ON public.agent_hidden;
CREATE POLICY agent_hidden_own ON public.agent_hidden FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.ws_access(org_id) = 'owner');

-- ---------------------------------------------------------------------------
-- 6. Platform Admin registry tools
-- ---------------------------------------------------------------------------

-- Create or edit one agent entry. Every change is a new version with a note.
CREATE OR REPLACE FUNCTION public.agent_registry_save(p_id text, p_entry jsonb, p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_registry%ROWTYPE;
  v_exists boolean;
BEGIN
  PERFORM public.staff_require_admin();
  IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say what changed and why.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.agent_registry WHERE id = p_id;
  v_exists := FOUND;
  IF NOT v_exists THEN
    v_row.id := p_id;
    v_row.version := 0;
    v_row.works_on := '{}';
    v_row.beta_org_ids := '{}';
    v_row.included_plans := '{}';
    v_row.prerequisites := '{}';
    v_row.config_sections := '{}';
    v_row.autonomy := '{"automatic": [], "suggests": [], "never": []}'::jsonb;
    v_row.availability := 'coming_soon';
    v_row.activity_source := 'runs';
    v_row.output_source := 'activity';
    v_row.glyph := 'spark';
    v_row.accent := 'neutral';
    v_row.add_on := false;
    v_row.starts_on := false;
    v_row.private_runs := false;
    v_row.locked_reason := 'Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.';
    v_row.sort := 100;
  END IF;
  IF p_entry ? 'area_id' THEN v_row.area_id := NULLIF(p_entry ->> 'area_id', ''); END IF;
  IF p_entry ? 'name' THEN v_row.name := p_entry ->> 'name'; END IF;
  IF p_entry ? 'sublabel' THEN v_row.sublabel := p_entry ->> 'sublabel'; END IF;
  IF p_entry ? 'description' THEN v_row.description := p_entry ->> 'description'; END IF;
  IF p_entry ? 'long_description' THEN v_row.long_description := p_entry ->> 'long_description'; END IF;
  IF p_entry ? 'promise' THEN v_row.promise := p_entry ->> 'promise'; END IF;
  IF p_entry ? 'glyph' THEN v_row.glyph := p_entry ->> 'glyph'; END IF;
  IF p_entry ? 'accent' THEN v_row.accent := p_entry ->> 'accent'; END IF;
  IF p_entry ? 'availability' THEN v_row.availability := p_entry ->> 'availability'; END IF;
  IF p_entry ? 'beta_org_ids' THEN v_row.beta_org_ids := ARRAY(SELECT jsonb_array_elements_text(p_entry -> 'beta_org_ids'))::uuid[]; END IF;
  IF p_entry ? 'included_plans' THEN v_row.included_plans := ARRAY(SELECT jsonb_array_elements_text(p_entry -> 'included_plans')); END IF;
  IF p_entry ? 'add_on' THEN v_row.add_on := (p_entry ->> 'add_on')::boolean; END IF;
  IF p_entry ? 'locked_reason' THEN v_row.locked_reason := p_entry ->> 'locked_reason'; END IF;
  IF p_entry ? 'prerequisites' THEN v_row.prerequisites := ARRAY(SELECT jsonb_array_elements_text(p_entry -> 'prerequisites')); END IF;
  IF p_entry ? 'works_on' THEN v_row.works_on := ARRAY(SELECT jsonb_array_elements_text(p_entry -> 'works_on')); END IF;
  IF p_entry ? 'autonomy' THEN v_row.autonomy := p_entry -> 'autonomy'; END IF;
  IF p_entry ? 'sort' THEN v_row.sort := (p_entry ->> 'sort')::integer; END IF;
  IF p_entry ? 'output_source' THEN v_row.output_source := p_entry ->> 'output_source'; END IF;
  v_row.version := v_row.version + 1;
  v_row.updated_at := now();
  v_row.updated_by := auth.uid();
  IF v_exists THEN
    UPDATE public.agent_registry SET
      area_id = v_row.area_id, name = v_row.name, sublabel = v_row.sublabel, description = v_row.description,
      long_description = v_row.long_description, promise = v_row.promise, glyph = v_row.glyph, accent = v_row.accent,
      availability = v_row.availability, beta_org_ids = v_row.beta_org_ids, included_plans = v_row.included_plans,
      add_on = v_row.add_on, locked_reason = v_row.locked_reason, prerequisites = v_row.prerequisites,
      works_on = v_row.works_on, autonomy = v_row.autonomy, sort = v_row.sort, output_source = v_row.output_source,
      version = v_row.version, updated_at = v_row.updated_at, updated_by = v_row.updated_by
    WHERE id = p_id;
  ELSE
    INSERT INTO public.agent_registry SELECT v_row.*;
  END IF;
  INSERT INTO public.agent_registry_versions (kind, entry_id, version, entry, note, changed_by)
  VALUES ('agent', p_id, v_row.version, to_jsonb(v_row) - 'beta_org_ids', btrim(p_note), auth.uid());
  PERFORM public.ws_log(NULL, 'agent.registry_saved', 'agent_registry', p_id,
    jsonb_build_object('version', v_row.version), auth.uid());
  RETURN v_row.version;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_registry_save(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_registry_save(text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agent_area_save(p_id text, p_entry jsonb, p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_areas%ROWTYPE;
  v_exists boolean;
BEGIN
  PERFORM public.staff_require_admin();
  IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say what changed and why.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.agent_areas WHERE id = p_id;
  v_exists := FOUND;
  IF NOT v_exists THEN
    v_row.id := p_id;
    v_row.version := 0;
    v_row.availability := 'coming_soon';
    v_row.record_kind := 'lead';
    v_row.description := '';
    v_row.sort := 100;
  END IF;
  IF p_entry ? 'name' THEN v_row.name := p_entry ->> 'name'; END IF;
  IF p_entry ? 'description' THEN v_row.description := p_entry ->> 'description'; END IF;
  IF p_entry ? 'record_kind' THEN v_row.record_kind := p_entry ->> 'record_kind'; END IF;
  IF p_entry ? 'work_page' THEN v_row.work_page := NULLIF(p_entry -> 'work_page', 'null'::jsonb); END IF;
  IF p_entry ? 'home_page' THEN v_row.home_page := NULLIF(p_entry -> 'home_page', 'null'::jsonb); END IF;
  IF p_entry ? 'availability' THEN v_row.availability := p_entry ->> 'availability'; END IF;
  IF p_entry ? 'sort' THEN v_row.sort := (p_entry ->> 'sort')::integer; END IF;
  v_row.version := v_row.version + 1;
  v_row.updated_at := now();
  v_row.updated_by := auth.uid();
  IF v_exists THEN
    UPDATE public.agent_areas SET name = v_row.name, description = v_row.description, record_kind = v_row.record_kind,
      work_page = v_row.work_page, home_page = v_row.home_page, availability = v_row.availability, sort = v_row.sort,
      version = v_row.version, updated_at = v_row.updated_at, updated_by = v_row.updated_by
    WHERE id = p_id;
  ELSE
    INSERT INTO public.agent_areas SELECT v_row.*;
  END IF;
  INSERT INTO public.agent_registry_versions (kind, entry_id, version, entry, note, changed_by)
  VALUES ('area', p_id, v_row.version, to_jsonb(v_row), btrim(p_note), auth.uid());
  PERFORM public.ws_log(NULL, 'agent.area_saved', 'agent_areas', p_id, jsonb_build_object('version', v_row.version), auth.uid());
  RETURN v_row.version;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_area_save(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_area_save(text, jsonb, text) TO authenticated, service_role;

-- Lock or unlock one agent for one workspace, without a plan change.
CREATE OR REPLACE FUNCTION public.agent_set_lock(p_org_id uuid, p_agent_id text, p_locked boolean, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.billing_overrides WHERE org_id = p_org_id AND entitlement_key = 'agent:' || p_agent_id;
  IF p_locked THEN
    INSERT INTO public.billing_overrides (org_id, entitlement_key, enabled, reason, created_by)
    VALUES (p_org_id, 'agent:' || p_agent_id, false, left(btrim(p_reason), 500), auth.uid());
  END IF;
  PERFORM public.ws_log(p_org_id, CASE WHEN p_locked THEN 'agent.locked' ELSE 'agent.unlocked' END,
    'billing_overrides', p_agent_id, jsonb_build_object('agent', p_agent_id, 'reason', left(btrim(p_reason), 300)), auth.uid());
  RETURN p_locked;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_set_lock(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_set_lock(uuid, text, boolean, text) TO authenticated, service_role;

-- Per agent, across every workspace staff can see: how many are On and in
-- which live state, plus interest counts. Counts only.
CREATE OR REPLACE FUNCTION public.staff_agent_registry_overview()
RETURNS TABLE (
  agent_id text,
  workspaces_on integer,
  working integer,
  waiting integer,
  attention integer,
  stopped integer,
  paused integer,
  notify_me integer,
  request_access integer,
  early_access integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT o.id FROM public.organizations o WHERE o.id IN (SELECT public.staff_scope_org_ids('all'))
  )
  SELECT r.id,
    (SELECT count(*)::integer FROM scope s
       LEFT JOIN public.workspace_agent_activation w ON w.org_id = s.id AND w.agent_id = r.id
       WHERE COALESCE(w.stage, CASE WHEN r.starts_on THEN 'on' END) IN ('on', 'watch', 'drafts_only')),
    (SELECT count(DISTINCT x.org_id)::integer FROM public.agent_activity_runs x
       WHERE x.agent_id = r.id AND x.org_id IN (SELECT id FROM scope) AND x.status IN ('queued', 'working')
         AND x.last_progress_at > now() - interval '10 minutes'),
    (SELECT count(DISTINCT a.org_id)::integer FROM public.approval_items a
       WHERE a.agent_id = r.id AND a.org_id IN (SELECT id FROM scope) AND a.status IN ('pending', 'approved')),
    (SELECT count(DISTINCT x.org_id)::integer FROM public.agent_activity_runs x
       WHERE x.agent_id = r.id AND x.org_id IN (SELECT id FROM scope)
         AND (x.status IN ('stuck', 'waiting_provider')
           OR (x.status IN ('queued', 'working') AND x.last_progress_at <= now() - interval '10 minutes'))),
    (SELECT count(DISTINCT x.org_id)::integer FROM public.agent_activity_runs x
       WHERE x.agent_id = r.id AND x.org_id IN (SELECT id FROM scope) AND x.status = 'failed'
         AND x.created_at > now() - interval '24 hours'),
    (SELECT count(*)::integer FROM public.agent_presence_controls c
       WHERE c.agent_id = r.id AND c.paused AND c.org_id IN (SELECT id FROM scope)),
    (SELECT count(*)::integer FROM public.agent_interest i WHERE i.agent_id = r.id AND i.kind = 'notify_me'),
    (SELECT count(*)::integer FROM public.agent_interest i WHERE i.agent_id = r.id AND i.kind = 'request_access'),
    (SELECT count(*)::integer FROM public.agent_interest i WHERE i.agent_id = r.id AND i.kind = 'early_access')
  FROM public.agent_registry r
  WHERE public.is_platform_staff()
  ORDER BY r.sort, r.id;
$$;

REVOKE ALL ON FUNCTION public.staff_agent_registry_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_agent_registry_overview() TO authenticated, service_role;

-- Every agent's state in one workspace, for the staff enablement matrix.
CREATE OR REPLACE FUNCTION public.staff_workspace_agents(p_org_id uuid)
RETURNS TABLE (agent_id text, stage text, plan_allowed boolean, locked_override boolean, paused boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, w.stage, public.agent_plan_allows(p_org_id, r.id),
    EXISTS (SELECT 1 FROM public.billing_overrides o WHERE o.org_id = p_org_id AND o.entitlement_key = 'agent:' || r.id AND o.enabled = false
      AND (o.expires_at IS NULL OR o.expires_at > now())),
    COALESCE(c.paused, false)
  FROM public.agent_registry r
  LEFT JOIN public.workspace_agent_activation w ON w.org_id = p_org_id AND w.agent_id = r.id
  LEFT JOIN public.agent_presence_controls c ON c.org_id = p_org_id AND c.agent_id = r.id
  WHERE public.ws_is_staff(p_org_id)
  ORDER BY r.sort, r.id;
$$;

REVOKE ALL ON FUNCTION public.staff_workspace_agents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_workspace_agents(uuid) TO authenticated, service_role;

-- Interest in areas that have no agents yet (Client Retention).
CREATE OR REPLACE FUNCTION public.staff_area_interest()
RETURNS TABLE (area_id text, notify_me integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, (SELECT count(*)::integer FROM public.agent_interest i WHERE i.area_id = a.id AND i.kind = 'notify_me')
  FROM public.agent_areas a
  WHERE public.is_platform_staff()
  ORDER BY a.sort, a.id;
$$;

REVOKE ALL ON FUNCTION public.staff_area_interest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_area_interest() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. "Waiting on you", worked out once per request
-- ---------------------------------------------------------------------------

-- The one definition of an item waiting on a person: an agent request that
-- is open (pending, or approved and waiting to be sent) that this person can
-- see. Visibility is the approval_items policy: owners and admins, the
-- Vistrial team, people with the approval grant, and whoever it is assigned
-- to. Worked out once per call instead of once per row.
CREATE OR REPLACE FUNCTION public.agent_waiting_for(p_org_id uuid)
RETURNS TABLE (id uuid, org_id uuid, agent_id text, run_id uuid, kind text, status text, title text, lead_ids uuid[], created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all boolean;
  v_member uuid := public.user_member_id(p_org_id);
BEGIN
  IF public.ws_access(p_org_id) IS NULL THEN
    RETURN;
  END IF;
  v_all := COALESCE(public.user_has_org_role(p_org_id, 'owner', 'admin'), false)
    OR public.ws_is_staff(p_org_id)
    OR COALESCE(p_org_id IN (SELECT public.user_approver_org_ids()), false);
  RETURN QUERY
  SELECT a.id, a.org_id, a.agent_id, a.run_id,
    CASE WHEN a.action_type = 'agent_question' THEN 'question' ELSE 'approval' END,
    a.status, a.title, a.lead_ids, a.created_at
  FROM public.approval_items a
  WHERE a.org_id = p_org_id
    AND a.agent_id IS NOT NULL
    AND a.status IN ('pending', 'approved')
    AND (v_all OR (a.assigned_member_id IS NOT NULL AND a.assigned_member_id = v_member));
END;
$$;

REVOKE ALL ON FUNCTION public.agent_waiting_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_waiting_for(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agent_waiting_count(p_org_id uuid, p_agent_id text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.agent_waiting_for(p_org_id) w
  WHERE p_agent_id IS NULL OR w.agent_id = p_agent_id;
$$;

REVOKE ALL ON FUNCTION public.agent_waiting_count(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_waiting_count(uuid, text) TO authenticated, service_role;

-- The view from step 1 is replaced by the function above: one definition.
DROP VIEW IF EXISTS public.agent_waiting_items;


CREATE INDEX IF NOT EXISTS agent_activity_runs_completed_idx
  ON public.agent_activity_runs (org_id, agent_id, created_at DESC)
  WHERE status = 'completed';

-- ---------------------------------------------------------------------------
-- 7. The summary carries the new states, hidden rows and interest
-- ---------------------------------------------------------------------------

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
    'sidebar', COALESCE((SELECT f.enabled FROM public.workspace_flags f WHERE f.org_id = p_org_id AND f.flag = 'agent_sidebar'), false),
    'areas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'description', a.description, 'recordKind', a.record_kind,
        'workPage', a.work_page, 'homePage', a.home_page, 'availability', a.availability, 'sort', a.sort,
        'interest', CASE WHEN v_access IN ('owner', 'service_team', 'platform_admin') THEN COALESCE((
          SELECT jsonb_agg(DISTINCT i.kind) FROM public.agent_interest i WHERE i.org_id = p_org_id AND i.area_id = a.id
        ), '[]'::jsonb) ELSE '[]'::jsonb END
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
        'requestedByLabel', CASE WHEN w.stage = 'pending' THEN w.requested_by_label END,
        'requestedAt', CASE WHEN w.stage = 'pending' THEN w.requested_at END,
        'hidden', EXISTS (SELECT 1 FROM public.agent_hidden x WHERE x.user_id = auth.uid() AND x.org_id = p_org_id AND x.agent_id = r.id),
        'interest', CASE WHEN v_access IN ('owner', 'service_team', 'platform_admin') THEN COALESCE((
          SELECT jsonb_agg(DISTINCT i.kind) FROM public.agent_interest i WHERE i.org_id = p_org_id AND i.agent_id = r.id
        ), '[]'::jsonb) ELSE '[]'::jsonb END,
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

CREATE OR REPLACE FUNCTION public.agent_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  v_access text := public.ws_access(p_org_id);
  v_member uuid := public.user_member_id(p_org_id);
  v_operator boolean;
  v_leads uuid[];
  v_private boolean;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  v_operator := v_access = 'operator';
  IF v_operator THEN
    v_leads := ARRAY(SELECT l.id FROM public.leads l WHERE l.org_id = p_org_id AND l.id IN (SELECT public.operator_visible_lead_ids()));
  END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(v_frame -> 'agents') LOOP
    v_id := a ->> 'id';
    v_private := COALESCE((a ->> 'privateRuns')::boolean, false);
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
        FROM public.agent_waiting_for(p_org_id) w
        WHERE w.agent_id = v_id
      ),
      'openRun', (
        SELECT jsonb_build_object(
          'id', r.id, 'status', r.status, 'step', r.current_step_label, 'subject', r.subject_label,
          'leadId', r.lead_id, 'lastProgressAt', r.last_progress_at, 'createdAt', r.created_at
        )
        FROM public.agent_activity_runs r
        WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status IN ('queued', 'working', 'waiting_provider')
          AND (CASE WHEN v_private THEN r.actor_member_id = v_member ELSE (NOT v_operator OR r.lead_id = ANY (v_leads)) END)
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
          AND (CASE WHEN v_private THEN r.actor_member_id = v_member ELSE (NOT v_operator OR r.lead_id = ANY (v_leads)) END)
        ORDER BY r.created_at DESC
        LIMIT 1
      ),
      'waitingRunsWithoutItem', (
        SELECT count(*)::integer
        FROM public.agent_activity_runs r
        WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status = 'waiting_person'
          AND (CASE WHEN v_private THEN r.actor_member_id = v_member ELSE (NOT v_operator OR r.lead_id = ANY (v_leads)) END)
          AND NOT EXISTS (SELECT 1 FROM public.agent_waiting_for(p_org_id) w WHERE w.run_id = r.id)
      ),
      'doneToday', CASE WHEN a ->> 'activitySource' = 'scores' THEN (
          SELECT count(*)::integer FROM (
            SELECT 1 FROM public.lead_score_history s
            WHERE s.org_id = p_org_id AND NOT s.historic AND s.created_at >= v_day AND (NOT v_operator OR s.lead_id = ANY (v_leads))
            LIMIT 100
          ) capped
        ) ELSE (
          SELECT count(*)::integer FROM (
            SELECT 1 FROM public.agent_activity_runs r
            WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status = 'completed' AND r.created_at >= v_day
          AND (CASE WHEN v_private THEN r.actor_member_id = v_member ELSE (NOT v_operator OR r.lead_id = ANY (v_leads)) END)
            LIMIT 100
          ) capped
        ) END,
      'lastDoneAt', CASE WHEN a ->> 'activitySource' = 'scores' THEN (
          SELECT s.created_at FROM public.lead_score_history s
          WHERE s.org_id = p_org_id AND NOT s.historic AND s.created_at >= now() - interval '30 days' AND (NOT v_operator OR s.lead_id = ANY (v_leads))
          ORDER BY s.created_at DESC
          LIMIT 1
        ) ELSE (
          SELECT COALESCE(r.finished_at, r.last_progress_at) FROM public.agent_activity_runs r
          WHERE r.org_id = p_org_id AND r.agent_id = v_id AND r.status = 'completed' AND r.created_at >= now() - interval '30 days'
          AND (CASE WHEN v_private THEN r.actor_member_id = v_member ELSE (NOT v_operator OR r.lead_id = ANY (v_leads)) END)
          ORDER BY r.created_at DESC
          LIMIT 1
        ) END,
      'outputs', CASE a ->> 'outputSource'
        WHEN 'requests' THEN COALESCE((
          SELECT jsonb_agg(x ORDER BY x ->> 'at' DESC) FROM (
            SELECT jsonb_build_object(
              'id', w.id, 'kind', w.kind, 'title', w.title, 'status', w.status, 'at', w.created_at,
              'runId', w.run_id, 'leadId', l.id, 'leadName', NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), '')
            ) AS x
            FROM public.agent_waiting_for(p_org_id) w
            LEFT JOIN public.leads l ON l.id = w.lead_ids[1] AND l.org_id = p_org_id AND (NOT v_operator OR l.id = ANY (v_leads))
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
            JOIN public.leads l ON l.id = k.lead_id AND l.org_id = p_org_id AND (NOT v_operator OR l.id = ANY (v_leads))
            WHERE k.org_id = p_org_id AND k.state IN ('on_time', 'at_risk', 'missed') AND k.deadline_at IS NOT NULL
              AND (NOT v_operator OR k.lead_id = ANY (v_leads))
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
            JOIN public.leads l ON l.id = s.lead_id AND l.org_id = p_org_id AND (NOT v_operator OR l.id = ANY (v_leads))
            WHERE s.org_id = p_org_id AND NOT s.historic AND s.previous_tier IS DISTINCT FROM s.tier AND (NOT v_operator OR s.lead_id = ANY (v_leads))
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
            LEFT JOIN public.leads l ON l.id = o.lead_id AND l.org_id = p_org_id AND (NOT v_operator OR l.id = ANY (v_leads))
            WHERE o.org_id = p_org_id AND o.agent_id = v_id
              AND (CASE WHEN v_private THEN o.actor_member_id = v_member ELSE (NOT v_operator OR o.lead_id = ANY (v_leads)) END)
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
    'sidebar', v_frame -> 'sidebar',
    'areas', v_frame -> 'areas',
    'agents', v_agents,
    -- Every open agent request this person can see, whatever the agent's
    -- state. The Overview badge and the Decisions section show this number.
    'waitingTotal', public.agent_waiting_count(p_org_id)
  );
END;
$$;
