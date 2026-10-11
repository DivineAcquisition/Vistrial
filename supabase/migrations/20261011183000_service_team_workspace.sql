-- The Service Team workspace: the staff side of Vistrial.
--
-- Everything here is scoped to user_staff_org_ids(): a Platform Admin sees
-- every workspace, Service Team only their active assignments. Cross-workspace
-- readers are SECURITY DEFINER functions that start from that list, so lists,
-- counts, search and exports never reach an unassigned workspace. Internal
-- staff notes live in tables no customer policy can read and no customer
-- export selects.

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_require(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL OR NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a Platform Admin can do this.' USING ERRCODE = '42501';
  END IF;
END;
$$;

/** Service-role callers (scheduled jobs) see every workspace; people see their staff list. */
CREATE OR REPLACE FUNCTION public.staff_scope_org_ids(p_scope text DEFAULT 'all')
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id FROM public.organizations o
  WHERE auth.uid() IS NULL AND COALESCE(auth.role(), '') = 'service_role'
  UNION
  SELECT x.id FROM public.user_staff_org_ids() AS x(id)
  WHERE auth.uid() IS NOT NULL
    AND (
      COALESCE(p_scope, 'all') <> 'mine'
      OR EXISTS (
        SELECT 1 FROM public.workspace_assignments a
        WHERE a.org_id = x.id AND a.user_id = auth.uid() AND a.ended_at IS NULL
      )
    );
$$;

/** "Jordan M." from "Jordan Morales". */
CREATE OR REPLACE FUNCTION public.staff_short_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN 'A team member'
    WHEN position(' ' IN btrim(p_name)) = 0 THEN btrim(p_name)
    ELSE split_part(btrim(p_name), ' ', 1) || ' ' || upper(left(regexp_replace(btrim(p_name), '^.*\s', ''), 1)) || '.'
  END;
$$;

CREATE OR REPLACE FUNCTION public.staff_default_owner(p_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.user_id
  FROM public.workspace_assignments a
  JOIN public.platform_staff s ON s.user_id = a.user_id AND s.active
  WHERE a.org_id = p_org_id AND a.ended_at IS NULL
  ORDER BY a.assigned_at, a.user_id
  LIMIT 1;
$$;

/** True when the person may be handed work in this workspace. */
CREATE OR REPLACE FUNCTION public.staff_can_work(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff s
    WHERE s.user_id = p_user_id AND s.active
      AND (
        s.role = 'platform_admin'
        OR EXISTS (
          SELECT 1 FROM public.workspace_assignments a
          WHERE a.org_id = p_org_id AND a.user_id = p_user_id AND a.ended_at IS NULL
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Support settings: business hours, request timings, routing, sign-in
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_support_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  business_tz text NOT NULL DEFAULT 'America/New_York',
  business_days smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  business_start time NOT NULL DEFAULT '09:00',
  business_end time NOT NULL DEFAULT '18:00',
  flag_after_minutes integer NOT NULL DEFAULT 240 CHECK (flag_after_minutes BETWEEN 15 AND 10080),
  escalate_after_minutes integer NOT NULL DEFAULT 540 CHECK (escalate_after_minutes BETWEEN 30 AND 20160),
  data_request_target_days integer NOT NULL DEFAULT 5 CHECK (data_request_target_days BETWEEN 1 AND 60),
  deletion_wait_days integer NOT NULL DEFAULT 14 CHECK (deletion_wait_days BETWEEN 1 AND 90),
  export_link_days integer NOT NULL DEFAULT 7 CHECK (export_link_days BETWEEN 1 AND 30),
  staff_session_max_minutes integer NOT NULL DEFAULT 60 CHECK (staff_session_max_minutes BETWEEN 5 AND 480),
  staff_session_idle_minutes integer NOT NULL DEFAULT 30 CHECK (staff_session_idle_minutes BETWEEN 5 AND 240),
  routing jsonb NOT NULL DEFAULT jsonb_build_object(
    'escalation', 'assigned_then_admins',
    'request_new', 'assigned_then_admins',
    'request_overdue', 'assigned_and_admins',
    'request_escalated', 'admins',
    'connection_failure', 'assigned_then_admins',
    'provider_outage', 'admins',
    'agent_failure', 'assigned_then_admins',
    'data_request', 'assigned_and_admins'
  ),
  mfa_enforced_at timestamptz,
  mfa_enforced_by uuid,
  mfa_grace_days integer NOT NULL DEFAULT 7 CHECK (mfa_grace_days BETWEEN 0 AND 30),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_support_settings_hours CHECK (business_end > business_start),
  CONSTRAINT staff_support_settings_order CHECK (escalate_after_minutes > flag_after_minutes)
);
INSERT INTO public.staff_support_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.staff_support_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_support_settings_select ON public.staff_support_settings;
CREATE POLICY staff_support_settings_select ON public.staff_support_settings FOR SELECT TO authenticated
  USING (public.is_platform_staff());
GRANT SELECT ON public.staff_support_settings TO authenticated;
GRANT ALL ON public.staff_support_settings TO service_role;

CREATE OR REPLACE FUNCTION public.staff_support_settings_save(p_patch jsonb)
RETURNS public.staff_support_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_support_settings%ROWTYPE;
  v_routing jsonb;
  v_key text;
BEGIN
  PERFORM public.staff_require_admin();
  SELECT * INTO v_row FROM public.staff_support_settings WHERE id FOR UPDATE;
  IF p_patch ? 'business_tz' THEN
    PERFORM now() AT TIME ZONE (p_patch->>'business_tz');
  END IF;
  v_routing := COALESCE(p_patch->'routing', v_row.routing);
  FOR v_key IN SELECT jsonb_object_keys(v_routing) LOOP
    IF v_routing->>v_key NOT IN ('assigned_then_admins', 'assigned_and_admins', 'admins') THEN
      RAISE EXCEPTION 'Unknown routing choice.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE public.staff_support_settings SET
    business_tz = COALESCE(p_patch->>'business_tz', business_tz),
    business_days = COALESCE((SELECT array_agg(x::smallint ORDER BY x::int) FROM jsonb_array_elements_text(p_patch->'business_days') x WHERE x ~ '^[1-7]$'), business_days),
    business_start = COALESCE((p_patch->>'business_start')::time, business_start),
    business_end = COALESCE((p_patch->>'business_end')::time, business_end),
    flag_after_minutes = COALESCE((p_patch->>'flag_after_minutes')::int, flag_after_minutes),
    escalate_after_minutes = COALESCE((p_patch->>'escalate_after_minutes')::int, escalate_after_minutes),
    data_request_target_days = COALESCE((p_patch->>'data_request_target_days')::int, data_request_target_days),
    routing = v_routing,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id
  RETURNING * INTO v_row;
  IF cardinality(v_row.business_days) = 0 THEN
    RAISE EXCEPTION 'Choose at least one business day.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.ws_log(NULL, 'support.settings_changed', 'staff_support_settings', 'support',
    jsonb_build_object('keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)), auth.uid());
  RETURN v_row;
END;
$$;

/** Minutes of business time between two moments, using the support settings. */
CREATE OR REPLACE FUNCTION public.staff_business_minutes(p_from timestamptz, p_to timestamptz)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.staff_support_settings%ROWTYPE;
  v_total numeric := 0;
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_from timestamptz;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RETURN 0;
  END IF;
  SELECT * INTO s FROM public.staff_support_settings WHERE id;
  v_from := GREATEST(p_from, p_to - interval '120 days');
  FOR v_day IN
    SELECT d::date FROM generate_series((v_from AT TIME ZONE s.business_tz)::date, (p_to AT TIME ZONE s.business_tz)::date, interval '1 day') d
  LOOP
    IF extract(isodow FROM v_day)::smallint = ANY (s.business_days) THEN
      v_start := (v_day + s.business_start) AT TIME ZONE s.business_tz;
      v_end := (v_day + s.business_end) AT TIME ZONE s.business_tz;
      v_total := v_total + GREATEST(0, extract(epoch FROM (LEAST(v_end, p_to) - GREATEST(v_start, v_from))) / 60);
    END IF;
  END LOOP;
  RETURN floor(v_total)::int;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Health rules: the thresholds behind the health indicator, versioned
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_health_rules (
  version integer PRIMARY KEY,
  rules jsonb NOT NULL,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 600),
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.staff_health_rules (version, rules, description, created_by_name)
VALUES (1, jsonb_build_object(
  'connection_failing', true,
  'open_escalation', true,
  'request_overdue', true,
  'payment_failed', true,
  'failed_runs_24h', 3,
  'response_met_percent', 80,
  'response_min_leads', 10,
  'response_period_days', 30,
  'draft_oldest_hours', 24,
  'onboarding_stall_days', 7,
  'agent_paused_watch', true
), 'First version: the defaults agreed for launch.', 'Vistrial')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.staff_health_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_health_rules_select ON public.staff_health_rules;
CREATE POLICY staff_health_rules_select ON public.staff_health_rules FOR SELECT TO authenticated
  USING (public.is_platform_staff());
GRANT SELECT ON public.staff_health_rules TO authenticated;
GRANT ALL ON public.staff_health_rules TO service_role;

CREATE OR REPLACE FUNCTION public.staff_health_rules_save(p_rules jsonb, p_description text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_current jsonb;
  v_key text;
BEGIN
  PERFORM public.staff_require_admin();
  IF char_length(btrim(COALESCE(p_description, ''))) = 0 THEN
    RAISE EXCEPTION 'Describe the change in a sentence.' USING ERRCODE = '22023';
  END IF;
  SELECT rules INTO v_current FROM public.staff_health_rules ORDER BY version DESC LIMIT 1;
  FOR v_key IN SELECT jsonb_object_keys(p_rules) LOOP
    IF NOT (v_current ? v_key) THEN
      RAISE EXCEPTION 'Unknown health factor.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_rules->v_key) <> jsonb_typeof(v_current->v_key) THEN
      RAISE EXCEPTION 'That value does not fit the factor.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.staff_health_rules;
  INSERT INTO public.staff_health_rules (version, rules, description, created_by, created_by_name)
  VALUES (v_version, v_current || p_rules, left(btrim(p_description), 600), auth.uid(),
    (SELECT display_name FROM public.platform_staff WHERE user_id = auth.uid()));
  PERFORM public.ws_log(NULL, 'health_rules.changed', 'staff_health_rules', v_version::text,
    jsonb_build_object('version', v_version, 'description', left(btrim(p_description), 600)), auth.uid());
  RETURN v_version;
END;
$$;

-- The last computed level per workspace, for "since you last looked".
-- Billing never contributes here, so Service Team without billing access
-- never learns of a payment problem from it.
CREATE TABLE IF NOT EXISTS public.workspace_health_state (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('healthy', 'watch', 'needs_attention', 'onboarding')),
  previous_level text,
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules_version integer,
  changed_at timestamptz NOT NULL DEFAULT now(),
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_health_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_health_state_select ON public.workspace_health_state;
CREATE POLICY workspace_health_state_select ON public.workspace_health_state FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()));
GRANT SELECT ON public.workspace_health_state TO authenticated;
GRANT ALL ON public.workspace_health_state TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Per-workspace controls: staff approvals (owner only) and Operator summaries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_controls (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  staff_may_approve boolean NOT NULL DEFAULT false,
  staff_may_approve_changed_by uuid,
  staff_may_approve_changed_at timestamptz,
  operator_summaries_enabled boolean NOT NULL DEFAULT true,
  operator_summaries_note text CHECK (operator_summaries_note IS NULL OR char_length(operator_summaries_note) <= 300),
  operator_summaries_changed_by uuid,
  operator_summaries_changed_at timestamptz
);
ALTER TABLE public.workspace_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_controls_select ON public.workspace_controls;
CREATE POLICY workspace_controls_select ON public.workspace_controls FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT ON public.workspace_controls TO authenticated;
GRANT ALL ON public.workspace_controls TO service_role;

CREATE OR REPLACE FUNCTION public.staff_may_approve(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT c.staff_may_approve FROM public.workspace_controls c WHERE c.org_id = p_org_id), false);
$$;

/** Only the workspace's Owner can let the Vistrial team approve on the workspace's behalf. */
CREATE OR REPLACE FUNCTION public.set_staff_approval(p_org_id uuid, p_allowed boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id NOT IN (SELECT public.user_owner_org_ids()) THEN
    RAISE EXCEPTION 'Only an Owner of this workspace can change this.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.workspace_controls (org_id, staff_may_approve, staff_may_approve_changed_by, staff_may_approve_changed_at)
  VALUES (p_org_id, p_allowed, auth.uid(), now())
  ON CONFLICT (org_id) DO UPDATE
    SET staff_may_approve = EXCLUDED.staff_may_approve,
        staff_may_approve_changed_by = EXCLUDED.staff_may_approve_changed_by,
        staff_may_approve_changed_at = EXCLUDED.staff_may_approve_changed_at;
  PERFORM public.ws_log(p_org_id, CASE WHEN p_allowed THEN 'approval.staff_allowed' ELSE 'approval.staff_disallowed' END,
    'workspace_controls', p_org_id::text, '{}'::jsonb, auth.uid());
  RETURN p_allowed;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_operator_summaries(p_org_id uuid, p_enabled boolean, p_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  PERFORM public.staff_require(p_org_id);
  IF NOT p_enabled AND char_length(btrim(COALESCE(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Say why, for example who asked.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspace_controls (org_id, operator_summaries_enabled, operator_summaries_note, operator_summaries_changed_by, operator_summaries_changed_at)
  VALUES (p_org_id, p_enabled, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), auth.uid(), now())
  ON CONFLICT (org_id) DO UPDATE
    SET operator_summaries_enabled = EXCLUDED.operator_summaries_enabled,
        operator_summaries_note = EXCLUDED.operator_summaries_note,
        operator_summaries_changed_by = EXCLUDED.operator_summaries_changed_by,
        operator_summaries_changed_at = EXCLUDED.operator_summaries_changed_at;
  PERFORM public.ws_log(p_org_id, CASE WHEN p_enabled THEN 'staff_internal.operator_summaries_on' ELSE 'staff_internal.operator_summaries_off' END,
    'workspace_controls', p_org_id::text, jsonb_build_object('note', left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300)), auth.uid());
  RETURN p_enabled;
END;
$$;

-- Staff decide approvals only when the workspace's Owner allowed it. The send-time
-- re-check in gate_mark_sent is unchanged and applies to every decision.
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
  IF p_org_id IN (SELECT public.user_owner_org_ids()) THEN
    RETURN true;
  END IF;
  IF public.ws_is_staff(p_org_id) THEN
    RETURN public.staff_may_approve(p_org_id);
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

-- ---------------------------------------------------------------------------
-- 4. Carrier registration: entered by staff, since no provider reports it yet
-- ---------------------------------------------------------------------------

ALTER TABLE public.messaging_readiness
  ADD COLUMN IF NOT EXISTS carrier_status text NOT NULL DEFAULT 'not_registered',
  ADD COLUMN IF NOT EXISTS carrier_note text,
  ADD COLUMN IF NOT EXISTS carrier_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier_updated_by uuid;
ALTER TABLE public.messaging_readiness DROP CONSTRAINT IF EXISTS messaging_readiness_carrier_status;
ALTER TABLE public.messaging_readiness ADD CONSTRAINT messaging_readiness_carrier_status
  CHECK (carrier_status IN ('not_registered', 'pending', 'approved', 'rejected'));
ALTER TABLE public.messaging_readiness DROP CONSTRAINT IF EXISTS messaging_readiness_carrier_note_len;
ALTER TABLE public.messaging_readiness ADD CONSTRAINT messaging_readiness_carrier_note_len
  CHECK (carrier_note IS NULL OR char_length(carrier_note) <= 300);

CREATE OR REPLACE FUNCTION public.set_carrier_registration(p_org_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require(p_org_id);
  IF p_status NOT IN ('not_registered', 'pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.messaging_readiness (org_id, carrier_status, carrier_note, carrier_updated_at, carrier_updated_by, updated_at)
  VALUES (p_org_id, p_status, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), now(), auth.uid(), now())
  ON CONFLICT (org_id) DO UPDATE
    SET carrier_status = EXCLUDED.carrier_status,
        carrier_note = EXCLUDED.carrier_note,
        carrier_updated_at = now(),
        carrier_updated_by = auth.uid(),
        updated_at = now();
  PERFORM public.ws_log(p_org_id, 'messaging.carrier_status_set', 'messaging_readiness', p_org_id::text,
    jsonb_build_object('status', p_status), auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Staff-only notes, item notes, saved views, preferences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_notes_org_idx ON public.staff_notes (org_id, created_at DESC);
COMMENT ON TABLE public.staff_notes IS
  'Internal notes about a workspace, by the Vistrial team. Never shown on a customer page, in a customer export, or in agent context.';

ALTER TABLE public.staff_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_notes_select ON public.staff_notes;
CREATE POLICY staff_notes_select ON public.staff_notes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()));
GRANT SELECT ON public.staff_notes TO authenticated;
GRANT ALL ON public.staff_notes TO service_role;

CREATE OR REPLACE FUNCTION public.staff_note_add(p_org_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.staff_require(p_org_id);
  IF char_length(btrim(COALESCE(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'Write the note first.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.staff_notes (org_id, author_user_id, author_name, body)
  VALUES (p_org_id, auth.uid(), COALESCE((SELECT display_name FROM public.platform_staff WHERE user_id = auth.uid()), 'Vistrial'), left(btrim(p_body), 4000))
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'staff_internal.note_added', 'staff_notes', v_id::text, '{}'::jsonb, auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_note_archive(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note public.staff_notes%ROWTYPE;
BEGIN
  SELECT * INTO v_note FROM public.staff_notes WHERE id = p_note_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.staff_require(v_note.org_id);
  IF v_note.author_user_id <> auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only the author or a Platform Admin can archive a note.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.staff_notes SET archived_at = now(), archived_by = auth.uid() WHERE id = p_note_id AND archived_at IS NULL;
  PERFORM public.ws_log(v_note.org_id, 'staff_internal.note_archived', 'staff_notes', p_note_id::text, '{}'::jsonb, auth.uid());
END;
$$;

CREATE TABLE IF NOT EXISTS public.staff_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  page text NOT NULL CHECK (page IN ('roster', 'queue', 'audit', 'data_requests')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page, name)
);
ALTER TABLE public.staff_saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_saved_views_own ON public.staff_saved_views;
CREATE POLICY staff_saved_views_own ON public.staff_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_platform_staff())
  WITH CHECK (user_id = auth.uid() AND public.is_platform_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_saved_views TO authenticated;
GRANT ALL ON public.staff_saved_views TO service_role;

CREATE TABLE IF NOT EXISTS public.staff_preferences (
  user_id uuid PRIMARY KEY,
  roster_columns text[],
  last_looked_at timestamptz,
  previous_looked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_preferences_own ON public.staff_preferences;
CREATE POLICY staff_preferences_own ON public.staff_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT ON public.staff_preferences TO authenticated;
GRANT ALL ON public.staff_preferences TO service_role;

CREATE OR REPLACE FUNCTION public.staff_save_columns(p_columns text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.staff_preferences (user_id, roster_columns, updated_at)
  VALUES (auth.uid(), p_columns[1:30], now())
  ON CONFLICT (user_id) DO UPDATE SET roster_columns = EXCLUDED.roster_columns, updated_at = now();
END;
$$;

/** Returns the moment to compare against, then moves the marker (at most every 30 minutes). */
CREATE OR REPLACE FUNCTION public.staff_mark_home_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_preferences%ROWTYPE;
  v_since timestamptz;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.staff_preferences WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.staff_preferences (user_id, last_looked_at, previous_looked_at)
    VALUES (auth.uid(), now(), now() - interval '1 day');
    RETURN now() - interval '1 day';
  END IF;
  IF v_row.last_looked_at IS NULL OR v_row.last_looked_at < now() - interval '30 minutes' THEN
    v_since := COALESCE(v_row.last_looked_at, now() - interval '1 day');
    UPDATE public.staff_preferences SET previous_looked_at = v_since, last_looked_at = now(), updated_at = now()
    WHERE user_id = auth.uid();
    RETURN v_since;
  END IF;
  RETURN COALESCE(v_row.previous_looked_at, now() - interval '1 day');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Entering a workspace: bounded staff sessions, and what owners see
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_workspace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  entered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text CHECK (end_reason IS NULL OR end_reason IN ('exit', 'timeout', 'idle', 'removed', 'switched', 'deactivated'))
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_workspace_sessions_open ON public.staff_workspace_sessions (user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_workspace_sessions_org_idx ON public.staff_workspace_sessions (org_id, entered_at DESC);

ALTER TABLE public.staff_workspace_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_workspace_sessions_select ON public.staff_workspace_sessions;
CREATE POLICY staff_workspace_sessions_select ON public.staff_workspace_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (public.is_platform_admin()) OR org_id IN (SELECT public.user_staff_org_ids()));
GRANT SELECT ON public.staff_workspace_sessions TO authenticated;
GRANT ALL ON public.staff_workspace_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.staff_session_end_internal(p_session_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_workspace_sessions%ROWTYPE;
BEGIN
  UPDATE public.staff_workspace_sessions SET ended_at = now(), end_reason = p_reason
  WHERE id = p_session_id AND ended_at IS NULL
  RETURNING * INTO v_row;
  IF FOUND THEN
    PERFORM public.ws_log(v_row.org_id,
      CASE WHEN p_reason = 'exit' THEN 'workspace.exited' ELSE 'workspace.session_ended' END,
      'staff_workspace_sessions', v_row.id::text,
      jsonb_build_object('reason', p_reason, 'minutes', round(extract(epoch FROM now() - v_row.entered_at) / 60)),
      v_row.user_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_session_end_internal(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_session_enter(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open public.staff_workspace_sessions%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM public.staff_require(p_org_id);
  SELECT * INTO v_open FROM public.staff_workspace_sessions WHERE user_id = auth.uid() AND ended_at IS NULL FOR UPDATE;
  IF FOUND THEN
    PERFORM public.staff_session_end_internal(v_open.id, CASE WHEN v_open.org_id = p_org_id THEN 'exit' ELSE 'switched' END);
  END IF;
  INSERT INTO public.staff_workspace_sessions (user_id, org_id) VALUES (auth.uid(), p_org_id) RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'workspace.entered', 'staff_workspace_sessions', v_id::text, '{}'::jsonb, auth.uid());
  RETURN v_id;
END;
$$;

/** Keeps an open session alive, or ends it when it ran too long or sat idle. */
CREATE OR REPLACE FUNCTION public.staff_session_touch(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_workspace_sessions%ROWTYPE;
  s public.staff_support_settings%ROWTYPE;
BEGIN
  IF NOT public.ws_is_staff(p_org_id) THEN
    RETURN jsonb_build_object('state', 'not_staff');
  END IF;
  SELECT * INTO s FROM public.staff_support_settings WHERE id;
  SELECT * INTO v_row FROM public.staff_workspace_sessions
  WHERE user_id = auth.uid() AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_row.org_id <> p_org_id THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;
  IF v_row.entered_at < now() - make_interval(mins => s.staff_session_max_minutes) THEN
    PERFORM public.staff_session_end_internal(v_row.id, 'timeout');
    RETURN jsonb_build_object('state', 'timeout');
  END IF;
  IF v_row.last_seen_at < now() - make_interval(mins => s.staff_session_idle_minutes) THEN
    PERFORM public.staff_session_end_internal(v_row.id, 'idle');
    RETURN jsonb_build_object('state', 'idle');
  END IF;
  IF v_row.last_seen_at < now() - interval '30 seconds' THEN
    UPDATE public.staff_workspace_sessions SET last_seen_at = now() WHERE id = v_row.id;
  END IF;
  RETURN jsonb_build_object(
    'state', 'active',
    'session_id', v_row.id,
    'entered_at', v_row.entered_at,
    'ends_at', LEAST(v_row.entered_at + make_interval(mins => s.staff_session_max_minutes), now() + make_interval(mins => s.staff_session_idle_minutes))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_session_exit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.staff_workspace_sessions WHERE user_id = auth.uid() AND ended_at IS NULL;
  IF v_id IS NOT NULL THEN
    PERFORM public.staff_session_end_internal(v_id, 'exit');
  END IF;
END;
$$;

-- An ended assignment ends any open session inside that workspace at once.
CREATE OR REPLACE FUNCTION public.staff_sessions_follow_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.ended_at IS NOT NULL AND (OLD.ended_at IS NULL) THEN
    FOR v_id IN
      SELECT w.id FROM public.staff_workspace_sessions w
      WHERE w.user_id = NEW.user_id AND w.org_id = NEW.org_id AND w.ended_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = NEW.user_id AND s.active AND s.role = 'platform_admin')
    LOOP
      PERFORM public.staff_session_end_internal(v_id, 'removed');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS staff_sessions_follow_assignment ON public.workspace_assignments;
CREATE TRIGGER staff_sessions_follow_assignment
  AFTER UPDATE OF ended_at ON public.workspace_assignments
  FOR EACH ROW EXECUTE FUNCTION public.staff_sessions_follow_assignment();

/**
 * Staff visits and staff actions in this workspace, for its Owners, labeled
 * with the person's first name and last initial. Internal staff work (notes,
 * escalations, saved views, health rules) is never part of it.
 */
CREATE OR REPLACE FUNCTION public.owner_staff_history(p_org_id uuid, p_limit integer DEFAULT 100, p_before timestamptz DEFAULT NULL)
RETURNS TABLE (id uuid, at timestamptz, who text, action text, detail jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id NOT IN (SELECT public.user_owner_org_ids()) AND NOT public.ws_is_staff(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT l.id, l.created_at,
      public.staff_short_name(COALESCE(s.display_name, l.actor_label)) || ', ' ||
        CASE WHEN l.actor_kind = 'platform_admin' THEN 'Vistrial Platform Admin' ELSE 'Vistrial Service Team' END,
      l.action,
      CASE
        WHEN l.action IN ('workspace.session_ended', 'workspace.exited') THEN jsonb_build_object('reason', l.detail->>'reason', 'minutes', l.detail->'minutes')
        WHEN l.action LIKE 'agent.%' THEN jsonb_build_object('agent', l.detail->>'agent', 'reason', l.detail->>'reason')
        ELSE '{}'::jsonb
      END
    FROM public.workspace_activity_log l
    LEFT JOIN public.platform_staff s ON s.user_id = l.actor_user_id
    WHERE l.org_id = p_org_id
      AND l.actor_kind IN ('service_team', 'platform_admin')
      AND l.action NOT LIKE 'staff_internal.%'
      AND l.action NOT LIKE 'escalation.%'
      AND l.action NOT LIKE 'support.%'
      AND l.action NOT LIKE 'health_rules.%'
      AND l.action NOT LIKE 'audit.%'
      AND l.action NOT LIKE 'roster.%'
      AND l.action NOT LIKE 'auth.%'
      AND (p_before IS NULL OR l.created_at < p_before)
    ORDER BY l.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Staff escalations: alerts that reached the Vistrial team
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('response_missed', 'agent_failure', 'connection', 'approval_waiting')),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 200),
  title text NOT NULL CHECK (char_length(title) <= 200),
  rule text CHECK (rule IS NULL OR char_length(rule) <= 400),
  lead_id uuid,
  source_table text,
  source_id text,
  affected integer NOT NULL DEFAULT 1,
  notified jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_step text CHECK (next_step IS NULL OR char_length(next_step) <= 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'snoozed', 'resolved')),
  owner_user_id uuid,
  working_user_id uuid,
  working_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  snoozed_until timestamptz,
  snooze_reason text CHECK (snooze_reason IS NULL OR char_length(snooze_reason) <= 300),
  resolved_at timestamptz,
  resolved_by uuid,
  outcome text CHECK (outcome IS NULL OR char_length(outcome) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS staff_escalations_open_idx ON public.staff_escalations (org_id, created_at DESC) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS staff_escalations_owner_idx ON public.staff_escalations (owner_user_id) WHERE status <> 'resolved';

ALTER TABLE public.staff_escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_escalations_select ON public.staff_escalations;
CREATE POLICY staff_escalations_select ON public.staff_escalations FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()));
GRANT SELECT ON public.staff_escalations TO authenticated;
GRANT ALL ON public.staff_escalations TO service_role;

CREATE TABLE IF NOT EXISTS public.staff_item_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind text NOT NULL CHECK (item_kind IN ('escalation', 'help', 'data')),
  item_id uuid NOT NULL,
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_item_notes_item_idx ON public.staff_item_notes (item_kind, item_id, created_at);
ALTER TABLE public.staff_item_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_item_notes_select ON public.staff_item_notes;
CREATE POLICY staff_item_notes_select ON public.staff_item_notes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()) OR (org_id IS NULL AND public.is_platform_admin()));
GRANT SELECT ON public.staff_item_notes TO authenticated;
GRANT ALL ON public.staff_item_notes TO service_role;

CREATE OR REPLACE FUNCTION public.staff_item_note_add(p_kind text, p_item_id uuid, p_org_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_org_id IS NULL THEN
    PERFORM public.staff_require_admin();
  ELSE
    PERFORM public.staff_require(p_org_id);
  END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'Write the note first.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.staff_item_notes (item_kind, item_id, org_id, author_user_id, author_name, body)
  VALUES (p_kind, p_item_id, p_org_id, auth.uid(), COALESCE((SELECT display_name FROM public.platform_staff WHERE user_id = auth.uid()), 'Vistrial'), left(btrim(p_body), 2000))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

/** Raised by scheduled jobs only. Paused and closed workspaces raise nothing new. */
CREATE OR REPLACE FUNCTION public.staff_escalation_raise(
  p_org_id uuid,
  p_kind text,
  p_dedupe_key text,
  p_title text,
  p_rule text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_source_table text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_notified jsonb DEFAULT '[]'::jsonb,
  p_next_step text DEFAULT NULL,
  p_affected integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  SELECT o.status::text INTO v_status FROM public.organizations o WHERE o.id = p_org_id;
  IF v_status IS NULL OR v_status IN ('paused', 'closed') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.staff_escalations (org_id, kind, dedupe_key, title, rule, lead_id, source_table, source_id, notified, next_step, affected, owner_user_id)
  VALUES (p_org_id, p_kind, left(p_dedupe_key, 200), left(p_title, 200), left(p_rule, 400), p_lead_id, p_source_table, p_source_id,
    COALESCE(p_notified, '[]'::jsonb), left(p_next_step, 300), GREATEST(COALESCE(p_affected, 1), 1), public.staff_default_owner(p_org_id))
  ON CONFLICT (org_id, dedupe_key) DO UPDATE
    SET affected = GREATEST(public.staff_escalations.affected, EXCLUDED.affected),
        updated_at = CASE WHEN public.staff_escalations.affected <> GREATEST(public.staff_escalations.affected, EXCLUDED.affected) THEN now() ELSE public.staff_escalations.updated_at END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_escalation_raise(uuid, text, text, text, text, uuid, text, text, jsonb, text, integer) FROM PUBLIC, anon, authenticated;

/**
 * Acknowledge, assign, snooze, resolve, reopen, or say you are working on it.
 * p_expected is the updated_at the person saw; a newer row means someone else
 * changed it first, and the action is refused rather than silently overwritten.
 */
CREATE OR REPLACE FUNCTION public.staff_escalation_act(
  p_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_expected timestamptz DEFAULT NULL
)
RETURNS public.staff_escalations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_escalations%ROWTYPE;
  v_note text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 1000);
BEGIN
  SELECT * INTO v_row FROM public.staff_escalations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.staff_require(v_row.org_id);
  IF p_expected IS NOT NULL AND p_action <> 'working' AND date_trunc('milliseconds', v_row.updated_at) > date_trunc('milliseconds', p_expected) THEN
    RAISE EXCEPTION 'Someone else changed this a moment ago. Reload to see the latest.' USING ERRCODE = '40001';
  END IF;

  IF p_action = 'working' THEN
    UPDATE public.staff_escalations SET working_user_id = auth.uid(), working_at = now() WHERE id = p_id RETURNING * INTO v_row;
    RETURN v_row;
  ELSIF p_action = 'acknowledge' THEN
    UPDATE public.staff_escalations
    SET status = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, now()), acknowledged_by = COALESCE(acknowledged_by, auth.uid()),
        owner_user_id = COALESCE(owner_user_id, auth.uid()), updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSIF p_action = 'assign' THEN
    IF p_user_id IS NULL OR NOT public.staff_can_work(v_row.org_id, p_user_id) THEN
      RAISE EXCEPTION 'That person cannot work this workspace.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.staff_escalations SET owner_user_id = p_user_id, updated_at = now() WHERE id = p_id RETURNING * INTO v_row;
  ELSIF p_action = 'snooze' THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Say why you are snoozing it.' USING ERRCODE = '22023';
    END IF;
    IF p_until IS NULL OR p_until <= now() OR p_until > now() + interval '14 days' THEN
      RAISE EXCEPTION 'Choose a time within the next two weeks.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.staff_escalations SET status = 'snoozed', snoozed_until = p_until, snooze_reason = left(v_note, 300), updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSIF p_action = 'resolve' THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Write a short outcome before resolving.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.staff_escalations SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), outcome = v_note,
        working_user_id = NULL, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSIF p_action = 'reopen' THEN
    UPDATE public.staff_escalations SET status = 'open', resolved_at = NULL, resolved_by = NULL, snoozed_until = NULL, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSIF p_action = 'note' THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Write the note first.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.staff_item_note_add('escalation', p_id, v_row.org_id, v_note);
    UPDATE public.staff_escalations SET updated_at = now() WHERE id = p_id RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'Unknown action.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.ws_log(v_row.org_id, 'escalation.' || p_action, 'staff_escalations', p_id::text,
    jsonb_strip_nulls(jsonb_build_object('kind', v_row.kind, 'assignee', p_user_id, 'until', p_until)), auth.uid());
  RETURN v_row;
END;
$$;

/**
 * The scheduled pass that raises escalations and flags overdue requests.
 * Sentry alerts reach the team when the customer's own follow-up step was sent
 * and nobody acknowledged within the workspace's window, or when a level names
 * the Service Team. Failed and stuck agent runs group per workspace, agent and day.
 */
CREATE OR REPLACE FUNCTION public.staff_escalations_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts integer := 0;
  v_runs integer := 0;
  v_flagged integer := 0;
  v_escalated integer := 0;
  v_unsnoozed integer := 0;
  s public.staff_support_settings%ROWTYPE;
  r record;
BEGIN
  SELECT * INTO s FROM public.staff_support_settings WHERE id;

  UPDATE public.staff_escalations SET status = CASE WHEN acknowledged_at IS NULL THEN 'open' ELSE 'acknowledged' END, snoozed_until = NULL, updated_at = now()
  WHERE status = 'snoozed' AND snoozed_until <= now();
  GET DIAGNOSTICS v_unsnoozed = ROW_COUNT;

  FOR r IN
    SELECT a.id, a.org_id, a.lead_id, a.level, a.title, a.created_at,
      COALESCE((cfg.v->>'escalation.unacknowledged_minutes')::int, 60) AS unack_minutes,
      COALESCE(cfg.v->>'escalation.unacknowledged_next', 'managers') AS unack_next,
      COALESCE(cfg.v->'escalation.levels'->(a.level), '{}'::jsonb) AS level_rule,
      a.unacknowledged_sent_at
    FROM public.sentry_alerts a
    JOIN public.organizations o ON o.id = a.org_id AND o.status::text IN ('active', 'onboarding')
    JOIN public.leads l ON l.id = a.lead_id AND NOT l.is_test
    CROSS JOIN LATERAL (SELECT public.config_effective_at(a.org_id)->'values' AS v) cfg
    WHERE a.status = 'open' AND a.acknowledged_at IS NULL AND a.resolved_at IS NULL
      AND a.created_at > now() - interval '7 days'
  LOOP
    IF (r.level_rule->'notify') ? 'service_team'
       OR r.unack_next = 'service_team' AND r.unacknowledged_sent_at IS NOT NULL
       OR (r.unacknowledged_sent_at IS NOT NULL AND r.unacknowledged_sent_at < now() - make_interval(mins => r.unack_minutes)) THEN
      PERFORM public.staff_escalation_raise(
        r.org_id, 'response_missed', 'sentry:' || r.id::text, left(COALESCE(r.title, 'A lead is waiting for a first touch'), 200),
        COALESCE(r.level_rule->>'trigger', 'A response clock was missed and nobody acknowledged it in time.'),
        r.lead_id, 'sentry_alerts', r.id::text,
        CASE WHEN r.unacknowledged_sent_at IS NOT NULL THEN
          jsonb_build_array(
            jsonb_build_object('who', 'The people this level notifies', 'at', r.created_at),
            jsonb_build_object('who', 'The follow-up contacts (' || r.unack_next || ')', 'at', r.unacknowledged_sent_at))
        ELSE jsonb_build_array(jsonb_build_object('who', 'The people this level notifies', 'at', r.created_at)) END,
        'Ask the customer''s team to reach the lead, or route a draft through approvals.'
      );
      v_alerts := v_alerts + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT x.org_id, x.agent_id, (x.created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n, max(x.created_at) AS latest,
      (array_agg(x.plain_error ORDER BY x.created_at DESC) FILTER (WHERE x.plain_error IS NOT NULL))[1] AS reason
    FROM public.agent_activity_runs x
    JOIN public.organizations o ON o.id = x.org_id AND o.status::text IN ('active', 'onboarding')
    WHERE x.status IN ('failed', 'stuck') AND NOT x.simulated AND x.created_at > now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.staff_run_reviews rv WHERE rv.run_id = x.id)
    GROUP BY 1, 2, 3
  LOOP
    PERFORM public.staff_escalation_raise(
      r.org_id, 'agent_failure', 'agent:' || r.agent_id || ':' || r.day::text,
      r.n || CASE WHEN r.n = 1 THEN ' run could not finish' ELSE ' runs could not finish' END,
      COALESCE(r.reason, 'An agent run failed or stopped making progress.'),
      NULL, 'agent_activity_runs', r.agent_id, '[]'::jsonb,
      'Open Agent oversight to retry safely or mark the runs reviewed.', r.n::int);
    v_runs := v_runs + 1;
  END LOOP;

  WITH due AS (
    SELECT h.id, public.staff_business_minutes(h.waiting_since, now()) AS mins, h.flagged_at, h.escalated_at
    FROM public.help_requests h
    JOIN public.organizations o ON o.id = h.org_id AND o.status::text <> 'closed'
    WHERE h.status = 'received'
  ),
  flagged AS (
    UPDATE public.help_requests h SET flagged_at = now()
    FROM due WHERE due.id = h.id AND due.flagged_at IS NULL AND due.mins >= s.flag_after_minutes
    RETURNING h.id
  )
  SELECT count(*) INTO v_flagged FROM flagged;

  WITH due AS (
    SELECT h.id, public.staff_business_minutes(h.waiting_since, now()) AS mins
    FROM public.help_requests h
    JOIN public.organizations o ON o.id = h.org_id AND o.status::text <> 'closed'
    WHERE h.status = 'received' AND h.escalated_at IS NULL
  ),
  escalated AS (
    UPDATE public.help_requests h SET escalated_at = now()
    FROM due WHERE due.id = h.id AND due.mins >= s.escalate_after_minutes
    RETURNING h.id
  )
  SELECT count(*) INTO v_escalated FROM escalated;

  RETURN jsonb_build_object('alerts', v_alerts, 'run_groups', v_runs, 'requests_flagged', v_flagged,
    'requests_escalated', v_escalated, 'unsnoozed', v_unsnoozed);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Customer requests: ownership, who is working on it, and waiting time
-- ---------------------------------------------------------------------------

ALTER TABLE public.help_requests
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS working_user_id uuid,
  ADD COLUMN IF NOT EXISTS working_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_since timestamptz,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_reply_at timestamptz;
UPDATE public.help_requests SET waiting_since = COALESCE(last_reply_at, created_at) WHERE waiting_since IS NULL;
UPDATE public.help_requests h SET owner_user_id = public.staff_default_owner(h.org_id) WHERE owner_user_id IS NULL;
CREATE INDEX IF NOT EXISTS help_requests_waiting_idx ON public.help_requests (status, waiting_since) WHERE status IN ('received', 'in_progress');

CREATE OR REPLACE FUNCTION public.help_requests_staff_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.waiting_since := COALESCE(NEW.waiting_since, NEW.created_at, now());
    NEW.owner_user_id := COALESCE(NEW.owner_user_id, public.staff_default_owner(NEW.org_id));
  ELSIF NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received' THEN
    NEW.waiting_since := now();
    NEW.flagged_at := NULL;
    NEW.escalated_at := NULL;
  END IF;
  IF NEW.status IN ('answered', 'closed') THEN
    NEW.working_user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS help_requests_staff_fields ON public.help_requests;
CREATE TRIGGER help_requests_staff_fields
  BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION public.help_requests_staff_fields();

CREATE OR REPLACE FUNCTION public.help_replies_first_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.from_team THEN
    UPDATE public.help_requests SET first_reply_at = COALESCE(first_reply_at, NEW.created_at) WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS help_replies_first_reply ON public.help_replies;
CREATE TRIGGER help_replies_first_reply
  AFTER INSERT ON public.help_replies
  FOR EACH ROW EXECUTE FUNCTION public.help_replies_first_reply();

CREATE OR REPLACE FUNCTION public.help_request_assign(p_request_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.help_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.help_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.staff_require(v_req.org_id);
  IF p_user_id IS NULL OR NOT public.staff_can_work(v_req.org_id, p_user_id) THEN
    RAISE EXCEPTION 'That person cannot work this workspace.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.help_requests SET owner_user_id = p_user_id, updated_at = now() WHERE id = p_request_id;
  PERFORM public.ws_log(v_req.org_id, 'staff_internal.request_assigned', 'help_requests', p_request_id::text,
    jsonb_build_object('assignee', p_user_id), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.help_request_working(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.help_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.help_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.staff_require(v_req.org_id);
  IF v_req.working_user_id IS NOT NULL AND v_req.working_user_id <> auth.uid() AND v_req.working_at > now() - interval '10 minutes' THEN
    RETURN jsonb_build_object('working_user_id', v_req.working_user_id, 'working_at', v_req.working_at, 'mine', false);
  END IF;
  UPDATE public.help_requests SET working_user_id = auth.uid(), working_at = now() WHERE id = p_request_id;
  RETURN jsonb_build_object('working_user_id', auth.uid(), 'working_at', now(), 'mine', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Canned replies: personal snippets, and a shared set Platform Admins manage
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_canned_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  shared boolean NOT NULL DEFAULT false,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_canned_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_canned_replies_select ON public.staff_canned_replies;
CREATE POLICY staff_canned_replies_select ON public.staff_canned_replies FOR SELECT TO authenticated
  USING (public.is_platform_staff() AND (shared OR owner_user_id = auth.uid()));
DROP POLICY IF EXISTS staff_canned_replies_write ON public.staff_canned_replies;
CREATE POLICY staff_canned_replies_write ON public.staff_canned_replies FOR ALL TO authenticated
  USING (public.is_platform_staff() AND ((shared AND public.is_platform_admin()) OR (NOT shared AND owner_user_id = auth.uid())))
  WITH CHECK (public.is_platform_staff() AND ((shared AND public.is_platform_admin()) OR (NOT shared AND owner_user_id = auth.uid())));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_canned_replies TO authenticated;
GRANT ALL ON public.staff_canned_replies TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Data requests: verified, approved by a Platform Admin, scheduled, cancellable
-- ---------------------------------------------------------------------------

ALTER TABLE public.data_requests DROP CONSTRAINT IF EXISTS data_requests_status_check;
ALTER TABLE public.data_requests ADD CONSTRAINT data_requests_status_check
  CHECK (status IN ('received', 'in_review', 'approved', 'in_progress', 'completed', 'declined', 'cancelled'));
ALTER TABLE public.data_requests
  ADD COLUMN IF NOT EXISTS org_name text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS staff_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS requested_by_email text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verification_note text CHECK (verification_note IS NULL OR char_length(verification_note) <= 1000),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_note text CHECK (approval_note IS NULL OR char_length(approval_note) <= 1000),
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  ADD COLUMN IF NOT EXISTS export_path text,
  ADD COLUMN IF NOT EXISTS export_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS export_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure text CHECK (failure IS NULL OR char_length(failure) <= 300);
UPDATE public.data_requests d SET org_name = o.name FROM public.organizations o WHERE o.id = d.org_id AND d.org_name IS NULL;
UPDATE public.data_requests d SET owner_user_id = public.staff_default_owner(d.org_id) WHERE d.owner_user_id IS NULL;

-- The request record outlives the workspace it deleted.
ALTER TABLE public.data_requests ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.data_requests DROP CONSTRAINT IF EXISTS data_requests_org_id_fkey;
ALTER TABLE public.data_requests ADD CONSTRAINT data_requests_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organizations (id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.data_requests_one_open;
CREATE UNIQUE INDEX data_requests_one_open ON public.data_requests (org_id, kind)
  WHERE status IN ('received', 'in_review', 'approved', 'in_progress');

DROP POLICY IF EXISTS data_requests_select ON public.data_requests;
CREATE POLICY data_requests_select ON public.data_requests FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_staff_org_ids())
    OR org_id IN (SELECT public.user_owner_org_ids())
    OR (org_id IS NULL AND public.is_platform_admin())
  );

CREATE OR REPLACE FUNCTION public.data_requests_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.org_name := COALESCE(NEW.org_name, (SELECT name FROM public.organizations WHERE id = NEW.org_id));
  NEW.owner_user_id := COALESCE(NEW.owner_user_id, public.staff_default_owner(NEW.org_id));
  NEW.requested_by_email := COALESCE(NEW.requested_by_email, (SELECT email FROM auth.users WHERE id = NEW.requested_by_user_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS data_requests_defaults ON public.data_requests;
CREATE TRIGGER data_requests_defaults BEFORE INSERT ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.data_requests_defaults();

/** What blocks a deletion for billing reasons, in plain words, or null. */
CREATE OR REPLACE FUNCTION public.data_request_billing_block(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN b.org_id IS NULL OR b.stripe_subscription_id IS NULL AND COALESCE(b.status, '') = '' THEN NULL
    WHEN COALESCE(b.status, '') NOT IN ('canceled', 'incomplete_expired') THEN
      'The subscription is still active. Deletion waits until it is cancelled and the final invoice is settled.'
    WHEN COALESCE(b.last_invoice_status, 'paid') NOT IN ('paid', 'void', 'uncollectible') THEN
      'The subscription is cancelled, but the final invoice is not settled yet.'
    ELSE NULL
  END
  FROM (SELECT p_org_id AS id) x
  LEFT JOIN public.workspace_billing b ON b.org_id = x.id;
$$;

CREATE OR REPLACE FUNCTION public.data_request_staff_create(p_org_id uuid, p_kind text, p_owner_member_id uuid, p_note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner public.org_members%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM public.staff_require(p_org_id);
  IF p_kind NOT IN ('export', 'deletion') THEN
    RAISE EXCEPTION 'Unknown request.' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Say how the Owner asked, for example by email on a date.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_owner FROM public.org_members
  WHERE id = p_owner_member_id AND org_id = p_org_id AND role = 'owner' AND active AND seat = 'customer';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active Owner of this workspace.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.data_requests (org_id, kind, note, requested_by_user_id, requested_by_name, staff_created, created_by_user_id)
  VALUES (p_org_id, p_kind, left(btrim(p_note), 2000), v_owner.user_id, v_owner.display_name, true, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'data.' || p_kind || '_requested', 'data_requests', v_id::text, jsonb_build_object('by_staff', true), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.data_request_act(
  p_request_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_expected timestamptz DEFAULT NULL
)
RETURNS public.data_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.data_requests%ROWTYPE;
  v_note text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 1000);
  v_block text;
  s public.staff_support_settings%ROWTYPE;
  v_owner boolean;
BEGIN
  SELECT * INTO v_req FROM public.data_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  v_owner := v_req.org_id IN (SELECT public.user_owner_org_ids());
  IF p_action = 'cancel' AND v_owner AND NOT public.ws_is_staff(v_req.org_id) THEN
    NULL;
  ELSE
    PERFORM public.staff_require(v_req.org_id);
  END IF;
  IF p_expected IS NOT NULL AND date_trunc('milliseconds', v_req.updated_at) > date_trunc('milliseconds', p_expected) THEN
    RAISE EXCEPTION 'Someone else changed this a moment ago. Reload to see the latest.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO s FROM public.staff_support_settings WHERE id;

  IF p_action = 'assign' THEN
    IF p_user_id IS NULL OR NOT public.staff_can_work(v_req.org_id, p_user_id) THEN
      RAISE EXCEPTION 'That person cannot work this workspace.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.data_requests SET owner_user_id = p_user_id, updated_at = now() WHERE id = v_req.id RETURNING * INTO v_req;
    PERFORM public.ws_log(v_req.org_id, 'staff_internal.data_request_assigned', 'data_requests', v_req.id::text, jsonb_build_object('assignee', p_user_id), auth.uid());
    RETURN v_req;
  ELSIF p_action = 'note' THEN
    IF v_note IS NULL THEN RAISE EXCEPTION 'Write the note first.' USING ERRCODE = '22023'; END IF;
    PERFORM public.staff_item_note_add('data', v_req.id, v_req.org_id, v_note);
    UPDATE public.data_requests SET updated_at = now() WHERE id = v_req.id RETURNING * INTO v_req;
    RETURN v_req;
  ELSIF p_action = 'verify' THEN
    IF v_req.status NOT IN ('received', 'in_review') THEN
      RAISE EXCEPTION 'This request is past verification.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = v_req.org_id AND m.user_id = v_req.requested_by_user_id AND m.role = 'owner' AND m.active AND m.seat = 'customer'
    ) THEN
      RAISE EXCEPTION 'The person who asked is not an active Owner of this workspace, so it cannot go ahead. Decline it, or confirm with a current Owner.' USING ERRCODE = '22023';
    END IF;
    IF v_note IS NULL THEN RAISE EXCEPTION 'Say how you confirmed it came from the Owner.' USING ERRCODE = '22023'; END IF;
    UPDATE public.data_requests SET status = 'in_review', verified_at = now(), verified_by = auth.uid(), verification_note = v_note, updated_at = now()
    WHERE id = v_req.id RETURNING * INTO v_req;
  ELSIF p_action = 'approve' THEN
    PERFORM public.staff_require_admin();
    IF v_req.status <> 'in_review' OR v_req.verified_at IS NULL THEN
      RAISE EXCEPTION 'Confirm the request came from an Owner before approving.' USING ERRCODE = '22023';
    END IF;
    IF v_note IS NULL THEN RAISE EXCEPTION 'Write an approval note.' USING ERRCODE = '22023'; END IF;
    IF v_req.kind = 'deletion' THEN
      v_block := public.data_request_billing_block(v_req.org_id);
      IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = '22023'; END IF;
      UPDATE public.data_requests SET status = 'approved', approved_at = now(), approved_by = auth.uid(), approval_note = v_note,
          scheduled_for = now() + make_interval(days => s.deletion_wait_days), updated_at = now()
      WHERE id = v_req.id RETURNING * INTO v_req;
    ELSE
      UPDATE public.data_requests SET status = 'in_progress', approved_at = now(), approved_by = auth.uid(), approval_note = v_note, updated_at = now()
      WHERE id = v_req.id RETURNING * INTO v_req;
    END IF;
  ELSIF p_action = 'decline' THEN
    IF v_req.status IN ('completed', 'declined', 'cancelled', 'in_progress') THEN
      RAISE EXCEPTION 'This request is already settled.' USING ERRCODE = '22023';
    END IF;
    IF v_note IS NULL THEN RAISE EXCEPTION 'Say why it is declined. The Owner sees this.' USING ERRCODE = '22023'; END IF;
    UPDATE public.data_requests SET status = 'declined', team_note = v_note, resolved_at = now(), resolved_by_user_id = auth.uid(), updated_at = now()
    WHERE id = v_req.id RETURNING * INTO v_req;
  ELSIF p_action = 'cancel' THEN
    IF v_req.status NOT IN ('received', 'in_review', 'approved') THEN
      RAISE EXCEPTION 'It can no longer be cancelled.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.data_requests SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_note,
        scheduled_for = NULL, resolved_at = now(), updated_at = now()
    WHERE id = v_req.id RETURNING * INTO v_req;
  ELSE
    RAISE EXCEPTION 'Unknown action.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.ws_log(v_req.org_id, 'data.request_' || p_action, 'data_requests', v_req.id::text,
    jsonb_build_object('kind', v_req.kind, 'status', v_req.status, 'scheduled_for', v_req.scheduled_for), auth.uid());
  RETURN v_req;
END;
$$;

-- The old free-form status setter could mark a deletion done by hand. It now
-- only declines; every other step goes through data_request_act.
CREATE OR REPLACE FUNCTION public.data_request_update(p_request_id uuid, p_status text, p_team_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status <> 'declined' THEN
    RAISE EXCEPTION 'Use the data request steps.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.data_request_act(p_request_id, 'decline', p_team_note);
END;
$$;

-- Billing records kept when a workspace's data is deleted.
CREATE TABLE IF NOT EXISTS public.retained_billing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  org_name text NOT NULL,
  data_request_id uuid,
  billing jsonb NOT NULL,
  retained_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retained_billing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retained_billing_records_select ON public.retained_billing_records;
CREATE POLICY retained_billing_records_select ON public.retained_billing_records FOR SELECT TO authenticated
  USING (public.is_platform_admin());
GRANT SELECT ON public.retained_billing_records TO authenticated;
GRANT ALL ON public.retained_billing_records TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Announcements: banner notices and targeted "What is new"
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body text CHECK (body IS NULL OR char_length(body) <= 500),
  tone text NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'maintenance', 'warning')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  target_org_ids uuid[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_banners_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);
ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_banners_admin ON public.platform_banners;
CREATE POLICY platform_banners_admin ON public.platform_banners FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_banners TO authenticated;
GRANT ALL ON public.platform_banners TO service_role;

ALTER TABLE public.product_updates ADD COLUMN IF NOT EXISTS target_org_ids uuid[];
DROP POLICY IF EXISTS product_updates_select ON public.product_updates;
CREATE POLICY product_updates_select ON public.product_updates FOR SELECT TO authenticated
  USING ((published_at <= now() AND target_org_ids IS NULL) OR public.is_platform_admin());

/** Banners showing now in this workspace. Targets are never returned. */
CREATE OR REPLACE FUNCTION public.portal_banners(p_org_id uuid)
RETURNS TABLE (id uuid, title text, body text, tone text, ends_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.title, b.body, b.tone, b.ends_at
  FROM public.platform_banners b
  WHERE p_org_id IN (SELECT public.user_org_ids())
    AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now())
    AND (b.target_org_ids IS NULL OR p_org_id = ANY (b.target_org_ids))
  ORDER BY b.starts_at DESC
  LIMIT 3;
$$;

/** "What is new" for this workspace: everything for all, plus entries aimed at it. */
CREATE OR REPLACE FUNCTION public.portal_product_updates(p_org_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, title text, body text, area text, published_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.title, u.body, u.area, u.published_at
  FROM public.product_updates u
  WHERE p_org_id IN (SELECT public.user_org_ids())
    AND u.published_at <= now()
    AND (u.target_org_ids IS NULL OR p_org_id = ANY (u.target_org_ids))
  ORDER BY u.published_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.platform_announcement_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ws_log(NULL, 'support.' || TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb, auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS platform_banners_audit ON public.platform_banners;
CREATE TRIGGER platform_banners_audit AFTER INSERT OR UPDATE OR DELETE ON public.platform_banners
  FOR EACH ROW EXECUTE FUNCTION public.platform_announcement_audit();
DROP TRIGGER IF EXISTS product_updates_audit ON public.product_updates;
CREATE TRIGGER product_updates_audit AFTER INSERT OR UPDATE OR DELETE ON public.product_updates
  FOR EACH ROW EXECUTE FUNCTION public.platform_announcement_audit();
DROP TRIGGER IF EXISTS staff_canned_replies_audit ON public.staff_canned_replies;
CREATE OR REPLACE FUNCTION public.staff_canned_reply_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.shared, OLD.shared) THEN
    PERFORM public.ws_log(NULL, 'support.canned_reply_' || lower(TG_OP), 'staff_canned_replies', COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb, auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER staff_canned_replies_audit AFTER INSERT OR UPDATE OR DELETE ON public.staff_canned_replies
  FOR EACH ROW EXECUTE FUNCTION public.staff_canned_reply_audit();

-- ---------------------------------------------------------------------------
-- 12. Agent oversight: emergency halts, run reviews, staff pauses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_agent_halts (
  agent_id text PRIMARY KEY CHECK (agent_id IN ('sentry', 'scribe', 'relay', 'compass')),
  halted boolean NOT NULL DEFAULT false,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_agent_halts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_agent_halts_select ON public.platform_agent_halts;
CREATE POLICY platform_agent_halts_select ON public.platform_agent_halts FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.platform_agent_halts TO authenticated;
GRANT ALL ON public.platform_agent_halts TO service_role;

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
  IF p_agent_id NOT IN ('sentry', 'scribe', 'relay', 'compass') THEN
    RAISE EXCEPTION 'Unknown agent.' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A reason is required.' USING ERRCODE = '22023';
  END IF;
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

CREATE TABLE IF NOT EXISTS public.staff_run_reviews (
  run_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('reviewed', 'retried')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_run_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_run_reviews_select ON public.staff_run_reviews;
CREATE POLICY staff_run_reviews_select ON public.staff_run_reviews FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_staff_org_ids()));
GRANT SELECT ON public.staff_run_reviews TO authenticated;
GRANT ALL ON public.staff_run_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.staff_run_review(p_run_id uuid, p_outcome text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.agent_activity_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.agent_activity_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.staff_require(v_run.org_id);
  IF p_outcome NOT IN ('reviewed', 'retried') THEN
    RAISE EXCEPTION 'Unknown outcome.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.staff_run_reviews (run_id, org_id, outcome, note, reviewed_by)
  VALUES (p_run_id, v_run.org_id, p_outcome, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500), auth.uid())
  ON CONFLICT (run_id) DO UPDATE SET outcome = EXCLUDED.outcome, note = EXCLUDED.note, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now();
  PERFORM public.ws_log(v_run.org_id, 'agent.run_' || p_outcome, 'agent_activity_runs', p_run_id::text,
    jsonb_build_object('agent', v_run.agent_id), auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Cross-workspace readers, all bounded by staff_scope_org_ids()
-- ---------------------------------------------------------------------------

/** One row of facts per workspace. Health is judged from these in one place in the app. */
CREATE OR REPLACE FUNCTION public.staff_roster_facts(p_scope text DEFAULT 'all', p_org_id uuid DEFAULT NULL, p_days integer DEFAULT 30)
RETURNS TABLE (
  org_id uuid,
  name text,
  slug text,
  status text,
  status_reason text,
  is_platform_workspace boolean,
  is_test_workspace boolean,
  timezone text,
  created_at timestamptz,
  template_id uuid,
  template_name text,
  went_live_at timestamptz,
  onboarding_steps jsonb,
  onboarding_updated_at timestamptz,
  primary_contact jsonb,
  assigned jsonb,
  response_decided integer,
  response_within integer,
  open_alerts integer,
  open_escalations integer,
  pending_approvals integer,
  oldest_pending_at timestamptz,
  crm_status text,
  crm_verified_at timestamptz,
  crm_error text,
  crm_expired boolean,
  sources_failing integer,
  sender_confirmed boolean,
  domain_confirmed boolean,
  carrier_status text,
  billing_visible boolean,
  billing_status text,
  payment_failed_at timestamptz,
  cancel_at_period_end boolean,
  runs_24h integer,
  failed_runs_24h integer,
  paused_agents jsonb,
  requests_waiting integer,
  requests_overdue integer,
  requests_escalated integer,
  oldest_request_at timestamptz,
  data_requests_open integer,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT o.* FROM public.organizations o
    WHERE o.id IN (SELECT public.staff_scope_org_ids(p_scope))
      AND (p_org_id IS NULL OR o.id = p_org_id)
  ),
  arrived AS (
    SELECT l.org_id, l.id
    FROM scope o
    JOIN public.leads l ON l.org_id = o.id
    WHERE NOT l.is_test AND l.merged_into IS NULL
      AND l.opted_in_at >= ((((now() AT TIME ZONE COALESCE(NULLIF(o.timezone, ''), 'UTC'))::date - (GREATEST(COALESCE(p_days, 30), 1) - 1))::timestamp) AT TIME ZONE COALESCE(NULLIF(o.timezone, ''), 'UTC'))
      AND l.opted_in_at < now()
  ),
  resp AS (
    SELECT a.org_id,
      count(*) FILTER (WHERE me.met IS NOT NULL OR mi.lead_id IS NOT NULL)::int AS decided,
      count(*) FILTER (WHERE me.met IS TRUE)::int AS within
    FROM arrived a
    LEFT JOIN LATERAL (
      SELECT m.met FROM public.sentry_measurements m
      WHERE m.org_id = a.org_id AND m.lead_id = a.id AND m.metric = 'time_to_first_touch' AND m.met IS NOT NULL
      ORDER BY m.recorded_at LIMIT 1
    ) me ON true
    LEFT JOIN LATERAL (
      SELECT c.lead_id FROM public.sentry_clocks c
      WHERE c.org_id = a.org_id AND c.lead_id = a.id AND c.kind = 'first_touch' AND c.state = 'missed' LIMIT 1
    ) mi ON true
    GROUP BY a.org_id
  ),
  alerts AS (
    SELECT a.org_id, count(*)::int AS n
    FROM public.sentry_alerts a
    JOIN public.leads l ON l.id = a.lead_id AND NOT l.is_test AND l.merged_into IS NULL
    WHERE a.org_id IN (SELECT id FROM scope) AND a.status = 'open' AND a.acknowledged_at IS NULL AND a.resolved_at IS NULL
    GROUP BY a.org_id
  ),
  esc AS (
    SELECT e.org_id, count(*)::int AS n FROM public.staff_escalations e
    WHERE e.org_id IN (SELECT id FROM scope) AND e.status IN ('open', 'acknowledged')
    GROUP BY e.org_id
  ),
  appr AS (
    SELECT i.org_id, count(*)::int AS n, min(i.created_at) AS oldest
    FROM public.approval_items i
    WHERE i.org_id IN (SELECT id FROM scope) AND i.status = 'pending'
    GROUP BY i.org_id
  ),
  crm AS (
    SELECT DISTINCT ON (c.org_id) c.org_id, c.status::text AS status, c.last_verified_at,
      NULLIF(COALESCE(c.last_refresh_error, c.last_setup_error), '') AS err,
      (c.status::text <> 'active' AND c.token_expires_at IS NOT NULL AND c.token_expires_at < now()) AS expired
    FROM public.ghl_connections c
    WHERE c.org_id IN (SELECT id FROM scope)
    ORDER BY c.org_id, (c.status::text = 'active') DESC, c.updated_at DESC
  ),
  src AS (
    SELECT s.org_id, count(*)::int AS failing FROM public.source_connections s
    WHERE s.org_id IN (SELECT id FROM scope) AND (s.status::text = 'broken' OR (s.token_expires_at IS NOT NULL AND s.token_expires_at < now() AND s.status::text <> 'inactive'))
    GROUP BY s.org_id
  ),
  runs AS (
    SELECT r.org_id, count(*)::int AS total,
      count(*) FILTER (WHERE r.status IN ('failed', 'stuck') AND NOT EXISTS (SELECT 1 FROM public.staff_run_reviews v WHERE v.run_id = r.id))::int AS failed
    FROM public.agent_activity_runs r
    WHERE r.org_id IN (SELECT id FROM scope) AND NOT r.simulated AND r.created_at > now() - interval '24 hours'
    GROUP BY r.org_id
  ),
  paused AS (
    SELECT p.org_id, jsonb_agg(jsonb_build_object(
      'agent', p.agent_id,
      'reason', p.reason,
      'by_owner', COALESCE(m.seat::text = 'customer' AND m.role::text = 'owner', false),
      'by_name', p.changed_by_name,
      'at', p.changed_at) ORDER BY p.agent_id) AS agents
    FROM public.agent_presence_controls p
    LEFT JOIN public.org_members m ON m.id = p.changed_by_member_id
    WHERE p.org_id IN (SELECT id FROM scope) AND p.paused
    GROUP BY p.org_id
  ),
  halts AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('agent', h.agent_id, 'reason', h.reason, 'by_owner', false, 'platform', true, 'by_name', h.changed_by_name, 'at', h.changed_at)), '[]'::jsonb) AS agents
    FROM public.platform_agent_halts h WHERE h.halted
  ),
  req AS (
    SELECT h.org_id,
      count(*) FILTER (WHERE h.status IN ('received', 'in_progress'))::int AS waiting,
      count(*) FILTER (WHERE h.status = 'received' AND h.flagged_at IS NOT NULL)::int AS overdue,
      count(*) FILTER (WHERE h.status = 'received' AND h.escalated_at IS NOT NULL)::int AS escalated,
      min(h.waiting_since) FILTER (WHERE h.status = 'received') AS oldest
    FROM public.help_requests h
    WHERE h.org_id IN (SELECT id FROM scope)
    GROUP BY h.org_id
  ),
  dreq AS (
    SELECT d.org_id, count(*)::int AS n FROM public.data_requests d
    WHERE d.org_id IN (SELECT id FROM scope) AND d.status IN ('received', 'in_review', 'approved', 'in_progress')
    GROUP BY d.org_id
  ),
  staff AS (
    SELECT a.org_id, jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', s.display_name) ORDER BY a.assigned_at) AS people
    FROM public.workspace_assignments a
    JOIN public.platform_staff s ON s.user_id = a.user_id AND s.active
    WHERE a.org_id IN (SELECT id FROM scope) AND a.ended_at IS NULL
    GROUP BY a.org_id
  )
  SELECT
    o.id, o.name, o.slug, o.status::text, o.status_reason, o.is_platform_workspace, o.is_test_workspace, o.timezone, o.created_at,
    o.industry_template_id, t.name,
    ob.went_live_at, ob.steps, ob.updated_at,
    jsonb_strip_nulls(jsonb_build_object('name', o.owner_contact_name, 'email', o.owner_contact_email, 'phone', o.owner_contact_phone)),
    COALESCE(staff.people, '[]'::jsonb),
    COALESCE(resp.decided, 0), COALESCE(resp.within, 0),
    COALESCE(alerts.n, 0), COALESCE(esc.n, 0),
    COALESCE(appr.n, 0), appr.oldest,
    COALESCE(crm.status, 'none'), crm.last_verified_at, crm.err, COALESCE(crm.expired, false),
    COALESCE(src.failing, 0),
    mr.sender_number_confirmed_at IS NOT NULL, mr.sending_domain_confirmed_at IS NOT NULL, COALESCE(mr.carrier_status, 'not_registered'),
    public.portal_can_see_billing(o.id) OR (auth.uid() IS NULL),
    CASE WHEN public.portal_can_see_billing(o.id) OR auth.uid() IS NULL THEN b.status END,
    CASE WHEN public.portal_can_see_billing(o.id) OR auth.uid() IS NULL THEN b.payment_failed_at END,
    CASE WHEN public.portal_can_see_billing(o.id) OR auth.uid() IS NULL THEN b.cancel_at_period_end END,
    COALESCE(runs.total, 0), COALESCE(runs.failed, 0),
    COALESCE(paused.agents, '[]'::jsonb) || (SELECT agents FROM halts),
    COALESCE(req.waiting, 0), COALESCE(req.overdue, 0), COALESCE(req.escalated, 0), req.oldest,
    COALESCE(dreq.n, 0),
    (SELECT max(l.created_at) FROM public.workspace_activity_log l WHERE l.org_id = o.id)
  FROM scope o
  LEFT JOIN public.config_templates t ON t.id = o.industry_template_id
  LEFT JOIN public.workspace_onboarding_status ob ON ob.org_id = o.id
  LEFT JOIN public.messaging_readiness mr ON mr.org_id = o.id
  LEFT JOIN public.workspace_billing b ON b.org_id = o.id
  LEFT JOIN resp ON resp.org_id = o.id
  LEFT JOIN alerts ON alerts.org_id = o.id
  LEFT JOIN esc ON esc.org_id = o.id
  LEFT JOIN appr ON appr.org_id = o.id
  LEFT JOIN crm ON crm.org_id = o.id
  LEFT JOIN src ON src.org_id = o.id
  LEFT JOIN runs ON runs.org_id = o.id
  LEFT JOIN paused ON paused.org_id = o.id
  LEFT JOIN req ON req.org_id = o.id
  LEFT JOIN dreq ON dreq.org_id = o.id
  LEFT JOIN staff ON staff.org_id = o.id
  ORDER BY o.name;
$$;

/** Per workspace and agent: state, runs, failures, waiting items, last run. */
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
  agents AS (SELECT unnest(ARRAY['scribe', 'sentry', 'relay', 'compass']) AS agent_id),
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

/** Failed and stuck runs that nobody has reviewed yet, newest first. */
CREATE OR REPLACE FUNCTION public.staff_agent_failures(p_scope text DEFAULT 'all', p_days integer DEFAULT 7, p_limit integer DEFAULT 200)
RETURNS TABLE (
  run_id uuid,
  org_id uuid,
  org_name text,
  agent_id text,
  status text,
  subject_label text,
  plain_error text,
  trigger_key text,
  lead_id uuid,
  created_at timestamptz,
  last_progress_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.org_id, o.name, r.agent_id, r.status, r.subject_label, r.plain_error, r.trigger_key, r.lead_id, r.created_at, r.last_progress_at
  FROM public.agent_activity_runs r
  JOIN public.organizations o ON o.id = r.org_id
  WHERE r.org_id IN (SELECT public.staff_scope_org_ids(p_scope))
    AND r.status IN ('failed', 'stuck') AND NOT r.simulated
    AND r.created_at > now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 30))
    AND NOT EXISTS (SELECT 1 FROM public.staff_run_reviews v WHERE v.run_id = r.id)
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
$$;

/** Drafts and approvals waiting, per workspace, with who can approve. */
CREATE OR REPLACE FUNCTION public.staff_approval_health(p_scope text DEFAULT 'all', p_org_id uuid DEFAULT NULL)
RETURNS TABLE (org_id uuid, org_name text, waiting integer, oldest_at timestamptz, approvers jsonb, staff_may_approve boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, count(i.id)::int, min(i.created_at),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.display_name, 'role', m.role) ORDER BY m.display_name)
      FROM public.org_members m
      WHERE m.org_id = o.id AND m.active AND m.seat = 'customer'
        AND (m.role = 'owner' OR (m.role IN ('member', 'client_viewer') AND m.can_approve))
    ), '[]'::jsonb),
    public.staff_may_approve(o.id)
  FROM public.organizations o
  LEFT JOIN public.approval_items i ON i.org_id = o.id AND i.status = 'pending'
  WHERE o.id IN (SELECT public.staff_scope_org_ids(p_scope)) AND (p_org_id IS NULL OR o.id = p_org_id)
  GROUP BY o.id, o.name
  ORDER BY count(i.id) DESC, o.name;
$$;

/** Every connection, its state, last success, last error (never a secret), and event delivery. */
CREATE OR REPLACE FUNCTION public.staff_connections(p_scope text DEFAULT 'all', p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  org_status text,
  kind text,
  label text,
  state text,
  last_success_at timestamptz,
  last_error text,
  failing_since timestamptz,
  detail jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS MATERIALIZED (
    SELECT o.id, o.name, o.status::text AS status, public.config_effective_at(o.id)->'values' AS cfg
    FROM public.organizations o
    WHERE o.id IN (SELECT public.staff_scope_org_ids(p_scope)) AND (p_org_id IS NULL OR o.id = p_org_id)
  )
  SELECT s.id, s.name, s.status, 'crm', COALESCE(c.location_name, 'CRM'),
    CASE
      WHEN c.id IS NULL THEN 'not_set_up'
      WHEN c.status::text = 'active' THEN 'ok'
      WHEN c.token_expires_at IS NOT NULL AND c.token_expires_at < now() THEN 'expired'
      WHEN c.status::text = 'broken' THEN 'failing'
      ELSE 'degraded'
    END,
    c.last_verified_at,
    NULLIF(COALESCE(c.last_refresh_error, c.last_setup_error), ''),
    CASE WHEN c.status::text <> 'active' THEN c.updated_at END,
    '{}'::jsonb
  FROM scope s
  LEFT JOIN LATERAL (
    SELECT * FROM public.ghl_connections g WHERE g.org_id = s.id ORDER BY (g.status::text = 'active') DESC, g.updated_at DESC LIMIT 1
  ) c ON true
  UNION ALL
  SELECT s.id, s.name, s.status, 'source', initcap(replace(sc.kind::text, '_', ' ')),
    CASE
      WHEN sc.status::text = 'active' AND (sc.token_expires_at IS NULL OR sc.token_expires_at > now()) THEN 'ok'
      WHEN sc.token_expires_at IS NOT NULL AND sc.token_expires_at < now() THEN 'expired'
      WHEN sc.status::text = 'broken' THEN 'failing'
      ELSE 'degraded'
    END,
    sc.last_verified_at, NULLIF(sc.last_error, ''), CASE WHEN sc.status::text <> 'active' THEN sc.updated_at END, '{}'::jsonb
  FROM scope s JOIN public.source_connections sc ON sc.org_id = s.id
  UNION ALL
  SELECT s.id, s.name, s.status, 'messaging', 'Sender number',
    CASE WHEN mr.sender_number_confirmed_at IS NOT NULL THEN 'ok' ELSE 'not_set_up' END,
    mr.sender_number_confirmed_at, NULL, NULL, '{}'::jsonb
  FROM scope s LEFT JOIN public.messaging_readiness mr ON mr.org_id = s.id
  UNION ALL
  SELECT s.id, s.name, s.status, 'carrier', 'Carrier registration',
    CASE COALESCE(mr.carrier_status, 'not_registered')
      WHEN 'approved' THEN 'ok' WHEN 'pending' THEN 'degraded' WHEN 'rejected' THEN 'failing' ELSE 'not_set_up' END,
    CASE WHEN mr.carrier_status = 'approved' THEN mr.carrier_updated_at END,
    CASE WHEN mr.carrier_status = 'rejected' THEN COALESCE(mr.carrier_note, 'The carriers rejected the registration.') END,
    CASE WHEN mr.carrier_status = 'rejected' THEN mr.carrier_updated_at END,
    jsonb_build_object('status', COALESCE(mr.carrier_status, 'not_registered'), 'note', mr.carrier_note, 'updated_at', mr.carrier_updated_at)
  FROM scope s LEFT JOIN public.messaging_readiness mr ON mr.org_id = s.id
  UNION ALL
  SELECT s.id, s.name, s.status, 'email_domain', COALESCE(NULLIF(s.cfg->>'integrations.email_domain', ''), 'Email domain'),
    CASE WHEN mr.sending_domain_confirmed_at IS NOT NULL THEN 'ok' ELSE 'not_set_up' END,
    mr.sending_domain_confirmed_at, NULL, NULL, '{}'::jsonb
  FROM scope s LEFT JOIN public.messaging_readiness mr ON mr.org_id = s.id
  UNION ALL
  SELECT s.id, s.name, s.status, 'chat', 'Chat channels',
    CASE WHEN jsonb_array_length(COALESCE(s.cfg->'integrations.chat_channels', '[]'::jsonb)) > 0
           OR EXISTS (SELECT 1 FROM public.notification_team_channels n WHERE n.org_id = s.id AND (n.slack_webhook_encrypted IS NOT NULL OR n.teams_webhook_encrypted IS NOT NULL))
         THEN 'ok' ELSE 'not_set_up' END,
    (SELECT n.updated_at FROM public.notification_team_channels n WHERE n.org_id = s.id), NULL, NULL,
    jsonb_build_object('count', jsonb_array_length(COALESCE(s.cfg->'integrations.chat_channels', '[]'::jsonb)))
  FROM scope s
  UNION ALL
  SELECT s.id, s.name, s.status, 'events', 'Event delivery',
    CASE
      WHEN w.received = 0 THEN 'not_set_up'
      WHEN w.failed > 0 AND w.failed * 5 >= w.received THEN 'failing'
      WHEN w.failed > 0 OR w.delayed > 0 OR w.backlog > 0 THEN 'degraded'
      ELSE 'ok'
    END,
    w.last_ok, NULL, w.first_fail,
    jsonb_build_object('received', w.received, 'failed', w.failed, 'delayed', w.delayed, 'backlog', w.backlog)
  FROM scope s
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS received,
      count(*) FILTER (WHERE e.status::text IN ('dead', 'rejected'))::int AS failed,
      count(*) FILTER (WHERE e.processed_at IS NOT NULL AND e.processed_at - e.received_at > interval '5 minutes')::int AS delayed,
      count(*) FILTER (WHERE NOT e.processed AND e.status::text = 'pending' AND e.received_at < now() - interval '10 minutes')::int AS backlog,
      max(e.processed_at) FILTER (WHERE e.status::text = 'processed') AS last_ok,
      min(e.received_at) FILTER (WHERE e.status::text IN ('dead', 'rejected')) AS first_fail
    FROM public.webhook_events e
    WHERE e.org_id = s.id AND e.received_at > now() - interval '24 hours'
  ) w;
$$;

/** Runs and recorded provider usage per workspace, this calendar month. Platform Admins only. */
CREATE OR REPLACE FUNCTION public.staff_usage_month()
RETURNS TABLE (
  org_id uuid,
  org_name text,
  runs jsonb,
  relay_drafts integer,
  relay_tokens bigint,
  relay_cost_micros bigint,
  scribe_tokens bigint,
  verification_tokens bigint,
  operator_spend_usd numeric,
  operator_tokens bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  RETURN QUERY
    WITH m AS (SELECT date_trunc('month', now()) AS start)
    SELECT o.id, o.name,
      COALESCE((SELECT jsonb_object_agg(x.agent_id, x.n) FROM (
        SELECT r.agent_id, count(*) AS n FROM public.agent_activity_runs r, m
        WHERE r.org_id = o.id AND NOT r.simulated AND r.created_at >= m.start GROUP BY r.agent_id) x), '{}'::jsonb),
      (SELECT count(*)::int FROM public.relay_drafts d, m WHERE d.org_id = o.id AND NOT d.simulated AND d.created_at >= m.start),
      (SELECT COALESCE(sum(COALESCE(d.input_tokens, 0) + COALESCE(d.output_tokens, 0)), 0)::bigint FROM public.relay_drafts d, m WHERE d.org_id = o.id AND NOT d.simulated AND d.created_at >= m.start),
      (SELECT COALESCE(sum(d.cost_micros), 0)::bigint FROM public.relay_drafts d, m WHERE d.org_id = o.id AND NOT d.simulated AND d.created_at >= m.start),
      (SELECT COALESCE(sum(COALESCE(u.input_tokens, 0) + COALESCE(u.output_tokens, 0)), 0)::bigint FROM public.extraction_usage u, m WHERE u.org_id = o.id AND u.created_at >= m.start),
      (SELECT COALESCE(sum(COALESCE(u.input_tokens, 0) + COALESCE(u.output_tokens, 0)), 0)::bigint FROM public.verification_usage u, m WHERE u.org_id = o.id AND u.created_at >= m.start),
      (SELECT COALESCE(sum(a.spend_usd), 0) FROM public.agent_runs a, m WHERE a.org_id = o.id AND a.created_at >= m.start),
      (SELECT COALESCE(sum(COALESCE(a.input_tokens, 0) + COALESCE(a.output_tokens, 0)), 0)::bigint FROM public.agent_runs a, m WHERE a.org_id = o.id AND a.created_at >= m.start)
    FROM public.organizations o
    ORDER BY o.name;
END;
$$;

/** Platform-wide numbers for Platform Admins. Every number has a definition in the app. */
CREATE OR REPLACE FUNCTION public.staff_platform_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 7), 365));
BEGIN
  PERFORM public.staff_require_admin();
  RETURN jsonb_build_object(
    'from', v_from,
    'by_state', (SELECT COALESCE(jsonb_object_agg(s, n), '{}'::jsonb) FROM (SELECT status::text AS s, count(*) AS n FROM public.organizations WHERE NOT is_platform_workspace GROUP BY 1) x),
    'new_by_week', (SELECT COALESCE(jsonb_agg(jsonb_build_object('week', w, 'count', n) ORDER BY w), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS w, count(*) AS n FROM public.organizations
      WHERE created_at >= v_from AND NOT is_platform_workspace GROUP BY 1) x),
    'response', (
      SELECT jsonb_build_object('decided', count(*) FILTER (WHERE me.met IS NOT NULL OR mi.lead_id IS NOT NULL), 'within', count(*) FILTER (WHERE me.met IS TRUE))
      FROM public.leads l
      LEFT JOIN LATERAL (
        SELECT m.met FROM public.sentry_measurements m
        WHERE m.org_id = l.org_id AND m.lead_id = l.id AND m.metric = 'time_to_first_touch' AND m.met IS NOT NULL
        ORDER BY m.recorded_at LIMIT 1
      ) me ON true
      LEFT JOIN LATERAL (
        SELECT c.lead_id FROM public.sentry_clocks c
        WHERE c.org_id = l.org_id AND c.lead_id = l.id AND c.kind = 'first_touch' AND c.state = 'missed' LIMIT 1
      ) mi ON true
      WHERE NOT l.is_test AND l.merged_into IS NULL AND l.opted_in_at >= v_from AND l.opted_in_at < now()),
    'runs', (SELECT jsonb_build_object(
        'total', count(*),
        'failed', count(*) FILTER (WHERE status IN ('failed', 'stuck')),
        'by_agent', (SELECT COALESCE(jsonb_object_agg(agent_id, n), '{}'::jsonb) FROM (SELECT agent_id, count(*) AS n FROM public.agent_activity_runs WHERE NOT simulated AND created_at >= v_from GROUP BY 1) y))
      FROM public.agent_activity_runs WHERE NOT simulated AND created_at >= v_from),
    'requests', (SELECT jsonb_build_object(
        'total', count(*),
        'answered', count(*) FILTER (WHERE first_reply_at IS NOT NULL),
        'median_first_reply_minutes', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_reply_at - created_at) / 60) FILTER (WHERE first_reply_at IS NOT NULL),
        'median_first_reply_business_minutes', percentile_cont(0.5) WITHIN GROUP (ORDER BY public.staff_business_minutes(created_at, first_reply_at)) FILTER (WHERE first_reply_at IS NOT NULL))
      FROM public.help_requests WHERE created_at >= v_from),
    'connection_failures', (SELECT jsonb_build_object(
        'crm_failing', count(*) FILTER (WHERE status::text = 'broken'),
        'crm_inactive', count(*) FILTER (WHERE status::text = 'inactive'))
      FROM public.ghl_connections),
    'escalations', (SELECT jsonb_build_object('raised', count(*), 'resolved', count(*) FILTER (WHERE status = 'resolved'))
      FROM public.staff_escalations WHERE created_at >= v_from)
  );
END;
$$;

/** Counts for the Queue badge and the Staff Home strip, bounded to the person's workspaces. */
CREATE OR REPLACE FUNCTION public.staff_queue_counts(p_scope text DEFAULT 'all')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (SELECT public.staff_scope_org_ids(p_scope) AS id)
  SELECT jsonb_build_object(
    'escalations', (SELECT count(*) FROM public.staff_escalations e WHERE e.org_id IN (SELECT id FROM scope) AND e.status IN ('open', 'acknowledged')),
    'requests', (SELECT count(*) FROM public.help_requests h WHERE h.org_id IN (SELECT id FROM scope) AND h.status = 'received'),
    'requests_overdue', (SELECT count(*) FROM public.help_requests h WHERE h.org_id IN (SELECT id FROM scope) AND h.status = 'received' AND h.flagged_at IS NOT NULL),
    'data_requests', (SELECT count(*) FROM public.data_requests d WHERE d.org_id IN (SELECT id FROM scope) AND d.status IN ('received', 'in_review', 'approved', 'in_progress')),
    'failed_runs', (SELECT count(*) FROM public.agent_activity_runs r WHERE r.org_id IN (SELECT id FROM scope) AND NOT r.simulated
      AND r.status IN ('failed', 'stuck') AND r.created_at > now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.staff_run_reviews v WHERE v.run_id = r.id))
  );
$$;

/** The audit log for Platform Admins: search and filter across every workspace. */
CREATE OR REPLACE FUNCTION public.staff_audit_log(
  p_search text DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_actor_kind text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (id uuid, created_at timestamptz, org_id uuid, org_name text, actor_label text, actor_kind text, action text, target_table text, target_id text, detail jsonb, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.created_at, l.org_id, o.name, l.actor_label, l.actor_kind, l.action, l.target_table, l.target_id, l.detail,
    count(*) OVER ()
  FROM public.workspace_activity_log l
  LEFT JOIN public.organizations o ON o.id = l.org_id
  WHERE (public.is_platform_admin() OR l.org_id IN (SELECT public.user_staff_org_ids()))
    AND (p_org_id IS NULL OR l.org_id = p_org_id)
    AND (p_actor_kind IS NULL OR l.actor_kind = p_actor_kind)
    AND (p_action IS NULL OR l.action LIKE replace(replace(p_action, '%', ''), '_', '\_') || '%')
    AND (p_from IS NULL OR l.created_at >= p_from)
    AND (p_to IS NULL OR l.created_at < p_to)
    AND (
      NULLIF(btrim(COALESCE(p_search, '')), '') IS NULL
      OR l.actor_label ILIKE '%' || btrim(p_search) || '%'
      OR l.action ILIKE '%' || btrim(p_search) || '%'
      OR o.name ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 5000) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

/** Operator summaries are available unless a Platform Admin turned them off for this workspace. */
CREATE OR REPLACE FUNCTION public.staff_operator_summaries_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require(p_org_id);
  RETURN COALESCE((SELECT c.operator_summaries_enabled FROM public.workspace_controls c WHERE c.org_id = p_org_id), true);
END;
$$;

/**
 * Facts per Operator that the shared metric layer does not carry: follow-ups
 * logged, case-file corrections, and draft decisions they made themselves.
 */
CREATE OR REPLACE FUNCTION public.staff_operator_activity(p_org_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (member_id uuid, name text, role text, active boolean, last_seen_at timestamptz, deactivated_at timestamptz,
  follow_ups integer, corrections integer, drafts_approved integer, drafts_edited integer, drafts_rejected integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.staff_operator_summaries_allowed(p_org_id) THEN
    RAISE EXCEPTION 'Operator summaries are turned off for this workspace.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.id, m.display_name, m.role::text, m.active, m.last_seen_at, m.deactivated_at,
      (SELECT count(*)::int FROM public.touches t
        JOIN public.leads l ON l.id = t.lead_id AND NOT l.is_test AND l.merged_into IS NULL
        WHERE t.org_id = p_org_id AND t.actor_member_id = m.id AND t.direction::text = 'outbound'
          AND t.occurred_at >= p_from AND t.occurred_at < p_to),
      (SELECT count(*)::int FROM public.case_file_fields f
        JOIN public.leads l ON l.id = f.lead_id AND NOT l.is_test AND l.merged_into IS NULL
        WHERE f.org_id = p_org_id AND f.edited_by_member_id = m.id AND f.edited_at >= p_from AND f.edited_at < p_to),
      (SELECT count(*)::int FROM public.relay_drafts d WHERE d.org_id = p_org_id AND NOT d.simulated AND d.approved_by_member_id = m.id
        AND d.approved_at >= p_from AND d.approved_at < p_to AND (d.final_body IS NULL OR d.final_body = d.body) AND COALESCE(d.edit_distance, 0) = 0),
      (SELECT count(*)::int FROM public.relay_drafts d WHERE d.org_id = p_org_id AND NOT d.simulated AND d.approved_by_member_id = m.id
        AND d.approved_at >= p_from AND d.approved_at < p_to AND ((d.final_body IS NOT NULL AND d.final_body <> d.body) OR COALESCE(d.edit_distance, 0) > 0)),
      (SELECT count(*)::int FROM public.approval_items i JOIN public.relay_drafts d ON d.approval_item_id = i.id
        WHERE i.org_id = p_org_id AND NOT d.simulated AND i.decided_by_member_id = m.id AND d.status = 'rejected'
          AND i.decided_at >= p_from AND i.decided_at < p_to)
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.seat = 'customer'
      AND (
        (m.role::text IN ('setter', 'closer', 'operator') AND (m.active OR m.deactivated_at >= p_from))
        OR EXISTS (SELECT 1 FROM public.leads l WHERE l.org_id = p_org_id AND (l.assigned_setter_id = m.id OR l.assigned_closer_id = m.id))
      )
    ORDER BY m.display_name;
END;
$$;

/** Patterns staff can act on, from recorded data only. Each carries its sample size. */
CREATE OR REPLACE FUNCTION public.staff_workspace_patterns(p_org_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM public.staff_require(p_org_id);
  SELECT COALESCE(NULLIF(timezone, ''), 'UTC') INTO v_tz FROM public.organizations WHERE id = p_org_id;
  RETURN jsonb_build_object(
    'timezone', v_tz,
    'evening', (
      SELECT jsonb_build_object(
        'day_n', count(*) FILTER (WHERE extract(hour FROM l.opted_in_at AT TIME ZONE v_tz) BETWEEN 8 AND 17),
        'day_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY m.seconds) FILTER (WHERE extract(hour FROM l.opted_in_at AT TIME ZONE v_tz) BETWEEN 8 AND 17),
        'evening_n', count(*) FILTER (WHERE extract(hour FROM l.opted_in_at AT TIME ZONE v_tz) >= 18),
        'evening_median', percentile_cont(0.5) WITHIN GROUP (ORDER BY m.seconds) FILTER (WHERE extract(hour FROM l.opted_in_at AT TIME ZONE v_tz) >= 18))
      FROM public.leads l
      JOIN LATERAL (
        SELECT mm.seconds FROM public.sentry_measurements mm
        WHERE mm.org_id = p_org_id AND mm.lead_id = l.id AND mm.metric = 'time_to_first_touch'
        ORDER BY mm.recorded_at LIMIT 1
      ) m ON true
      WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
        AND l.opted_in_at >= p_from AND l.opted_in_at < p_to),
    'unowned_open', (
      SELECT count(*) FROM public.leads l
      WHERE l.org_id = p_org_id AND NOT l.is_test AND l.merged_into IS NULL
        AND l.status::text = ANY (public.portal_open_statuses())
        AND l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL),
    'removed_with_leads', (
      SELECT count(DISTINCT m.id) FROM public.org_members m
      JOIN public.leads l ON l.org_id = p_org_id AND (l.assigned_setter_id = m.id OR l.assigned_closer_id = m.id)
        AND l.status::text = ANY (public.portal_open_statuses()) AND NOT l.is_test AND l.merged_into IS NULL
      WHERE m.org_id = p_org_id AND NOT m.active)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Platform Admin tools: billing access, handover, bulk assignment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_staff_billing_access(p_user_id uuid, p_allowed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  UPDATE public.platform_staff SET billing_access = p_allowed WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ws_log(NULL, CASE WHEN p_allowed THEN 'staff.billing_access_on' ELSE 'staff.billing_access_off' END,
    'platform_staff', p_user_id::text, '{}'::jsonb, auth.uid());
END;
$$;

-- Never leave the platform without an active Platform Admin.
CREATE OR REPLACE FUNCTION public.platform_staff_last_admin_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'platform_admin' AND OLD.active AND (NOT NEW.active OR NEW.role <> 'platform_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.platform_staff s
      WHERE s.user_id <> OLD.user_id AND s.active AND s.role = 'platform_admin'
    ) THEN
      RAISE EXCEPTION 'This is the last Platform Admin. Add another before removing this one.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS platform_staff_last_admin_guard ON public.platform_staff;
CREATE TRIGGER platform_staff_last_admin_guard BEFORE UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.platform_staff_last_admin_guard();

/** Open work a staff member holds, for the handover prompt. */
CREATE OR REPLACE FUNCTION public.staff_open_work(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  RETURN jsonb_build_object(
    'workspaces', (SELECT COALESCE(jsonb_agg(jsonb_build_object('org_id', a.org_id, 'name', o.name) ORDER BY o.name), '[]'::jsonb)
      FROM public.workspace_assignments a JOIN public.organizations o ON o.id = a.org_id
      WHERE a.user_id = p_user_id AND a.ended_at IS NULL),
    'requests', (SELECT count(*) FROM public.help_requests WHERE owner_user_id = p_user_id AND status IN ('received', 'in_progress')),
    'escalations', (SELECT count(*) FROM public.staff_escalations WHERE owner_user_id = p_user_id AND status <> 'resolved'),
    'data_requests', (SELECT count(*) FROM public.data_requests WHERE owner_user_id = p_user_id AND status IN ('received', 'in_review', 'approved', 'in_progress'))
  );
END;
$$;

/**
 * Hand a person's workspaces and open items to someone else, then deactivate
 * them. p_handover maps org_id -> new user_id; a missing entry leaves the
 * workspace to Platform Admins, and it shows as unassigned.
 */
CREATE OR REPLACE FUNCTION public.staff_deactivate_with_handover(p_user_id uuid, p_handover jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_to uuid;
  v_moved integer := 0;
BEGIN
  PERFORM public.staff_require_admin();
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate yourself.' USING ERRCODE = '42501';
  END IF;
  FOR v_org IN SELECT a.org_id FROM public.workspace_assignments a WHERE a.user_id = p_user_id AND a.ended_at IS NULL LOOP
    v_to := NULLIF(p_handover->>v_org::text, '')::uuid;
    IF v_to IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = v_to AND s.active) OR v_to = p_user_id THEN
        RAISE EXCEPTION 'Choose an active staff member to take over.' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.workspace_assignments a WHERE a.org_id = v_org AND a.user_id = v_to AND a.ended_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = v_to AND s.role = 'platform_admin') THEN
        PERFORM public.assign_staff_to_workspace(v_org, v_to, 'Handover');
      END IF;
    END IF;
    UPDATE public.help_requests SET owner_user_id = v_to WHERE org_id = v_org AND owner_user_id = p_user_id AND status IN ('received', 'in_progress');
    UPDATE public.staff_escalations SET owner_user_id = v_to, updated_at = now() WHERE org_id = v_org AND owner_user_id = p_user_id AND status <> 'resolved';
    UPDATE public.data_requests SET owner_user_id = v_to, updated_at = now() WHERE org_id = v_org AND owner_user_id = p_user_id AND status IN ('received', 'in_review', 'approved', 'in_progress');
    v_moved := v_moved + 1;
  END LOOP;
  UPDATE public.help_requests SET owner_user_id = NULL WHERE owner_user_id = p_user_id AND status IN ('received', 'in_progress');
  UPDATE public.staff_escalations SET owner_user_id = NULL, updated_at = now() WHERE owner_user_id = p_user_id AND status <> 'resolved';
  UPDATE public.data_requests SET owner_user_id = NULL WHERE owner_user_id = p_user_id AND status IN ('received', 'in_review', 'approved', 'in_progress');
  PERFORM public.staff_session_end_internal(w.id, 'deactivated')
  FROM public.staff_workspace_sessions w WHERE w.user_id = p_user_id AND w.ended_at IS NULL;
  PERFORM public.deactivate_user_everywhere(p_user_id);
  PERFORM public.ws_log(NULL, 'staff.deactivated_with_handover', 'platform_staff', p_user_id::text,
    jsonb_build_object('workspaces', v_moved), auth.uid());
  RETURN jsonb_build_object('workspaces', v_moved);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_bulk_assign(p_org_ids uuid[], p_user_id uuid, p_unassign boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_n integer := 0;
BEGIN
  PERFORM public.staff_require_admin();
  IF cardinality(p_org_ids) > 500 THEN
    RAISE EXCEPTION 'Choose at most 500 workspaces at a time.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_org IN ARRAY p_org_ids LOOP
    IF p_unassign THEN
      IF EXISTS (SELECT 1 FROM public.workspace_assignments WHERE org_id = v_org AND user_id = p_user_id AND ended_at IS NULL) THEN
        PERFORM public.end_staff_assignment(v_org, p_user_id);
        v_n := v_n + 1;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.workspace_assignments WHERE org_id = v_org AND user_id = p_user_id AND ended_at IS NULL) THEN
      PERFORM public.assign_staff_to_workspace(v_org, p_user_id, 'Bulk assignment');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

/** Workload per staff member: workspaces and open items. */
CREATE OR REPLACE FUNCTION public.staff_workload()
RETURNS TABLE (user_id uuid, name text, role text, active boolean, workspaces integer, requests integer, escalations integer, data_requests integer, last_active_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  RETURN QUERY
    SELECT s.user_id, s.display_name, s.role::text, s.active,
      (SELECT count(*)::int FROM public.workspace_assignments a WHERE a.user_id = s.user_id AND a.ended_at IS NULL),
      (SELECT count(*)::int FROM public.help_requests h WHERE h.owner_user_id = s.user_id AND h.status IN ('received', 'in_progress')),
      (SELECT count(*)::int FROM public.staff_escalations e WHERE e.owner_user_id = s.user_id AND e.status <> 'resolved'),
      (SELECT count(*)::int FROM public.data_requests d WHERE d.owner_user_id = s.user_id AND d.status IN ('received', 'in_review', 'approved', 'in_progress')),
      GREATEST(
        (SELECT max(l.created_at) FROM public.workspace_activity_log l WHERE l.actor_user_id = s.user_id),
        (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = s.user_id))
    FROM public.platform_staff s
    ORDER BY s.active DESC, s.display_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. Staff sign-in: authenticator app enforcement and recovery codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS staff_recovery_codes_user_idx ON public.staff_recovery_codes (user_id) WHERE used_at IS NULL;
ALTER TABLE public.staff_recovery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_recovery_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_recovery_codes TO service_role;

/** Who has a verified authenticator app, and how many unused recovery codes. */
CREATE OR REPLACE FUNCTION public.staff_mfa_status()
RETURNS TABLE (user_id uuid, name text, role text, enrolled boolean, recovery_codes integer, deadline timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  s public.staff_support_settings%ROWTYPE;
BEGIN
  IF NOT public.is_platform_staff() AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.staff_support_settings WHERE id;
  RETURN QUERY
    SELECT p.user_id, p.display_name, p.role::text,
      EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.user_id AND f.factor_type::text = 'totp' AND f.status::text = 'verified'),
      (SELECT count(*)::int FROM public.staff_recovery_codes c WHERE c.user_id = p.user_id AND c.used_at IS NULL),
      CASE WHEN s.mfa_enforced_at IS NULL THEN NULL ELSE GREATEST(s.mfa_enforced_at, p.created_at) + make_interval(days => s.mfa_grace_days) END
    FROM public.platform_staff p
    WHERE p.active AND (public.is_platform_admin() OR p.user_id = auth.uid() OR COALESCE(auth.role(), '') = 'service_role');
END;
$$;

/**
 * Turn authenticator enforcement on or off. Turning it on needs the admin to be
 * enrolled, and either a second enrolled Platform Admin or the admin's own
 * unused recovery codes, so nobody can be locked out.
 */
CREATE OR REPLACE FUNCTION public.staff_mfa_set_enforced(p_on boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_self_enrolled boolean;
  v_other boolean;
  v_codes integer;
  v_at timestamptz;
BEGIN
  PERFORM public.staff_require_admin();
  IF p_on THEN
    SELECT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.factor_type::text = 'totp' AND f.status::text = 'verified') INTO v_self_enrolled;
    IF NOT v_self_enrolled THEN
      RAISE EXCEPTION 'Set up your own authenticator app first.' USING ERRCODE = '22023';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.platform_staff p JOIN auth.mfa_factors f ON f.user_id = p.user_id AND f.factor_type::text = 'totp' AND f.status::text = 'verified'
      WHERE p.active AND p.role = 'platform_admin' AND p.user_id <> auth.uid()
    ) INTO v_other;
    SELECT count(*) INTO v_codes FROM public.staff_recovery_codes WHERE user_id = auth.uid() AND used_at IS NULL;
    IF NOT v_other AND v_codes = 0 THEN
      RAISE EXCEPTION 'Add a second Platform Admin with an authenticator app, or keep your recovery codes, before turning this on.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.staff_support_settings SET mfa_enforced_at = COALESCE(mfa_enforced_at, now()), mfa_enforced_by = auth.uid(), updated_at = now() WHERE id
    RETURNING mfa_enforced_at INTO v_at;
  ELSE
    UPDATE public.staff_support_settings SET mfa_enforced_at = NULL, mfa_enforced_by = auth.uid(), updated_at = now() WHERE id;
  END IF;
  PERFORM public.ws_log(NULL, CASE WHEN p_on THEN 'staff.mfa_enforced' ELSE 'staff.mfa_not_enforced' END, 'staff_support_settings', 'mfa', '{}'::jsonb, auth.uid());
  RETURN v_at;
END;
$$;

-- Notices staff send an Owner (an agent paused, a connection to fix).
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'workspace_notice';

-- ---------------------------------------------------------------------------
-- 16. Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.staff_scope_org_ids(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_escalations_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_escalations_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_escalation_raise(uuid, text, text, text, text, uuid, text, text, jsonb, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_session_end_internal(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.data_requests_defaults() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.help_requests_staff_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.help_replies_first_reply() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_announcement_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_staff_last_admin_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_canned_reply_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_sessions_follow_assignment() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'staff_require(uuid)', 'staff_require_admin()', 'staff_scope_org_ids(text)', 'staff_default_owner(uuid)', 'staff_can_work(uuid, uuid)',
    'staff_support_settings_save(jsonb)', 'staff_business_minutes(timestamptz, timestamptz)', 'staff_health_rules_save(jsonb, text)',
    'staff_may_approve(uuid)', 'set_staff_approval(uuid, boolean)', 'set_operator_summaries(uuid, boolean, text)',
    'set_carrier_registration(uuid, text, text)', 'staff_note_add(uuid, text)', 'staff_note_archive(uuid)', 'staff_save_columns(text[])',
    'staff_mark_home_seen()', 'staff_session_enter(uuid)', 'staff_session_touch(uuid)', 'staff_session_exit()',
    'owner_staff_history(uuid, integer, timestamptz)', 'staff_item_note_add(text, uuid, uuid, text)',
    'staff_escalation_act(uuid, text, text, uuid, timestamptz, timestamptz)', 'help_request_assign(uuid, uuid)', 'help_request_working(uuid)',
    'data_request_billing_block(uuid)', 'data_request_staff_create(uuid, text, uuid, text)', 'data_request_act(uuid, text, text, uuid, timestamptz)',
    'portal_banners(uuid)', 'portal_product_updates(uuid, integer)', 'set_platform_agent_halt(text, boolean, text)',
    'staff_run_review(uuid, text, text)', 'staff_roster_facts(text, uuid, integer)', 'staff_agent_overview(text, uuid)',
    'staff_agent_failures(text, integer, integer)', 'staff_approval_health(text, uuid)', 'staff_connections(text, uuid)', 'staff_usage_month()',
    'staff_platform_metrics(integer)', 'staff_queue_counts(text)', 'staff_audit_log(text, uuid, text, text, timestamptz, timestamptz, integer, integer)',
    'staff_operator_summaries_allowed(uuid)', 'staff_operator_activity(uuid, timestamptz, timestamptz)', 'staff_workspace_patterns(uuid, timestamptz, timestamptz)',
    'set_staff_billing_access(uuid, boolean)', 'staff_open_work(uuid)', 'staff_deactivate_with_handover(uuid, jsonb)',
    'staff_bulk_assign(uuid[], uuid, boolean)', 'staff_workload()', 'staff_mfa_status()', 'staff_mfa_set_enforced(boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
