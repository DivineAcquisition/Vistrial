-- Prompt 11: Compass, the Sales OS chat agent.
--
-- Compass replaces the Ask Vistrial chat. It answers from a fixed set of
-- permission-checked lookups that run as the person asking, keeps each
-- person's conversations private to them, and can only suggest actions that
-- the person confirms and the existing approval gate then checks again.
--
-- 1. Transcript permission: Owners decide which Members may read transcripts.
-- 2. Old Ask Vistrial conversations: private to their author, deletable.
-- 3. Compass runs: visible only to the person who asked, staff included.
-- 4. Activation: switching on Compass is the last staged step.
-- 5. Conversations, shares, feedback, usage, pins, limits, help articles.
-- 6. Lookups: leads, one case file, transcript text for one lead, metrics.
-- 7. Suggested actions: a Relay draft, a next action, an activity record.
-- 8. Retention and purge.
-- 9. Configuration registry (generated).
-- 10. Grants.

-- ---------------------------------------------------------------------------
-- 1. Transcript permission
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS can_see_transcripts boolean NOT NULL DEFAULT false;

-- The money, export and transcript grants only mean something on a Member seat.
CREATE OR REPLACE FUNCTION public.org_members_grants_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role NOT IN ('member', 'client_viewer') THEN
    NEW.can_see_money := false;
    NEW.can_export := false;
    NEW.can_see_transcripts := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_grants_guard ON public.org_members;
CREATE TRIGGER org_members_grants_guard
  BEFORE INSERT OR UPDATE OF role, can_see_money, can_export, can_see_transcripts ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_grants_guard();

CREATE OR REPLACE FUNCTION public.org_members_grants_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.can_see_money IS DISTINCT FROM OLD.can_see_money THEN
    PERFORM public.ws_log(NEW.org_id, 'member.money_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_see_money, 'name', NEW.display_name), auth.uid());
  END IF;
  IF NEW.can_export IS DISTINCT FROM OLD.can_export THEN
    PERFORM public.ws_log(NEW.org_id, 'member.export_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_export, 'name', NEW.display_name), auth.uid());
  END IF;
  IF NEW.can_see_transcripts IS DISTINCT FROM OLD.can_see_transcripts THEN
    PERFORM public.ws_log(NEW.org_id, 'member.transcript_permission_changed', 'org_members', NEW.id::text,
      jsonb_build_object('granted', NEW.can_see_transcripts, 'name', NEW.display_name), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_grants_audit ON public.org_members;
CREATE TRIGGER org_members_grants_audit
  AFTER UPDATE OF can_see_money, can_export, can_see_transcripts ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_grants_audit();

-- Only an Owner changes a Member's transcript permission. Staff manage seats in
-- other ways; this grant is the customer's own decision.
CREATE OR REPLACE FUNCTION public.org_members_transcript_grant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.can_see_transcripts IS DISTINCT FROM OLD.can_see_transcripts
     AND auth.uid() IS NOT NULL
     AND COALESCE(public.ws_access(NEW.org_id), '') <> 'owner' THEN
    RAISE EXCEPTION 'Only an Owner can change who sees transcripts.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_transcript_grant_guard ON public.org_members;
CREATE TRIGGER org_members_transcript_grant_guard
  BEFORE UPDATE OF can_see_transcripts ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_transcript_grant_guard();

CREATE OR REPLACE FUNCTION public.portal_member_flag(p_org_id uuid, p_flag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE p_flag
      WHEN 'money' THEN m.can_see_money
      WHEN 'export' THEN m.can_export
      WHEN 'approve' THEN m.can_approve
      WHEN 'transcripts' THEN m.can_see_transcripts
    END
    FROM public.org_members m
    WHERE m.org_id = p_org_id AND m.user_id = auth.uid() AND m.active AND m.seat = 'customer'
      AND m.role IN ('member', 'client_viewer')
    LIMIT 1
  ), false);
$$;

/**
 * Who may read transcript text and the quotes taken from it. Owners, staff of
 * the workspace, and Operators (on the leads they can see) as before; Members
 * only when an Owner has granted it. Service-role callers (jobs) always may.
 */
CREATE OR REPLACE FUNCTION public.ws_can_see_transcripts(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL AND COALESCE(auth.role(), 'service_role') = 'service_role' THEN true
    ELSE COALESCE(
      CASE public.ws_access(p_org_id)
        WHEN 'owner' THEN true
        WHEN 'platform_admin' THEN true
        WHEN 'service_team' THEN true
        WHEN 'operator' THEN true
        WHEN 'member' THEN public.portal_member_flag(p_org_id, 'transcripts')
        ELSE false
      END,
      false)
  END;
$$;

-- Transcript passages carry transcript text: Members without the grant see none.
DROP POLICY IF EXISTS transcript_passages_member_grant ON public.transcript_passages;
CREATE POLICY transcript_passages_member_grant ON public.transcript_passages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.ws_can_see_transcripts(org_id));

-- Meaning search: excerpts follow the same rule.
CREATE OR REPLACE FUNCTION public.case_meaning_search(
  p_org_id uuid,
  p_embedding extensions.vector(768),
  p_limit integer DEFAULT 12
)
RETURNS TABLE (lead_id uuid, passage_id uuid, call_id uuid, speaker text, excerpt text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT e.lead_id, p.id, p.call_id, p.speaker,
    CASE WHEN public.ws_can_see_transcripts(p_org_id) THEN left(p.body, 180) ELSE NULL END,
    1 - (e.embedding <=> p_embedding)
  FROM public.scribe_embeddings e
  JOIN public.transcript_passages p ON p.id = e.passage_id AND p.org_id = e.org_id
  JOIN public.leads l ON l.id = e.lead_id AND l.org_id = e.org_id
  WHERE e.org_id = p_org_id
    AND p_org_id IN (SELECT public.user_org_ids())
    AND l.merged_into IS NULL
    AND (
      p_org_id NOT IN (SELECT public.user_operator_org_ids())
      OR e.lead_id IN (SELECT public.operator_visible_lead_ids())
    )
  ORDER BY e.embedding <=> p_embedding
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 25);
$$;

/** Transcript text for calls the person can see, only when they may read transcripts. */
CREATE OR REPLACE FUNCTION public.call_transcript_texts(p_org_id uuid, p_call_ids uuid[])
RETURNS TABLE (call_id uuid, transcript text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.raw_transcript
  FROM public.calls c
  WHERE c.org_id = p_org_id
    AND c.id = ANY (p_call_ids)
    AND public.ws_can_see_transcripts(p_org_id)
    AND c.lead_id IS NOT NULL
    AND public.ws_lead_visible(p_org_id, c.lead_id);
$$;

/** Evidence quotes and objection wording, under the same rule. */
CREATE OR REPLACE FUNCTION public.case_quotes_visible(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ws_can_see_transcripts(p_org_id);
$$;

-- ---------------------------------------------------------------------------
-- 2. Old Ask Vistrial conversations: private to their author, deletable
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales_os_conversations ADD COLUMN IF NOT EXISTS text_deleted_at timestamptz;

-- Tool calls keep their record exactly as before: what Vistrial did, for the
-- people who could see it, stays visible on "What Vistrial did".
CREATE OR REPLACE FUNCTION public.sales_os_tool_call_visible(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_os_conversations c
    WHERE c.id = p_conversation_id
      AND c.org_id IN (SELECT public.user_org_ids())
      AND (
        c.user_id = auth.uid()
        OR c.org_id IN (SELECT public.user_staff_org_ids())
        OR (c.org_id IN (SELECT public.user_owner_org_ids()) AND NOT public.is_platform_staff_user(c.user_id))
      )
  );
$$;

DROP POLICY IF EXISTS sales_os_tool_calls_select ON public.sales_os_tool_calls;
CREATE POLICY sales_os_tool_calls_select
  ON public.sales_os_tool_calls FOR SELECT TO authenticated
  USING (public.sales_os_tool_call_visible(conversation_id));

-- The conversation text itself: only its author, nobody else.
CREATE OR REPLACE FUNCTION public.sales_os_conversation_visible(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_os_conversations c
    WHERE c.id = p_conversation_id
      AND c.org_id IN (SELECT public.user_org_ids())
      AND c.user_id = auth.uid()
  );
$$;

-- Messages may now be deleted, but only through compass_legacy_delete.
CREATE OR REPLACE FUNCTION public.sales_os_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales_os_messages' AND current_setting('vistrial.compass_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Sales OS records are never deleted.' USING ERRCODE = '42501';
END;
$$;

/** The author deletes an old conversation's text. What Vistrial did stays on record. */
CREATE OR REPLACE FUNCTION public.compass_legacy_delete(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.sales_os_conversations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.sales_os_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR c.user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('vistrial.compass_delete', 'on', true);
  DELETE FROM public.sales_os_messages WHERE conversation_id = c.id;
  PERFORM set_config('vistrial.compass_delete', '', true);
  UPDATE public.sales_os_conversations
  SET title = NULL, text_deleted_at = now(), status = 'archived', updated_at = now()
  WHERE id = c.id;
  PERFORM public.ws_log(c.org_id, 'compass.conversation_deleted', 'sales_os_conversations', c.id::text,
    jsonb_build_object('legacy', true), auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Compass runs: visible only to the person who asked
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
    CASE
      -- A Compass run is a private conversation's working record: only the
      -- person who asked sees it, staff and Platform Admins included.
      WHEN p_agent_id = 'compass' THEN
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

-- ---------------------------------------------------------------------------
-- 4. Activation: Compass is the last staged step, and it switches on for real
-- ---------------------------------------------------------------------------

-- Workspaces that existed before staged activation used Ask Vistrial, so
-- Compass stays on for them. Workspaces created since start with it off.
UPDATE public.workspace_agent_activation
SET stage = 'on', note = 'Compass replaces Ask Vistrial, which this workspace already used.', updated_at = now()
WHERE agent_id = 'compass' AND stage = 'coming_soon';

/** Whether Compass may answer in this workspace right now, and if not, why. */
CREATE OR REPLACE FUNCTION public.compass_availability(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  o public.organizations%ROWTYPE;
  v_stage text;
  v_paused boolean;
  v_halted boolean;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.organizations WHERE id = p_org_id;
  SELECT a.stage INTO v_stage FROM public.workspace_agent_activation a WHERE a.org_id = p_org_id AND a.agent_id = 'compass';
  SELECT COALESCE(c.paused, false) INTO v_paused FROM public.agent_presence_controls c WHERE c.org_id = p_org_id AND c.agent_id = 'compass';
  SELECT COALESCE(h.halted, false) INTO v_halted FROM public.platform_agent_halts h WHERE h.agent_id = 'compass';
  RETURN jsonb_build_object(
    'available', o.status::text IN ('active', 'onboarding')
      AND NOT COALESCE(o.agents_halted, false)
      AND NOT COALESCE(v_paused, false)
      AND NOT COALESCE(v_halted, false)
      AND COALESCE(v_stage, 'on') = 'on',
    'reason', CASE
      WHEN o.status::text NOT IN ('active', 'onboarding') THEN 'workspace_' || o.status::text
      WHEN COALESCE(o.agents_halted, false) OR COALESCE(v_halted, false) THEN 'halted'
      WHEN COALESCE(v_paused, false) THEN 'paused'
      WHEN v_stage = 'off' AND o.status::text <> 'onboarding' THEN 'off'
      WHEN COALESCE(v_stage, 'on') <> 'on' THEN 'coming_soon'
      ELSE NULL
    END,
    'access', v_access
  );
END;
$$;

/** Platform Admins, and Service Team assigned to the workspace, switch Compass on or off. */
CREATE OR REPLACE FUNCTION public.compass_set_enabled(p_org_id uuid, p_enabled boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_relay text;
BEGIN
  IF NOT (COALESCE(public.is_platform_admin(), false) OR COALESCE(public.ws_access(p_org_id), '') = 'service_team') THEN
    RAISE EXCEPTION 'Only the Vistrial team can switch Compass on or off.' USING ERRCODE = '42501';
  END IF;
  IF p_enabled THEN
    SELECT stage INTO v_relay FROM public.workspace_agent_activation WHERE org_id = p_org_id AND agent_id = 'relay';
    IF COALESCE(v_relay, 'on') = 'off' THEN
      RAISE EXCEPTION 'Switch Relay on first. Compass is the last step.' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO public.workspace_agent_activation (org_id, agent_id, stage, step_order, activated_at, activated_by, activated_by_label, note)
  VALUES (p_org_id, 'compass', CASE WHEN p_enabled THEN 'on' ELSE 'off' END, 4, now(), auth.uid(), public.onboarding_actor_label(p_org_id),
    left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 300))
  ON CONFLICT (org_id, agent_id) DO UPDATE
    SET stage = EXCLUDED.stage, activated_at = now(), activated_by = auth.uid(), activated_by_label = EXCLUDED.activated_by_label,
        note = EXCLUDED.note, updated_at = now();
  PERFORM public.ws_log(p_org_id, CASE WHEN p_enabled THEN 'compass.enabled' ELSE 'compass.disabled' END,
    'workspace_agent_activation', 'compass', jsonb_build_object('reason', p_reason), auth.uid());
END;
$$;

-- The staged activation step, unchanged except that Compass now switches on
-- (it was a placeholder before it was built).
CREATE OR REPLACE FUNCTION public.onboarding_activate_step(p_org_id uuid, p_agent_id text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.workspace_onboarding_status%ROWTYPE;
  a public.workspace_agent_activation%ROWTYPE;
  v_before text;
  v_stage text;
  v_watch_days integer;
BEGIN
  PERFORM public.onboarding_require_staff(p_org_id);
  SELECT * INTO h FROM public.workspace_onboarding_status WHERE org_id = p_org_id FOR UPDATE;
  IF h.phase NOT IN ('activating', 'live') THEN
    RAISE EXCEPTION 'Go-live has not been approved for this workspace.' USING ERRCODE = '22023';
  END IF;
  IF h.activation_paused_at IS NOT NULL THEN
    RAISE EXCEPTION 'Activation is paused. Resume it first.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM public.workspace_agent_activation WHERE org_id = p_org_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown agent.' USING ERRCODE = '22023';
  END IF;
  IF a.stage <> 'off' THEN
    RAISE EXCEPTION 'This step is already done.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(x.agent_id, ', ' ORDER BY x.step_order) INTO v_before
  FROM public.workspace_agent_activation x
  WHERE x.org_id = p_org_id AND x.step_order < a.step_order AND x.stage = 'off';
  IF v_before IS NOT NULL THEN
    RAISE EXCEPTION 'Switch on % first. Agents go on in order.', v_before USING ERRCODE = '22023';
  END IF;

  v_stage := CASE p_agent_id WHEN 'scribe' THEN 'on' WHEN 'sentry' THEN 'watch' WHEN 'relay' THEN 'drafts_only' ELSE 'on' END;
  UPDATE public.workspace_agent_activation
  SET stage = v_stage, activated_at = now(), activated_by = auth.uid(), activated_by_label = public.onboarding_actor_label(p_org_id),
      note = left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), updated_at = now()
  WHERE org_id = p_org_id AND agent_id = p_agent_id;

  IF p_agent_id = 'sentry' THEN
    SELECT COALESCE(td.sentry_watch_days, 1) INTO v_watch_days
    FROM public.organizations o LEFT JOIN public.onboarding_template_defaults td ON td.template_id = o.industry_template_id
    WHERE o.id = p_org_id;
    -- Watch only: Sentry records what it would have alerted, tells nobody, and
    -- only watches leads that arrive from now on.
    INSERT INTO public.sentry_workspaces (org_id, mode, watch_from, activated_by, activated_at, updated_at)
    VALUES (p_org_id, 'practice', now(), auth.uid(), now(), now())
    ON CONFLICT (org_id) DO UPDATE SET mode = 'practice', watch_from = now(), activated_by = auth.uid(), activated_at = now(), updated_at = now();
    UPDATE public.workspace_onboarding_status
    SET sentry_watch_until = now() + make_interval(days => COALESCE(v_watch_days, 1)), updated_at = now()
    WHERE org_id = p_org_id;
  END IF;

  IF p_agent_id = 'compass' THEN
    UPDATE public.workspace_onboarding_status SET phase = 'live', updated_at = now() WHERE org_id = p_org_id AND phase = 'activating';
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key) VALUES (p_org_id, 'owner', 'live', 'go_live');
  ELSE
    INSERT INTO public.onboarding_events (org_id, audience, kind, stage_key, detail)
    VALUES (p_org_id, 'owner', 'agent_on', 'go_live', jsonb_build_object('agent', p_agent_id, 'stage', v_stage));
  END IF;
  PERFORM public.ws_log(p_org_id, 'onboarding.agent_activated', 'workspace_agent_activation', p_agent_id,
    jsonb_build_object('agent', p_agent_id, 'stage', v_stage, 'note', left(p_note, 300)), auth.uid());
  PERFORM public.onboarding_refresh(p_org_id);
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. Compass storage
-- ---------------------------------------------------------------------------

-- Conversations: private to the person who had them. Nobody else, not an
-- Owner, not staff, not a Platform Admin, reads them, except through a share
-- the person chose (compass_shares), which is logged and expires.
CREATE TABLE IF NOT EXISTS public.compass_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_id uuid,
  title text CHECK (title IS NULL OR char_length(title) <= 120),
  origin text NOT NULL DEFAULT 'page' CHECK (origin IN ('page', 'panel')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id)
);
CREATE INDEX IF NOT EXISTS compass_conversations_mine_idx ON public.compass_conversations (org_id, user_id, last_message_at DESC NULLS LAST);
COMMENT ON TABLE public.compass_conversations IS
  'Compass conversations. Private to user_id. The title never carries lead details. Deleted conversations are removed at once.';

CREATE TABLE IF NOT EXISTS public.compass_messages (
  conversation_id uuid NOT NULL,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 80),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, id),
  CONSTRAINT compass_messages_conversation_fkey FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.compass_conversations (id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS compass_messages_seq_idx ON public.compass_messages (conversation_id, seq);

-- A share the person chose, so the team can help with one conversation.
CREATE TABLE IF NOT EXISTS public.compass_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  help_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  CONSTRAINT compass_shares_conversation_fkey FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.compass_conversations (id, org_id) ON DELETE CASCADE,
  CHECK (expires_at <= created_at + interval '7 days')
);
CREATE INDEX IF NOT EXISTS compass_shares_org_idx ON public.compass_shares (org_id, created_at DESC);

-- What Compass did, without the words: for usage, limits and quality.
CREATE TABLE IF NOT EXISTS public.compass_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_id uuid,
  staff boolean NOT NULL DEFAULT false,
  conversation_id uuid,
  message_id text,
  origin text NOT NULL DEFAULT 'page' CHECK (origin IN ('page', 'panel')),
  route text NOT NULL DEFAULT 'reasoning' CHECK (route IN ('fast', 'reasoning', 'help', 'refused', 'none')),
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  lookups integer NOT NULL DEFAULT 0,
  lookup_names text[] NOT NULL DEFAULT '{}',
  duration_ms integer,
  first_output_ms integer,
  outcome text NOT NULL DEFAULT 'answered'
    CHECK (outcome IN ('answered', 'no_data', 'out_of_scope', 'unverified', 'error', 'limited', 'stopped', 'unavailable')),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compass_usage_org_time_idx ON public.compass_usage (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compass_usage_user_time_idx ON public.compass_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compass_usage_message_idx ON public.compass_usage (user_id, message_id);

CREATE TABLE IF NOT EXISTS public.compass_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_id uuid,
  message_id text NOT NULL CHECK (char_length(message_id) <= 80),
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  reason text CHECK (reason IS NULL OR reason IN ('wrong_number', 'wrong_lead', 'not_helpful', 'too_long', 'missed_something', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS compass_feedback_org_idx ON public.compass_feedback (org_id, created_at DESC);

-- Questions a person pinned for themselves.
CREATE TABLE IF NOT EXISTS public.compass_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 3 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, question)
);

CREATE OR REPLACE FUNCTION public.compass_pins_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.compass_pins WHERE org_id = NEW.org_id AND user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION 'You can pin up to 20 questions. Unpin one first.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS compass_pins_cap ON public.compass_pins;
CREATE TRIGGER compass_pins_cap BEFORE INSERT ON public.compass_pins FOR EACH ROW EXECUTE FUNCTION public.compass_pins_cap();

-- Limits: platform defaults, and a workspace's own day and month figures.
CREATE TABLE IF NOT EXISTS public.compass_platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  person_per_minute integer NOT NULL DEFAULT 10 CHECK (person_per_minute BETWEEN 1 AND 120),
  person_per_day integer NOT NULL DEFAULT 100 CHECK (person_per_day BETWEEN 1 AND 5000),
  workspace_per_day integer NOT NULL DEFAULT 500 CHECK (workspace_per_day BETWEEN 1 AND 100000),
  workspace_per_month integer NOT NULL DEFAULT 8000 CHECK (workspace_per_month BETWEEN 1 AND 1000000),
  max_question_chars integer NOT NULL DEFAULT 2000 CHECK (max_question_chars BETWEEN 200 AND 8000),
  max_turns integer NOT NULL DEFAULT 40 CHECK (max_turns BETWEEN 4 AND 200),
  warn_at_percent integer NOT NULL DEFAULT 80 CHECK (warn_at_percent BETWEEN 50 AND 99),
  drafts_per_person_per_day integer NOT NULL DEFAULT 10 CHECK (drafts_per_person_per_day BETWEEN 0 AND 100),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.compass_platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.compass_workspace_limits (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  workspace_per_day integer CHECK (workspace_per_day IS NULL OR workspace_per_day BETWEEN 1 AND 100000),
  workspace_per_month integer CHECK (workspace_per_month IS NULL OR workspace_per_month BETWEEN 1 AND 1000000),
  person_per_day integer CHECK (person_per_day IS NULL OR person_per_day BETWEEN 1 AND 5000),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Product help articles, shared by the Help area and Compass. Platform-wide,
-- no workspace data; Platform Admins edit them.
CREATE TABLE IF NOT EXISTS public.help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,60}$'),
  topic text NOT NULL CHECK (topic IN ('general', 'connections', 'billing', 'results', 'team', 'onboarding', 'privacy', 'leads', 'agents')),
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 5 AND 160),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 4000),
  link_label text CHECK (link_label IS NULL OR char_length(link_label) <= 60),
  link_href text CHECK (link_href IS NULL OR link_href ~ '^/app/[A-Za-z0-9/_?=&#-]*$'),
  sort integer NOT NULL DEFAULT 100,
  published boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Relay drafts asked for from Compass: who asked, kept on the job.
ALTER TABLE public.relay_jobs ADD COLUMN IF NOT EXISTS requested_by_user uuid;
ALTER TABLE public.relay_jobs ADD COLUMN IF NOT EXISTS requested_by_member uuid;
ALTER TABLE public.relay_jobs ADD COLUMN IF NOT EXISTS requested_by_label text CHECK (requested_by_label IS NULL OR char_length(requested_by_label) <= 120);
ALTER TABLE public.relay_jobs DROP CONSTRAINT IF EXISTS relay_jobs_trigger_check;
ALTER TABLE public.relay_jobs ADD CONSTRAINT relay_jobs_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'sample', 'compass_request'));
-- Drafts carry their job's trigger. The onboarding sample test's trigger was
-- missing here, so a sample draft could not be saved; Compass requests join it.
ALTER TABLE public.relay_drafts DROP CONSTRAINT IF EXISTS relay_drafts_trigger_check;
ALTER TABLE public.relay_drafts ADD CONSTRAINT relay_drafts_trigger_check
  CHECK (trigger IN ('after_call', 'missed_window', 'follow_up', 'sample', 'compass_request'));
CREATE INDEX IF NOT EXISTS relay_jobs_requested_idx ON public.relay_jobs (requested_by_user, created_at DESC) WHERE requested_by_user IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5b. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.compass_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_workspace_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

-- Mine: the signed-in person's own rows in a workspace they belong to.
CREATE OR REPLACE FUNCTION public.compass_is_mine(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_user_id = auth.uid()
    AND public.ws_access(p_org_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.compass_conversation_is_mine(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.compass_conversations c
    WHERE c.id = p_conversation_id AND public.compass_is_mine(c.org_id, c.user_id)
  );
$$;

DROP POLICY IF EXISTS compass_conversations_mine ON public.compass_conversations;
CREATE POLICY compass_conversations_mine ON public.compass_conversations FOR ALL TO authenticated
  USING (public.compass_is_mine(org_id, user_id))
  WITH CHECK (public.compass_is_mine(org_id, user_id) AND member_id IS NOT DISTINCT FROM public.user_member_id(org_id));

DROP POLICY IF EXISTS compass_messages_mine ON public.compass_messages;
CREATE POLICY compass_messages_mine ON public.compass_messages FOR ALL TO authenticated
  USING (public.compass_conversation_is_mine(conversation_id))
  WITH CHECK (public.compass_conversation_is_mine(conversation_id));

DROP POLICY IF EXISTS compass_shares_mine ON public.compass_shares;
CREATE POLICY compass_shares_mine ON public.compass_shares FOR SELECT TO authenticated
  USING (public.compass_conversation_is_mine(conversation_id));

DROP POLICY IF EXISTS compass_usage_mine ON public.compass_usage;
CREATE POLICY compass_usage_mine ON public.compass_usage FOR SELECT TO authenticated
  USING (public.compass_is_mine(org_id, user_id));
DROP POLICY IF EXISTS compass_usage_insert_mine ON public.compass_usage;
CREATE POLICY compass_usage_insert_mine ON public.compass_usage FOR INSERT TO authenticated
  WITH CHECK (public.compass_is_mine(org_id, user_id) AND member_id IS NOT DISTINCT FROM public.user_member_id(org_id));

DROP POLICY IF EXISTS compass_feedback_mine ON public.compass_feedback;
CREATE POLICY compass_feedback_mine ON public.compass_feedback FOR ALL TO authenticated
  USING (public.compass_is_mine(org_id, user_id))
  WITH CHECK (public.compass_is_mine(org_id, user_id) AND member_id IS NOT DISTINCT FROM public.user_member_id(org_id));

DROP POLICY IF EXISTS compass_pins_mine ON public.compass_pins;
CREATE POLICY compass_pins_mine ON public.compass_pins FOR ALL TO authenticated
  USING (public.compass_is_mine(org_id, user_id))
  WITH CHECK (public.compass_is_mine(org_id, user_id));

DROP POLICY IF EXISTS compass_platform_settings_read ON public.compass_platform_settings;
CREATE POLICY compass_platform_settings_read ON public.compass_platform_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS compass_workspace_limits_read ON public.compass_workspace_limits;
CREATE POLICY compass_workspace_limits_read ON public.compass_workspace_limits FOR SELECT TO authenticated
  USING (public.ws_access(org_id) IN ('owner', 'service_team', 'platform_admin'));

DROP POLICY IF EXISTS help_articles_read ON public.help_articles;
CREATE POLICY help_articles_read ON public.help_articles FOR SELECT TO authenticated
  USING (published OR public.is_platform_admin());

-- Closed workspaces take no new writes, as everywhere else.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compass_conversations', 'compass_messages', 'compass_shares', 'compass_usage', 'compass_feedback', 'compass_pins'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS ws_open_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ws_open_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (org_id NOT IN (SELECT public.closed_org_ids()))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.compass_shares FROM authenticated;
REVOKE UPDATE, DELETE ON public.compass_usage FROM authenticated;
GRANT SELECT ON public.compass_platform_settings, public.compass_workspace_limits, public.help_articles TO authenticated;
GRANT ALL ON public.compass_platform_settings, public.compass_workspace_limits, public.help_articles TO service_role;

-- ---------------------------------------------------------------------------
-- 5c. Limits, usage, shares, settings
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compass_effective_limits(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'person_per_minute', s.person_per_minute,
    'person_per_day', COALESCE(w.person_per_day, s.person_per_day),
    'workspace_per_day', COALESCE(w.workspace_per_day, s.workspace_per_day),
    'workspace_per_month', COALESCE(w.workspace_per_month, s.workspace_per_month),
    'max_question_chars', s.max_question_chars,
    'max_turns', s.max_turns,
    'warn_at_percent', s.warn_at_percent,
    'drafts_per_person_per_day', s.drafts_per_person_per_day
  )
  FROM public.compass_platform_settings s
  LEFT JOIN public.compass_workspace_limits w ON w.org_id = p_org_id
  WHERE s.id;
$$;

/**
 * One question's worth of the limits. Checks the month first (it is counted,
 * not consumed), then consumes the minute, the person's day and the
 * workspace's day. Returns which limit stopped it, and whether a limit is near.
 */
CREATE OR REPLACE FUNCTION public.compass_consume(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  l jsonb;
  v_month integer;
  v_minute jsonb;
  v_day jsonb;
  v_org_day jsonb;
  v_warn numeric;
  v_near text := NULL;
BEGIN
  IF v_uid IS NULL OR public.ws_access(p_org_id) IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  l := public.compass_effective_limits(p_org_id);
  v_warn := (l->>'warn_at_percent')::numeric / 100;
  SELECT count(*) INTO v_month FROM public.compass_usage
  WHERE org_id = p_org_id AND created_at >= date_trunc('month', now()) AND outcome NOT IN ('limited', 'unavailable');
  IF v_month >= (l->>'workspace_per_month')::integer THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'workspace_month', 'limits', l);
  END IF;
  v_minute := public.consume_rate_limit('compass-person-minute:' || p_org_id || ':' || v_uid, (l->>'person_per_minute')::integer, 60);
  IF NOT (v_minute->>'allowed')::boolean THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'person_minute', 'limits', l);
  END IF;
  v_day := public.consume_rate_limit('compass-person-day:' || p_org_id || ':' || v_uid, (l->>'person_per_day')::integer, 86400);
  IF NOT (v_day->>'allowed')::boolean THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'person_day', 'limits', l);
  END IF;
  v_org_day := public.consume_rate_limit('compass-workspace-day:' || p_org_id, (l->>'workspace_per_day')::integer, 86400);
  IF NOT (v_org_day->>'allowed')::boolean THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'workspace_day', 'limits', l);
  END IF;
  IF v_month + 1 >= v_warn * (l->>'workspace_per_month')::integer THEN v_near := 'workspace_month';
  ELSIF (v_org_day->>'count')::integer >= v_warn * (l->>'workspace_per_day')::integer THEN v_near := 'workspace_day';
  ELSIF (v_day->>'count')::integer >= v_warn * (l->>'person_per_day')::integer THEN v_near := 'person_day';
  END IF;
  RETURN jsonb_build_object('allowed', true, 'near', v_near, 'limits', l,
    'used', jsonb_build_object('person_day', (v_day->>'count')::integer, 'workspace_day', (v_org_day->>'count')::integer, 'workspace_month', v_month + 1));
END;
$$;

/** The person shares one of their conversations with the team, for 7 days at most. */
CREATE OR REPLACE FUNCTION public.compass_share(p_conversation_id uuid, p_days integer DEFAULT 7, p_help_request_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.compass_conversations%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM public.compass_conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR NOT public.compass_is_mine(c.org_id, c.user_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.compass_shares SET revoked_at = now()
  WHERE conversation_id = c.id AND revoked_at IS NULL AND expires_at > now();
  INSERT INTO public.compass_shares (org_id, conversation_id, shared_by, help_request_id, expires_at)
  VALUES (c.org_id, c.id, auth.uid(), p_help_request_id, now() + make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 7)))
  RETURNING id INTO v_id;
  PERFORM public.ws_log(c.org_id, 'compass.conversation_shared', 'compass_shares', v_id::text,
    jsonb_build_object('days', LEAST(GREATEST(COALESCE(p_days, 7), 1), 7), 'help_request_id', p_help_request_id), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_unshare(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.compass_conversations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.compass_conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR NOT public.compass_is_mine(c.org_id, c.user_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.compass_shares SET revoked_at = now()
  WHERE conversation_id = c.id AND revoked_at IS NULL;
  PERFORM public.ws_log(c.org_id, 'compass.conversation_unshared', 'compass_conversations', c.id::text, '{}'::jsonb, auth.uid());
END;
$$;

/**
 * The only way anyone but the author reads a conversation: staff of that
 * workspace, through an active share. Every read is logged.
 */
CREATE OR REPLACE FUNCTION public.compass_shared_conversation(p_share_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.compass_shares%ROWTYPE;
  c public.compass_conversations%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.compass_shares WHERE id = p_share_id;
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.expires_at <= now() OR NOT public.ws_is_staff(s.org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.compass_conversations WHERE id = s.conversation_id;
  UPDATE public.compass_shares SET last_viewed_at = now(), view_count = view_count + 1 WHERE id = s.id;
  PERFORM public.ws_log(s.org_id, 'compass.shared_conversation_viewed', 'compass_shares', s.id::text,
    jsonb_build_object('conversation_id', s.conversation_id), auth.uid());
  RETURN jsonb_build_object(
    'title', c.title,
    'shared_at', s.created_at,
    'expires_at', s.expires_at,
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', m.role, 'parts', m.parts, 'at', m.created_at) ORDER BY m.seq)
      FROM public.compass_messages m WHERE m.conversation_id = c.id
    ), '[]'::jsonb)
  );
END;
$$;

/** Shares the team may open: active ones, in workspaces the person is staff of. No text. */
CREATE OR REPLACE FUNCTION public.compass_shared_list()
RETURNS TABLE (share_id uuid, org_id uuid, org_name text, shared_at timestamptz, expires_at timestamptz, help_request_id uuid, view_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.org_id, o.name, s.created_at, s.expires_at, s.help_request_id, s.view_count
  FROM public.compass_shares s
  JOIN public.organizations o ON o.id = s.org_id
  WHERE s.revoked_at IS NULL AND s.expires_at > now()
    AND s.org_id IN (SELECT public.user_staff_org_ids())
  ORDER BY s.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.compass_settings_save(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  UPDATE public.compass_platform_settings SET
    person_per_minute = COALESCE((p_patch->>'person_per_minute')::integer, person_per_minute),
    person_per_day = COALESCE((p_patch->>'person_per_day')::integer, person_per_day),
    workspace_per_day = COALESCE((p_patch->>'workspace_per_day')::integer, workspace_per_day),
    workspace_per_month = COALESCE((p_patch->>'workspace_per_month')::integer, workspace_per_month),
    max_question_chars = COALESCE((p_patch->>'max_question_chars')::integer, max_question_chars),
    max_turns = COALESCE((p_patch->>'max_turns')::integer, max_turns),
    warn_at_percent = COALESCE((p_patch->>'warn_at_percent')::integer, warn_at_percent),
    drafts_per_person_per_day = COALESCE((p_patch->>'drafts_per_person_per_day')::integer, drafts_per_person_per_day),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id;
  PERFORM public.ws_log(NULL, 'compass.limits_changed', 'compass_platform_settings', 'platform',
    jsonb_build_object('keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_patch) k)), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_workspace_limits_save(p_org_id uuid, p_per_day integer, p_per_month integer, p_person_per_day integer, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  INSERT INTO public.compass_workspace_limits (org_id, workspace_per_day, workspace_per_month, person_per_day, note, updated_by, updated_at)
  VALUES (p_org_id, p_per_day, p_per_month, p_person_per_day, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300), auth.uid(), now())
  ON CONFLICT (org_id) DO UPDATE SET workspace_per_day = EXCLUDED.workspace_per_day, workspace_per_month = EXCLUDED.workspace_per_month,
    person_per_day = EXCLUDED.person_per_day, note = EXCLUDED.note, updated_by = auth.uid(), updated_at = now();
  PERFORM public.ws_log(p_org_id, 'compass.workspace_limits_changed', 'compass_workspace_limits', p_org_id::text,
    jsonb_build_object('per_day', p_per_day, 'per_month', p_per_month, 'person_per_day', p_person_per_day), auth.uid());
END;
$$;

/** Usage this month for a workspace: Owners see their own; staff see theirs. Counts only. */
CREATE OR REPLACE FUNCTION public.compass_workspace_usage(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l jsonb;
BEGIN
  IF COALESCE(public.ws_access(p_org_id), '') NOT IN ('owner', 'service_team', 'platform_admin') THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  l := public.compass_effective_limits(p_org_id);
  RETURN jsonb_build_object(
    'limits', l,
    'today', (SELECT count(*) FROM public.compass_usage u WHERE u.org_id = p_org_id AND u.created_at >= date_trunc('day', now()) AND u.outcome NOT IN ('limited', 'unavailable')),
    'month', (SELECT count(*) FROM public.compass_usage u WHERE u.org_id = p_org_id AND u.created_at >= date_trunc('month', now()) AND u.outcome NOT IN ('limited', 'unavailable')),
    'people_month', (SELECT count(DISTINCT u.user_id) FROM public.compass_usage u WHERE u.org_id = p_org_id AND u.created_at >= date_trunc('month', now()))
  );
END;
$$;

/**
 * Platform view: questions, speed, errors, "I do not have that", and ratings
 * per workspace for a period. Never any text.
 */
CREATE OR REPLACE FUNCTION public.compass_platform_usage(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  org_id uuid, org_name text, questions bigint, people bigint, avg_ms numeric, median_first_ms double precision,
  errors bigint, no_data bigint, unverified bigint, limited bigint, up bigint, down bigint, cost_micros numeric,
  input_tokens bigint, output_tokens bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  RETURN QUERY
    SELECT o.id, o.name,
      count(u.id) FILTER (WHERE u.outcome NOT IN ('limited', 'unavailable')),
      count(DISTINCT u.user_id),
      round(avg(u.duration_ms))::numeric,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY u.first_output_ms),
      count(u.id) FILTER (WHERE u.outcome = 'error'),
      count(u.id) FILTER (WHERE u.outcome = 'no_data'),
      count(u.id) FILTER (WHERE u.outcome = 'unverified'),
      count(u.id) FILTER (WHERE u.outcome = 'limited'),
      (SELECT count(*) FROM public.compass_feedback f WHERE f.org_id = o.id AND f.rating = 'up' AND f.created_at >= p_from AND f.created_at < p_to),
      (SELECT count(*) FROM public.compass_feedback f WHERE f.org_id = o.id AND f.rating = 'down' AND f.created_at >= p_from AND f.created_at < p_to),
      COALESCE(sum(u.cost_micros), 0)::numeric,
      COALESCE(sum(u.input_tokens), 0)::bigint,
      COALESCE(sum(u.output_tokens), 0)::bigint
    FROM public.compass_usage u
    JOIN public.organizations o ON o.id = u.org_id
    WHERE u.created_at >= p_from AND u.created_at < p_to
    GROUP BY o.id, o.name
    ORDER BY count(u.id) DESC;
END;
$$;

/** Answers worth a look: failures, unverified answers and thumbs down. No text, ever. */
CREATE OR REPLACE FUNCTION public.compass_quality_review(p_limit integer DEFAULT 100)
RETURNS TABLE (
  at timestamptz, org_id uuid, org_name text, outcome text, route text, model text, lookup_names text[],
  duration_ms integer, rating text, reason text, error_code text, staff boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  RETURN QUERY
    SELECT u.created_at, u.org_id, o.name, u.outcome, u.route, u.model, u.lookup_names, u.duration_ms, f.rating, f.reason, u.error_code, u.staff
    FROM public.compass_usage u
    JOIN public.organizations o ON o.id = u.org_id
    LEFT JOIN public.compass_feedback f ON f.user_id = u.user_id AND f.message_id = u.message_id
    WHERE u.outcome IN ('error', 'unverified') OR f.rating = 'down'
    ORDER BY u.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.help_article_save(
  p_slug text, p_topic text, p_question text, p_body text, p_link_label text, p_link_href text, p_sort integer, p_published boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.staff_require_admin();
  INSERT INTO public.help_articles (slug, topic, question, body, link_label, link_href, sort, published, updated_by, updated_at)
  VALUES (p_slug, p_topic, btrim(p_question), btrim(p_body), NULLIF(btrim(COALESCE(p_link_label, '')), ''), NULLIF(btrim(COALESCE(p_link_href, '')), ''),
    COALESCE(p_sort, 100), COALESCE(p_published, true), auth.uid(), now())
  ON CONFLICT (slug) DO UPDATE SET topic = EXCLUDED.topic, question = EXCLUDED.question, body = EXCLUDED.body,
    link_label = EXCLUDED.link_label, link_href = EXCLUDED.link_href, sort = EXCLUDED.sort, published = EXCLUDED.published,
    updated_by = auth.uid(), updated_at = now()
  RETURNING id INTO v_id;
  PERFORM public.ws_log(NULL, 'help.article_saved', 'help_articles', p_slug, jsonb_build_object('published', p_published), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.help_article_delete(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.staff_require_admin();
  DELETE FROM public.help_articles WHERE slug = p_slug;
  PERFORM public.ws_log(NULL, 'help.article_deleted', 'help_articles', p_slug, '{}'::jsonb, auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lookups. Each runs as the person asking: invoker functions read through
-- row-level security, and definer functions check access first. Operators
-- are narrowed further, to the leads assigned to them.
-- ---------------------------------------------------------------------------

/** Operators: only leads assigned to them. Everyone else: whatever they may see. */
CREATE OR REPLACE FUNCTION public.compass_lead_allowed(p_org_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.ws_access(p_org_id) IS NULL THEN false
    WHEN NOT public.ws_lead_visible(p_org_id, p_lead_id) THEN false
    WHEN public.ws_access(p_org_id) = 'operator' THEN EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = p_lead_id AND l.org_id = p_org_id
        AND public.user_member_id(p_org_id) IN (l.assigned_setter_id, l.assigned_closer_id)
    )
    ELSE true
  END;
$$;

/**
 * Find and filter leads. Filters: name, stage, band, source, person ("me" or
 * a member id, owners and staff only), response (on_time, at_risk, missed),
 * quiet_days, arrived_from, arrived_to, open_only, field and field_value.
 * Returns at most 25 rows and the total that matched. No emails or phones.
 */
CREATE OR REPLACE FUNCTION public.compass_find_leads(p_org_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  f jsonb := COALESCE(p_filters, '{}'::jsonb);
  v_access text := public.ws_access(p_org_id);
  v_me uuid := public.user_member_id(p_org_id);
  v_person text := NULLIF(f->>'person', '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
  v_rows jsonb;
  v_total integer;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  -- Operators always see their own; nobody else picks a person unless they may see people.
  IF v_access = 'operator' THEN
    v_person := v_me::text;
  ELSIF v_person = 'me' THEN
    v_person := v_me::text;
  ELSIF v_person IS NOT NULL AND NOT public.portal_can_see_people(p_org_id) THEN
    v_person := NULL;
  END IF;

  WITH scope AS (
    SELECT l.id, l.first_name, l.last_name, l.status::text AS status, l.source, l.opted_in_at, l.first_human_touch_at,
      l.last_touch_at, l.do_not_contact, l.assigned_setter_id, l.assigned_closer_id, l.current_score,
      cf.band, cf.score, cf.next_step, cf.status AS case_status,
      (SELECT c.state FROM public.sentry_clocks c
        WHERE c.org_id = l.org_id AND c.lead_id = l.id AND c.resolved_at IS NULL AND c.state IN ('on_time', 'at_risk', 'missed')
        ORDER BY CASE c.state WHEN 'missed' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END LIMIT 1) AS response_state,
      EXISTS (SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = l.id AND m.reactivated_at IS NULL) AS historic
    FROM public.leads l
    LEFT JOIN public.case_files cf ON cf.org_id = l.org_id AND cf.lead_id = l.id
    WHERE l.org_id = p_org_id
      AND NOT l.is_test
      AND l.merged_into IS NULL
      AND (v_person IS NULL
        OR (v_person = 'unassigned' AND v_access <> 'operator' AND l.assigned_setter_id IS NULL AND l.assigned_closer_id IS NULL)
        OR l.assigned_setter_id::text = v_person OR l.assigned_closer_id::text = v_person)
      AND (NULLIF(f->>'name', '') IS NULL
        OR (COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')) ILIKE '%' || replace(replace(f->>'name', '%', ''), '_', '') || '%')
      AND (NULLIF(f->>'stage', '') IS NULL OR l.status::text = f->>'stage')
      AND (NULLIF(f->>'source', '') IS NULL OR public.portal_source_key(l.source) = lower(btrim(f->>'source')))
      AND (NULLIF(f->>'band', '') IS NULL OR lower(COALESCE(cf.band, '')) = lower(f->>'band'))
      AND (COALESCE((f->>'open_only')::boolean, true) = false OR l.status::text = ANY (public.portal_open_statuses()))
      AND (NULLIF(f->>'arrived_from', '') IS NULL OR l.opted_in_at >= (f->>'arrived_from')::timestamptz)
      AND (NULLIF(f->>'arrived_to', '') IS NULL OR l.opted_in_at < (f->>'arrived_to')::timestamptz)
      AND (NULLIF(f->>'quiet_days', '') IS NULL
        OR COALESCE(l.last_touch_at, l.opted_in_at) < now() - make_interval(days => (f->>'quiet_days')::integer))
      AND (NULLIF(f->>'field', '') IS NULL OR EXISTS (
        SELECT 1 FROM public.case_file_fields cff
        WHERE cff.org_id = l.org_id AND cff.lead_id = l.id AND cff.field_key = f->>'field' AND cff.state = 'present'
          AND (NULLIF(f->>'field_value', '') IS NULL OR lower(btrim(cff.value #>> '{}')) = lower(btrim(f->>'field_value')))
      ))
  ),
  filtered AS (
    SELECT * FROM scope s
    WHERE NULLIF(f->>'response', '') IS NULL OR s.response_state = f->>'response'
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id,
        'name', NULLIF(btrim(COALESCE(x.first_name, '') || ' ' || COALESCE(x.last_name, '')), ''),
        'stage', x.status,
        'band', x.band,
        'score', COALESCE(x.score, x.current_score),
        'source', x.source,
        'arrived_at', x.opted_in_at,
        'first_human_touch_at', x.first_human_touch_at,
        'last_touch_at', x.last_touch_at,
        'response', x.response_state,
        'do_not_contact', x.do_not_contact,
        'historic', x.historic,
        'next_step', left(x.next_step, 200),
        'assigned_to_me', v_me IN (x.assigned_setter_id, x.assigned_closer_id)
      ) ORDER BY
        CASE x.response_state WHEN 'missed' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END,
        COALESCE(x.score, x.current_score, 0) DESC,
        x.last_touch_at ASC NULLS FIRST)
      FROM (SELECT * FROM filtered ORDER BY
        CASE response_state WHEN 'missed' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END,
        COALESCE(score, current_score, 0) DESC, last_touch_at ASC NULLS FIRST LIMIT v_limit) x
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'operator_scope', v_access = 'operator');
END;
$$;

/**
 * One lead's case file: the fields Scribe keeps, objections, recent activity
 * (who, when and how, never message text), response state and next action.
 * Quotes and objection wording only for people who may read transcripts.
 */
CREATE OR REPLACE FUNCTION public.compass_case_file(p_org_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  l record;
  cf record;
  v_quotes boolean := public.ws_can_see_transcripts(p_org_id);
BEGIN
  IF NOT public.compass_lead_allowed(p_org_id, p_lead_id) THEN
    RETURN NULL;
  END IF;
  SELECT x.id, x.first_name, x.last_name, x.status::text AS status, x.source, x.opted_in_at, x.first_human_touch_at, x.last_touch_at,
    x.do_not_contact, x.offer_name, x.is_test, x.merged_into
  INTO l
  FROM public.leads x WHERE x.org_id = p_org_id AND x.id = p_lead_id;
  IF l.id IS NULL OR l.is_test OR l.merged_into IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT c.id, c.status, c.summary, c.next_step, c.readiness_reason, c.score, c.band, c.band_meaning, c.open_questions, c.built_at, c.depth
  INTO cf
  FROM public.case_files c WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', l.id,
      'name', NULLIF(btrim(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''),
      'stage', l.status, 'source', l.source, 'offer', l.offer_name,
      'arrived_at', l.opted_in_at, 'first_human_touch_at', l.first_human_touch_at, 'last_touch_at', l.last_touch_at,
      'do_not_contact', l.do_not_contact,
      'historic', EXISTS (SELECT 1 FROM public.lead_import_marks m WHERE m.lead_id = l.id AND m.reactivated_at IS NULL)
    ),
    'case_file', CASE WHEN cf.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', cf.status, 'depth', cf.depth, 'summary', left(cf.summary, 1500), 'next_step', left(cf.next_step, 400),
      'readiness_reason', left(cf.readiness_reason, 600), 'score', cf.score, 'band', cf.band, 'band_meaning', cf.band_meaning,
      'open_questions', cf.open_questions, 'built_at', cf.built_at
    ) END,
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', ff.field_key, 'label', ff.label, 'state', ff.state,
        'value', CASE WHEN jsonb_typeof(ff.value) = 'string' THEN to_jsonb(left(ff.value #>> '{}', 300)) ELSE ff.value END,
        'quote', CASE WHEN v_quotes THEN left(ff.quote, 200) ELSE NULL END
      ) ORDER BY ff.field_key)
      FROM public.case_file_fields ff WHERE ff.org_id = p_org_id AND ff.lead_id = p_lead_id AND ff.state <> 'absent'
    ), '[]'::jsonb),
    'objections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', o.type::text, 'resolved', o.resolved, 'at', o.created_at,
        'words', CASE WHEN v_quotes THEN left(o.verbatim, 200) ELSE NULL END
      ) ORDER BY o.created_at DESC)
      FROM (SELECT * FROM public.objections WHERE org_id = p_org_id AND lead_id = p_lead_id ORDER BY created_at DESC LIMIT 10) o
    ), '[]'::jsonb),
    'activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', t.type::text, 'channel', t.channel::text, 'direction', t.direction::text, 'at', t.occurred_at) ORDER BY t.occurred_at DESC)
      FROM (SELECT * FROM public.touches WHERE org_id = p_org_id AND lead_id = p_lead_id ORDER BY occurred_at DESC LIMIT 10) t
    ), '[]'::jsonb),
    'response', (
      SELECT jsonb_build_object('kind', c.kind, 'state', c.state, 'deadline_at', c.deadline_at, 'overdue_minutes', c.overdue_minutes)
      FROM public.sentry_clocks c
      WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id AND c.resolved_at IS NULL
      ORDER BY c.started_at DESC LIMIT 1
    ),
    'next_action', (
      SELECT jsonb_build_object('text', left(n.action_text, 240), 'due_at', n.due_at)
      FROM public.next_actions n
      WHERE n.org_id = p_org_id AND n.lead_id = p_lead_id AND n.completed_at IS NULL
      ORDER BY n.due_at NULLS LAST, n.created_at DESC LIMIT 1
    ),
    'calls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'at', COALESCE(k.occurred_at, k.scheduled_at), 'has_transcript', k.raw_transcript IS NOT NULL AND k.raw_transcript <> '') ORDER BY COALESCE(k.occurred_at, k.scheduled_at) DESC)
      FROM (SELECT id, occurred_at, scheduled_at, raw_transcript FROM public.calls WHERE org_id = p_org_id AND lead_id = p_lead_id
            ORDER BY COALESCE(occurred_at, scheduled_at) DESC NULLS LAST LIMIT 5) k
    ), '[]'::jsonb),
    'transcripts_allowed', v_quotes
  );
END;
$$;

/** Transcript text for one lead, for one specific question, only when allowed. */
CREATE OR REPLACE FUNCTION public.compass_lead_transcript(p_org_id uuid, p_lead_id uuid, p_max_chars integer DEFAULT 6000)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget integer := LEAST(GREATEST(COALESCE(p_max_chars, 6000), 500), 12000);
  v_out jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF NOT public.compass_lead_allowed(p_org_id, p_lead_id) OR NOT public.ws_can_see_transcripts(p_org_id) THEN
    RETURN jsonb_build_object('allowed', false, 'calls', '[]'::jsonb);
  END IF;
  FOR r IN
    SELECT c.id, COALESCE(c.occurred_at, c.scheduled_at) AS at, c.raw_transcript
    FROM public.calls c
    WHERE c.org_id = p_org_id AND c.lead_id = p_lead_id AND c.raw_transcript IS NOT NULL AND c.raw_transcript <> ''
    ORDER BY COALESCE(c.occurred_at, c.scheduled_at) DESC NULLS LAST
    LIMIT 3
  LOOP
    EXIT WHEN v_budget <= 0;
    v_out := v_out || jsonb_build_array(jsonb_build_object('call_id', r.id, 'at', r.at, 'text', left(r.raw_transcript, v_budget),
      'truncated', char_length(r.raw_transcript) > v_budget));
    v_budget := v_budget - char_length(left(r.raw_transcript, v_budget));
  END LOOP;
  RETURN jsonb_build_object('allowed', true, 'calls', v_out);
END;
$$;

-- Operators get their own numbers from the same metric definitions as Home and
-- Results. Results itself stays closed to them; only these wrappers open the
-- metric layer, and only for the leads assigned to the Operator asking.
CREATE OR REPLACE FUNCTION public.portal_assert_results(p_org_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('vistrial.compass_self_scope', true) = auth.uid()::text
     AND auth.uid() IS NOT NULL
     AND public.ws_access(p_org_id) = 'operator'
     AND COALESCE(p_filters->>'person', '') = COALESCE(public.user_member_id(p_org_id)::text, '-') THEN
    RETURN;
  END IF;
  IF NOT public.portal_can_see_results(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_filters->>'person', '') IS NOT NULL AND NOT public.portal_can_see_people(p_org_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_scope_filters(p_org_id uuid, p_filters jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF v_access = 'operator' THEN
    PERFORM set_config('vistrial.compass_self_scope', auth.uid()::text, true);
    RETURN (COALESCE(p_filters, '{}'::jsonb) - 'person') || jsonb_build_object('person', public.user_member_id(p_org_id)::text);
  END IF;
  RETURN COALESCE(p_filters, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_metric_summary(
  p_org_id uuid, p_metrics text[], p_from timestamptz, p_to timestamptz,
  p_prev_from timestamptz DEFAULT NULL, p_prev_to timestamptz DEFAULT NULL, p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filters jsonb := public.compass_scope_filters(p_org_id, p_filters);
  v_out jsonb;
BEGIN
  v_out := public.portal_metric_summary(p_org_id, p_metrics, p_from, p_to, p_prev_from, p_prev_to, v_filters);
  PERFORM set_config('vistrial.compass_self_scope', '', true);
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_metric_breakdown(
  p_org_id uuid, p_metric text, p_from timestamptz, p_to timestamptz, p_filters jsonb, p_dimension text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filters jsonb := public.compass_scope_filters(p_org_id, p_filters);
  v_out jsonb;
BEGIN
  IF public.ws_access(p_org_id) = 'operator' AND p_dimension = 'person' THEN
    PERFORM set_config('vistrial.compass_self_scope', '', true);
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_out
  FROM public.portal_metric_breakdown(p_org_id, p_metric, p_from, p_to, v_filters, p_dimension) b;
  PERFORM set_config('vistrial.compass_self_scope', '', true);
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_metric_leads(
  p_org_id uuid, p_metric text, p_from timestamptz, p_to timestamptz, p_filters jsonb, p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filters jsonb := public.compass_scope_filters(p_org_id, p_filters);
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_out
  FROM public.portal_metric_leads(p_org_id, p_metric, p_from, p_to, v_filters, LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25), 0) r;
  PERFORM set_config('vistrial.compass_self_scope', '', true);
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Suggested actions. Each one checks the person again, is recorded with
-- Compass as the suggester and the person as the one who confirmed, and goes
-- through the existing flow (Relay's approval gate, next actions).
-- ---------------------------------------------------------------------------

/** Who may ask Relay for a draft from Compass. */
CREATE OR REPLACE FUNCTION public.compass_may_request_draft(p_org_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.compass_lead_allowed(p_org_id, p_lead_id)
    AND CASE public.ws_access(p_org_id)
      WHEN 'owner' THEN true
      WHEN 'platform_admin' THEN true
      WHEN 'service_team' THEN true
      WHEN 'operator' THEN true
      WHEN 'member' THEN public.portal_member_flag(p_org_id, 'approve')
      ELSE false
    END, false);
$$;

CREATE OR REPLACE FUNCTION public.compass_request_draft(p_org_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today integer;
  v_cap integer := (public.compass_effective_limits(p_org_id)->>'drafts_per_person_per_day')::integer;
  v_id uuid;
  v_status text;
  l record;
BEGIN
  IF v_uid IS NULL OR NOT public.compass_may_request_draft(p_org_id, p_lead_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IN (SELECT public.closed_org_ids()) THEN
    RAISE EXCEPTION 'This workspace is closed.' USING ERRCODE = '42501';
  END IF;
  SELECT x.status::text AS status, x.do_not_contact, x.is_test, x.merged_into INTO l FROM public.leads x WHERE x.org_id = p_org_id AND x.id = p_lead_id;
  IF l.is_test OR l.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF l.do_not_contact THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'This lead is marked do-not-contact, so Relay will not draft for them.');
  END IF;
  IF l.status IN ('closed_won', 'closed_lost') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'This lead is closed, so Relay will not draft for them.');
  END IF;
  SELECT count(*) INTO v_today FROM public.relay_jobs
  WHERE org_id = p_org_id AND requested_by_user = v_uid AND created_at >= date_trunc('day', now());
  IF v_today >= v_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', format('You can ask Relay for up to %s drafts a day from Compass. Try again tomorrow.', v_cap));
  END IF;
  INSERT INTO public.relay_jobs (org_id, lead_id, trigger, dedupe_key, requested_by_user, requested_by_member, requested_by_label)
  VALUES (p_org_id, p_lead_id, 'compass_request', 'compass:' || p_lead_id || ':' || v_uid || ':' || to_char(now(), 'YYYY-MM-DD'),
    v_uid, public.user_member_id(p_org_id), public.onboarding_actor_label(p_org_id))
  ON CONFLICT (org_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'You already asked Relay for a draft for this lead today.');
  END IF;
  PERFORM public.ws_log(p_org_id, 'compass.draft_requested', 'relay_jobs', v_id::text,
    jsonb_build_object('lead_id', p_lead_id, 'suggested_by', 'compass'), v_uid);
  RETURN jsonb_build_object('ok', true, 'job_id', v_id);
END;
$$;

/** A follow-up for the person themselves on a lead. Not for Members. */
CREATE OR REPLACE FUNCTION public.compass_create_next_action(p_org_id uuid, p_lead_id uuid, p_text text, p_due_at timestamptz DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access text := public.ws_access(p_org_id);
  v_text text := left(btrim(COALESCE(p_text, '')), 240);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_access IS NULL OR v_access = 'member'
     OR NOT public.compass_lead_allowed(p_org_id, p_lead_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IN (SELECT public.closed_org_ids()) THEN
    RAISE EXCEPTION 'This workspace is closed.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_text) < 3 THEN
    RAISE EXCEPTION 'Write the follow-up first.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.next_actions (org_id, lead_id, action_text, owner_member_id, due_at, created_by)
  VALUES (p_org_id, p_lead_id, v_text, public.user_member_id(p_org_id), p_due_at, 'user')
  RETURNING id INTO v_id;
  PERFORM public.ws_log(p_org_id, 'compass.next_action_created', 'next_actions', v_id::text,
    jsonb_build_object('lead_id', p_lead_id, 'suggested_by', 'compass'), auth.uid());
  RETURN v_id;
END;
$$;

/** The activity record for Compass suggestions the person confirmed or dismissed. */
CREATE OR REPLACE FUNCTION public.compass_record_action(p_org_id uuid, p_action text, p_lead_id uuid DEFAULT NULL, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.ws_access(p_org_id) IS NULL THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('suggestion_confirmed', 'suggestion_dismissed', 'scribe_refresh_requested', 'question_pinned', 'opened_list', 'opened_case_file') THEN
    RAISE EXCEPTION 'Unknown action.' USING ERRCODE = '22023';
  END IF;
  IF p_lead_id IS NOT NULL AND NOT public.compass_lead_allowed(p_org_id, p_lead_id) THEN
    RAISE EXCEPTION 'Not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ws_log(p_org_id, 'compass.' || p_action, 'compass', COALESCE(p_lead_id::text, 'workspace'),
    COALESCE(p_detail, '{}'::jsonb) || jsonb_build_object('lead_id', p_lead_id, 'suggested_by', 'compass'), auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Retention: conversations follow the workspace's transcript retention.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compass_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversations integer;
  v_shares integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.compass_conversations c
    USING public.organizations o
    WHERE o.id = c.org_id
      AND COALESCE(c.last_message_at, c.created_at) < now() - make_interval(days => COALESCE(o.transcript_retention_days, 90))
    RETURNING c.id
  )
  SELECT count(*) INTO v_conversations FROM gone;
  WITH gone AS (
    DELETE FROM public.compass_shares WHERE expires_at < now() - interval '90 days' RETURNING id
  )
  SELECT count(*) INTO v_shares FROM gone;
  RETURN jsonb_build_object('conversations', v_conversations, 'shares', v_shares);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5d. Starter help articles, for the Help area and Compass. Platform Admins
-- edit them from the team workspace. Plain language; product questions are
-- answered only from these, never from general knowledge.
-- ---------------------------------------------------------------------------

INSERT INTO public.help_articles (slug, topic, question, body, link_label, link_href, sort) VALUES
('does-vistrial-message-leads', 'leads', 'Does Vistrial message my leads?',
 E'No. Vistrial watches your leads and drafts follow-ups, and a person on your team approves each one.\n\nApproved messages go out the way you already send them. Vistrial never writes to your CRM.',
 NULL, NULL, 10),
('not-enough-data', 'results', 'Why does a number say there is not enough data yet?',
 E'Rates and averages based on a handful of leads swing a lot, so Vistrial says so instead of showing a figure you might act on.\n\nWhen fewer than 10 leads are behind a rate, it is labelled as a small sample. Each card explains how it is counted; open it to see the leads behind it.',
 'Open Results', '/app/results', 20),
('revenue-missing', 'results', 'Why is revenue or cost per booked call missing?',
 E'Those appear only once payments or ad spend are connected. Vistrial does not show a zero for something it cannot see.',
 'See connections', '/app/settings/connections', 30),
('crm-reconnect', 'connections', 'The CRM connection says it needs reconnecting.',
 E'Your CRM stopped accepting Vistrial''s access, usually after a password change or a removed app. New leads are not arriving until it is fixed.\n\nReconnect it from Connections. Nothing that was already in Vistrial is lost.',
 'Open Connections', '/app/settings/connections', 40),
('who-sees-what', 'team', 'What can each person see?',
 E'Owners see everything, including billing. Members see results and leads; an Owner can let a Member see money, export, or read call transcripts.\n\nSetters and closers (Operators) see the leads assigned to them and log what happened on each call.',
 'Open People', '/app/settings/members', 50),
('alert-emails', 'team', 'Why did I not get an email about every alert?',
 E'At most 8 alerts reach you in an hour, and anything that can wait is held outside your working hours. Every alert still appears on your Notifications page.',
 'Notification settings', '/app/settings/notifications', 60),
('setup-left', 'onboarding', 'What is left before we go live?',
 E'The setup page shows each step, who it is waiting on, and what to do next.',
 'See setup progress', '/app/onboarding', 70),
('data-copy-delete', 'privacy', 'Can we get a copy of our data, or have it deleted?',
 E'Yes. An Owner can ask from Privacy. Your team handles it and replies by email.',
 'Open Privacy', '/app/settings/privacy', 80),
('what-agents-do', 'agents', 'What does each agent do?',
 E'Scribe builds and updates each lead''s case file from your calls: a summary, the facts that matter to your business, objections, readiness, and a suggested next step.\n\nSentry watches response times. It starts a clock when a lead arrives or needs a follow-up and alerts your team before the window closes.\n\nRelay drafts follow-ups. Every draft waits for a person to approve it, and nothing is sent by Vistrial.\n\nCompass answers questions about your own workspace and shows where each answer came from.',
 'Open Agents', '/app/agents', 90),
('what-is-compass', 'agents', 'What can Compass do, and what can it not do?',
 E'Compass answers questions about your leads, response times, results, objections, and what your agents did, using only what Vistrial has recorded and only what you are allowed to see. Every answer shows its sources.\n\nIt can suggest an action, such as asking Relay for a draft or adding a follow-up for yourself, and nothing happens until you confirm. It cannot send messages, approve drafts, change leads or settings, or write to your CRM.\n\nYour conversations with Compass are private to you.',
 'Open Compass', '/app/compass', 100),
('compass-privacy', 'privacy', 'Who can read my Compass conversations?',
 E'Only you. Owners cannot read other people''s conversations, and the Vistrial team cannot read yours.\n\nIf you want help with an answer, you can share one conversation with the team for up to 7 days. Sharing is recorded, and you can stop it at any time. You can delete any conversation; it is removed straight away.',
 'Open Compass', '/app/compass', 110),
('response-window', 'results', 'What is the response window, and what does "reached in time" mean?',
 E'Your workspace sets how quickly a new lead should hear from a person, for example within 15 minutes during business hours. That is the response window.\n\nA lead counts as reached in time when the first human reply came inside the window. Leads that were replied to late, or not before the window closed, count as late.',
 'Open Results', '/app/results', 120),
('response-clocks', 'agents', 'What are response clocks?',
 E'When a lead arrives or a follow-up is due, Sentry starts a clock for it. The clock is on time while there is still time, at risk when the deadline is close, and missed when it passes without a reply from a person.\n\nAt-risk and missed clocks are what Sentry alerts your team about.',
 NULL, NULL, 130),
('readiness-bands', 'leads', 'What do Cold, Warm and Hot mean?',
 E'Each case file has a readiness score from what was said on calls. Your workspace sets the score each band starts at, for example Warm from 40 and Hot from 60.\n\nThe band is a guide for who to talk to first, not a promise that a lead will buy.',
 NULL, NULL, 140),
('how-approvals-work', 'agents', 'How do approvals work?',
 E'Relay''s drafts go to the approval queue. An Owner, or anyone your Owner made an approver, can approve a draft as written, edit it first, or reject it.\n\nRight before anything is sent, Vistrial checks again: consent, quiet hours, contact limits, do-not-contact, and who may approve. If anything changed, it stops and says why.',
 'Open approvals', '/app/home', 150),
('invite-people', 'team', 'How do I invite someone?',
 E'An Owner invites people from People in Settings. Choose their role: Owner, Member, or an Operator role such as setter or closer. They get an email with a link that works for seven days.',
 'Open People', '/app/settings/members', 160),
('follow-up-cadence', 'results', 'What does "follow-up kept on time" mean?',
 E'After a lead is first reached, your workspace sets how long a gap is acceptable before the next follow-up. Each time a follow-up comes due, it counts as kept when someone followed up before the gap ran out.',
 'Open Results', '/app/results', 170),
('imported-leads', 'leads', 'Why do some imported leads have only a basic case file?',
 E'Leads brought in from your CRM''s history start with a basic case file built from their CRM details. Full case files from Scribe are built for recent, open leads, at a pace your team sets.\n\nImported history never starts alerts, clocks, or drafts by itself.',
 NULL, NULL, 180)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Configuration registry (generated): Compass starter questions per template.
-- ---------------------------------------------------------------------------

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
  ('industry.compass_questions', 'industry', 'list', 'Compass starter questions', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"question","itemFields":[{"key":"question","type":"text","required":true,"maxLength":160},{"key":"audience","type":"choice","required":true,"options":["everyone","managers","operators"]}]}$cfg$::jsonb, 47),
  ('industry.objections', 'industry', 'list', 'Objection library', false, false, false, NULL, NULL, $cfg${"maxItems":200,"uniqueBy":"label","itemFields":[{"key":"label","type":"text","required":true,"maxLength":80},{"key":"category","type":"choice","required":true,"options":["price","timing","spouse_partner","trust","fit","competitor","other"]},{"key":"recognize","type":"long_text","maxLength":500},{"key":"guidance","type":"long_text","maxLength":1000}]}$cfg$::jsonb, 48),
  ('industry.lead_sources', 'industry', 'list', 'Lead sources', false, false, false, NULL, NULL, $cfg${"maxItems":30,"uniqueBy":"source","itemFields":[{"key":"source","type":"text","required":true,"maxLength":80},{"key":"priority","type":"choice","required":true,"options":["high","normal","low"]},{"key":"treatment","type":"text","maxLength":300}]}$cfg$::jsonb, 49),
  ('escalation.levels', 'escalation', 'list', 'Who hears about what', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":8,"itemFields":[{"key":"severity","type":"choice","required":true,"options":["info","warning","urgent","critical"]},{"key":"trigger","type":"text","required":true,"maxLength":200},{"key":"after_windows","type":"number","min":1,"max":20},{"key":"notify","type":"multi_choice","required":true,"options":["assignee","setters","closers","managers","service_team"]},{"key":"channels","type":"multi_choice","required":true,"options":["push","email","sms","team_channel","discord"]}]}$cfg$::jsonb, 50),
  ('escalation.quiet_hours', 'escalation', 'choice', 'Quiet hours for the team', false, false, false, NULL, NULL, $cfg${"options":["outside_business_hours","none"]}$cfg$::jsonb, 51),
  ('escalation.urgent_exception', 'escalation', 'choice', 'Break quiet hours for', false, false, false, NULL, NULL, $cfg${"options":["critical","urgent_and_critical","none"]}$cfg$::jsonb, 52),
  ('escalation.unacknowledged_minutes', 'escalation', 'duration', 'If no one acknowledges within', false, false, false, NULL, NULL, $cfg${"min":5,"max":1440,"integer":true}$cfg$::jsonb, 53),
  ('escalation.unacknowledged_next', 'escalation', 'choice', 'Then tell', false, false, false, NULL, NULL, $cfg${"options":["assignee","setters","closers","managers","service_team"]}$cfg$::jsonb, 54),
  ('approval.actions', 'approval', 'list', 'What needs approval', true, false, false, NULL, NULL, $cfg${"minItems":1,"maxItems":30,"uniqueBy":"action","itemFields":[{"key":"action","type":"choice","required":true,"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]},{"key":"mode","type":"choice","required":true,"options":["ask_first","auto_run","off"]},{"key":"approver","type":"choice","required":true,"options":["owners_and_managers","owner_only","assigned"]},{"key":"max_wait_minutes","type":"number","min":15,"max":10080},{"key":"auto_run_confirmed","type":"boolean"}]}$cfg$::jsonb, 55),
  ('approval.never_auto', 'approval', 'multi_choice', 'Always needs approval', false, false, true, 'superset_list', NULL, $cfg${"options":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","crm_stage_change","setter_nudge","owner_escalation","slack_post","discord_post","drive_store","send_text","send_email","create_asset"]}$cfg$::jsonb, 56),
  ('approval.timeout_minutes', 'approval', 'duration', 'Waiting too long after', false, false, false, NULL, NULL, $cfg${"min":15,"max":10080,"integer":true}$cfg$::jsonb, 57),
  ('approval.timeout_behavior', 'approval', 'choice', 'When no one approves in time', false, false, false, NULL, NULL, $cfg${"options":["nothing","escalate","proceed"]}$cfg$::jsonb, 58),
  ('approval.timeout_proceed_confirmed', 'approval', 'boolean', 'I understand waiting items will proceed without approval', false, false, false, NULL, NULL, $cfg${}$cfg$::jsonb, 59),
  ('integrations.crm', 'integrations', 'reference', 'CRM', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 60),
  ('integrations.messaging_numbers', 'integrations', 'list', 'Messaging numbers', false, false, false, NULL, NULL, $cfg${"maxItems":20,"uniqueBy":"number","itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"number","type":"text","required":true,"maxLength":20},{"key":"provider","type":"choice","required":true,"options":["crm","telnyx"]},{"key":"sender_name","type":"text","maxLength":60}]}$cfg$::jsonb, 61),
  ('integrations.calendar', 'integrations', 'reference', 'Calendar', false, false, false, NULL, NULL, $cfg${"referenceKinds":["integration"]}$cfg$::jsonb, 62),
  ('integrations.email_domain', 'integrations', 'text', 'Email sending domain', false, false, false, NULL, NULL, $cfg${"maxLength":120,"pattern":"^$|^([a-z0-9-]+\\.)+[a-z]{2,}$"}$cfg$::jsonb, 63),
  ('integrations.chat_channels', 'integrations', 'list', 'Chat channels', false, false, false, NULL, NULL, $cfg${"maxItems":10,"itemFields":[{"key":"label","type":"text","required":true,"maxLength":60},{"key":"kind","type":"choice","required":true,"options":["slack","discord","teams"]},{"key":"connection_id","type":"text","required":true,"maxLength":64}]}$cfg$::jsonb, 64),
  ('integrations.file_folder', 'integrations', 'text', 'File storage folder', false, false, false, NULL, NULL, $cfg${"minLength":1,"maxLength":120}$cfg$::jsonb, 65),
  ('sources.allowed', 'sources', 'multi_choice', 'Agents may read', true, false, false, NULL, NULL, $cfg${"options":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 66),
  ('sources.retention_days', 'sources', 'key_value', 'Keep for (days)', false, false, false, NULL, NULL, $cfg${"min":30,"max":3650,"valueType":"number","keys":["call_transcripts","email","text_messages","forms","crm_notes"]}$cfg$::jsonb, 67),
  ('sources.agent_run_history_days', 'sources', 'number', 'Keep agent run history for (days)', false, false, false, NULL, NULL, $cfg${"min":7,"max":730,"integer":true}$cfg$::jsonb, 68),
  ('sources.scribe_calls_per_hour', 'sources', 'number', 'Calls Scribe reads per hour', false, false, false, NULL, NULL, $cfg${"min":1,"max":1000,"integer":true}$cfg$::jsonb, 69),
  ('sources.excluded', 'sources', 'list', 'Never read', false, false, false, NULL, NULL, $cfg${"maxItems":10,"uniqueBy":"source","itemFields":[{"key":"source","type":"choice","required":true,"options":["call_transcripts","email","text_messages","forms","crm_notes"]},{"key":"reason","type":"text","required":true,"maxLength":200}]}$cfg$::jsonb, 70),
  ('sources.forsight_history_weeks', 'sources', 'number', 'Forsight shows (weeks)', false, false, false, NULL, NULL, $cfg${"min":4,"max":52,"integer":true}$cfg$::jsonb, 71),
  ('sources.forsight_quiet_days', 'sources', 'number', 'Forsight: going quiet after (days)', false, false, false, NULL, NULL, $cfg${"min":1,"max":60,"integer":true}$cfg$::jsonb, 72),
  ('sources.forsight_silent_days', 'sources', 'number', 'Forsight: silent after (days)', false, false, false, NULL, NULL, $cfg${"min":2,"max":120,"integer":true}$cfg$::jsonb, 73),
  ('sources.forsight_long_silent_days', 'sources', 'number', 'Forsight: long silent after (days)', false, false, false, NULL, NULL, $cfg${"min":3,"max":365,"integer":true}$cfg$::jsonb, 74),
  ('sources.stellar_stage_labels', 'sources', 'key_value', 'Stellar build stage names', false, false, false, NULL, NULL, $cfg${"valueType":"text","keys":["getting_set_up","building_system","testing","live","running_smoothly"]}$cfg$::jsonb, 75),
  ('operators.assignment_mode', 'operators', 'choice', 'How leads are assigned', true, false, false, NULL, NULL, $cfg${"options":["manual","round_robin","by_source","by_service"]}$cfg$::jsonb, 76),
  ('operators.extra_permissions', 'operators', 'multi_choice', 'Operators may also', false, false, false, NULL, NULL, $cfg${"options":["view_unassigned_details","reassign_own_leads"]}$cfg$::jsonb, 77),
  ('operators.summary_time', 'operators', 'choice', 'Daily summary', false, false, false, NULL, NULL, $cfg${"options":["start_of_day","end_of_day"]}$cfg$::jsonb, 78),
  ('operators.summary_confirmer', 'operators', 'choice', 'Summaries are confirmed by', false, false, false, NULL, NULL, $cfg${"options":["operator","owner","service_team"]}$cfg$::jsonb, 79),
  ('compliance.opt_out_words', 'compliance', 'list', 'Opt-out words', false, false, true, 'superset_list', NULL, $cfg${"maxItems":30,"itemMaxLength":30}$cfg$::jsonb, 80),
  ('compliance.quiet_hours', 'compliance', 'time_window', 'No messages between', true, false, true, 'wider_window', NULL, $cfg${}$cfg$::jsonb, 81),
  ('compliance.quiet_hours_basis', 'compliance', 'choice', 'Quiet hours follow', false, false, true, NULL, NULL, $cfg${"options":["lead_local","workspace"]}$cfg$::jsonb, 82),
  ('compliance.daily_cap_per_lead', 'compliance', 'number', 'Most messages per lead per day', true, false, true, 'lower_number', NULL, $cfg${"min":1,"max":20,"integer":true}$cfg$::jsonb, 83),
  ('compliance.cap_applies_to', 'compliance', 'choice', 'The daily limit covers', false, false, true, NULL, NULL, $cfg${"options":["every_send","auto_run_only"]}$cfg$::jsonb, 84),
  ('compliance.weekly_cap_per_lead', 'compliance', 'number', 'Most messages per lead per week', false, false, true, 'lower_number_zero_is_unlimited', NULL, $cfg${"min":0,"max":100,"integer":true}$cfg$::jsonb, 85),
  ('compliance.required_disclosures', 'compliance', 'list', 'Required disclosures', false, false, true, 'superset_list', NULL, $cfg${"maxItems":10,"itemMaxLength":300}$cfg$::jsonb, 86)
ON CONFLICT (key) DO UPDATE SET section = EXCLUDED.section, field_type = EXCLUDED.field_type, label = EXCLUDED.label, required = EXCLUDED.required, workspace_only = EXCLUDED.workspace_only, default_lock = EXCLUDED.default_lock, tighten = EXCLUDED.tighten, owner_editable = EXCLUDED.owner_editable, rules = EXCLUDED.rules, sort_order = EXCLUDED.sort_order;
CREATE OR REPLACE FUNCTION public.config_profile_labels() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$ SELECT $cfg${"signals":{"has_budget":"They can afford it","existing_revenue":"They already have revenue","urgent_timeline":"They want to start soon","sole_decision_maker":"They can decide alone","has_team":"They have a team behind them","clear_pain":"The problem is costing them now","tried_alternatives":"They have tried other things","right_industry":"They are in a market you serve","other":"Something else"},"disqualifiers":{"no_budget":"No budget at all","pre_revenue":"Pre-revenue","wrong_industry":"An industry you do not serve","needs_partner_approval":"Cannot decide without a partner","seeking_employment":"Looking for a job, not a service","out_of_geography":"Outside the places you work","competitor":"A competitor","other":"Something else"},"channels":{"meta_ads":"Facebook or Instagram ads","google_ads":"Google ads","youtube_ads":"YouTube ads","tiktok_ads":"TikTok ads","organic_social":"Organic social","email_list":"Your email list","referral":"Referrals","affiliate":"Affiliates or partners","webinar":"Webinars or masterclasses","cold_outbound":"Cold outbound","podcast":"Podcast","seo":"Search and content","events":"Live events","other":"Something else"},"offer_types":{"coaching":"Coaching","consulting":"Consulting","agency_service":"Agency service","course":"Course or programme","software":"Software","done_for_you":"Done-for-you delivery","other":"Something else"},"objection_types":{"price":"Price","timing":"Timing","spouse_partner":"Needs a partner's agreement","trust":"Trust","fit":"Fit","competitor":"Looking at someone else","other":"Something else"}}$cfg$::jsonb $fn$;
CREATE OR REPLACE FUNCTION public.config_legacy_banned_terms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$ SELECT ARRAY['I hope this message finds you well', 'I hope you''re doing well', 'I wanted to reach out', 'just circling back', 'circling back', 'touching base', 'following up on our conversation', 'as we discussed', 'leverage', 'utilize', 'synergy', 'streamline', 'robust', 'seamless', 'journey', 'solution']::text[] $fn$;
SELECT public.config_seed_platform($cfg${"identity.timezone":"America/New_York","identity.business_hours":{"days":{"mon":[{"start":"08:00","end":"18:00"}],"tue":[{"start":"08:00","end":"18:00"}],"wed":[{"start":"08:00","end":"18:00"}],"thu":[{"start":"08:00","end":"18:00"}],"fri":[{"start":"08:00","end":"18:00"}],"sat":[],"sun":[]},"closures":[]},"identity.owners_can_edit_hours":false,"qualification.not_ready_criteria":[],"qualification.disqualifiers":[],"qualification.scoring_bands":[{"name":"Cold","min_score":0,"meaning":"Interested, but not ready to decide.","next_step":"Keep in touch with useful, low-pressure follow-up."},{"name":"Warm","min_score":40,"meaning":"Engaged, with some of what they need in place.","next_step":"Fill the gaps: timing, budget, and who decides."},{"name":"Hot","min_score":60,"meaning":"Ready to buy now.","next_step":"Call today and book the next step."}],"qualification.ready_threshold":60,"qualification.factor_weights":{"timeline":35,"investment_capacity":30,"decision_authority":20,"pain_severity":15},"qualification.minimum_info":[],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":72},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"response.after_hours":"keep_running","response.after_hours_window_minutes":120,"response.counted_touch_types":["call","text","email"],"response.relay_counts_as_human_touch":true,"response.warning_threshold_percent":75,"response.ghost_days_soft":14,"response.ghost_days_hard":30,"response.max_sequence_length":3,"response.max_sequence_days":21,"response.draft_stale_days":5,"response.quiet_lead_hours":48,"response.untouched_window_days":3,"response.no_show_window_days":7,"tone.formality":"casual","tone.use_contractions":true,"tone.sender_identity":"","tone.greeting":"","tone.sign_off":"","tone.sms_max_chars":240,"tone.email_max_chars":900,"tone.emoji":"never","tone.punctuation_rules":"","tone.language":"en-US","tone.preferred_terms":[],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution"],"tone.examples":[],"industry.business_description":"a business that sells through conversations with its leads","industry.urgency_signals":[],"industry.compass_questions":[{"question":"Which hot leads have not been contacted in the last two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What are the most common objections this month?","audience":"managers"},{"question":"Which drafts are waiting for approval?","audience":"managers"},{"question":"What should I follow up on first today?","audience":"operators"},{"question":"Which of my leads are at risk of missing their response window?","audience":"operators"}],"industry.objections":[],"industry.lead_sources":[],"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]}],"escalation.quiet_hours":"outside_business_hours","escalation.urgent_exception":"critical","escalation.unacknowledged_minutes":60,"escalation.unacknowledged_next":"managers","approval.actions":[{"action":"first_reply","mode":"ask_first","approver":"owners_and_managers"},{"action":"quiet_lead_follow_up","mode":"ask_first","approver":"owners_and_managers"},{"action":"no_show_rebook","mode":"ask_first","approver":"owners_and_managers"},{"action":"client_report","mode":"ask_first","approver":"owners_and_managers"},{"action":"crm_stage_change","mode":"ask_first","approver":"owners_and_managers"},{"action":"setter_nudge","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"owner_escalation","mode":"auto_run","approver":"owners_and_managers","auto_run_confirmed":true},{"action":"slack_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"discord_post","mode":"ask_first","approver":"owners_and_managers"},{"action":"drive_store","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_text","mode":"ask_first","approver":"owners_and_managers"},{"action":"send_email","mode":"ask_first","approver":"owners_and_managers"},{"action":"create_asset","mode":"ask_first","approver":"owners_and_managers"}],"approval.never_auto":["first_reply","quiet_lead_follow_up","no_show_rebook","client_report","send_text","send_email"],"approval.timeout_minutes":240,"approval.timeout_behavior":"escalate","approval.timeout_proceed_confirmed":false,"integrations.crm":null,"integrations.messaging_numbers":[],"integrations.calendar":null,"integrations.email_domain":"","integrations.chat_channels":[],"integrations.file_folder":"Vistrial","sources.allowed":["call_transcripts","email","text_messages","forms","crm_notes"],"sources.retention_days":{"call_transcripts":365,"email":365,"text_messages":365,"forms":365,"crm_notes":365},"sources.agent_run_history_days":90,"sources.scribe_calls_per_hour":120,"sources.excluded":[],"sources.forsight_history_weeks":12,"sources.forsight_quiet_days":7,"sources.forsight_silent_days":14,"sources.forsight_long_silent_days":30,"sources.stellar_stage_labels":{"getting_set_up":"Getting set up","building_system":"Building your system","testing":"Testing","live":"Live","running_smoothly":"Running smoothly"},"operators.assignment_mode":"manual","operators.extra_permissions":[],"operators.summary_time":"start_of_day","operators.summary_confirmer":"operator","compliance.opt_out_words":[],"compliance.quiet_hours":{"start":"20:00","end":"08:00"},"compliance.quiet_hours_basis":"workspace","compliance.daily_cap_per_lead":2,"compliance.cap_applies_to":"auto_run_only","compliance.weekly_cap_per_lead":0,"compliance.required_disclosures":[]}$cfg$::jsonb, ARRAY['approval.never_auto', 'compliance.opt_out_words', 'compliance.quiet_hours', 'compliance.quiet_hours_basis', 'compliance.daily_cap_per_lead', 'compliance.cap_applies_to', 'compliance.weekly_cap_per_lead', 'compliance.required_disclosures']::text[], $cfg${"compliance.opt_out_words":["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"],"compliance.cap_applies_to":"every_send","compliance.quiet_hours_basis":"lead_local","response.after_hours":"pause"}$cfg$::jsonb, 'Launch compliance rules, switched on deliberately: opt-out words stop all messages; the daily per-lead limit covers every send; quiet hours (8pm to 8am) follow the lead''s local time; and the first-touch clock pauses outside business hours.');
SELECT public.config_seed_template('med-spa', 'Med Spa', 'Injectables, facials, laser and skin treatments, body contouring, and memberships.', $cfg${"industry.business_description":"a med spa offering injectables, facials, laser and skin treatments, and body contouring","industry.offers":[{"name":"Injectables (wrinkle relaxers and fillers)","ticket_min":300,"ticket_max":1500,"recurring":false},{"name":"Facials and peels","ticket_min":150,"ticket_max":400,"recurring":false},{"name":"Laser and skin treatments","ticket_min":300,"ticket_max":2500,"recurring":false},{"name":"Body contouring","ticket_min":600,"ticket_max":4000,"recurring":false},{"name":"Membership","ticket_min":99,"ticket_max":299,"recurring":true}],"industry.case_facts":[{"key":"treatment_interest","label":"Treatment of interest","type":"text","required":true},{"key":"concern","label":"What they want to change","type":"text","required":false},{"key":"prior_treatments","label":"Treatments they have had before","type":"text","required":false},{"key":"timeline","label":"When they want it done","type":"text","required":true},{"key":"budget_comfort","label":"Budget they are comfortable with","type":"text","required":false},{"key":"consultation_preference","label":"In-person or virtual consultation","type":"text","required":false}],"industry.compass_questions":[{"question":"Which consultation leads have gone quiet for three days?","audience":"managers"},{"question":"Which hot leads have not been contacted in the last two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What are the most common objections from consultation leads this month?","audience":"managers"},{"question":"Which of my consultation leads should I follow up on first?","audience":"operators"},{"question":"Which of my leads are waiting on a reply?","audience":"operators"}],"industry.urgency_signals":["An upcoming event, like a wedding, holiday, or trip","As soon as possible","This week","Asks about a promotion before it ends","Asks for the next available appointment"],"industry.objections":[{"label":"Cost","category":"price","recognize":"\"How much is it?\", \"That's more than I thought\", \"Do you have payment plans?\"","guidance":"Give the price range plainly, explain what is included, and mention memberships or payment options if you offer them. Never discount under pressure."},{"label":"Nervous about the treatment","category":"trust","recognize":"\"Does it hurt?\", \"I'm worried it will look fake\", \"What if something goes wrong?\"","guidance":"Acknowledge the worry, explain what the treatment involves in simple terms, and offer a consultation to talk it through with the provider. Make no medical claims or promises about results."},{"label":"Timing","category":"timing","recognize":"\"Not right now\", \"Maybe after the holidays\", \"I'm too busy this month\"","guidance":"Ask whether there is an event or date they have in mind, and offer to hold a time that suits them."},{"label":"Trust in the provider","category":"trust","recognize":"\"Who does the treatment?\", \"Are they certified?\", \"Can I see before-and-after photos?\"","guidance":"Share the provider's credentials and experience, and point to reviews or a gallery. Offer a consultation to meet them first."},{"label":"Needs to think about it","category":"fit","recognize":"\"Let me think about it\", \"I'll get back to you\"","guidance":"Respect it. Offer one clear, easy next step, like a free consultation, and check in once without pressure."}],"industry.lead_sources":[{"source":"Website booking form","priority":"high","treatment":"Reply quickly; they already chose a time slot or treatment."},{"source":"Google search","priority":"high","treatment":"Usually ready to book. Lead with availability."},{"source":"Instagram or Facebook ads","priority":"normal","treatment":"Often browsing. Start with the treatment they clicked on."},{"source":"Referral from a client","priority":"high","treatment":"Mention who referred them and thank them."}],"qualification.ready_criteria":["Asks about a specific treatment or its price.","Asks about availability or the next open appointment.","Has had a consultation or treatment with us before.","Mentions an event or a date they want to look their best for."],"qualification.not_ready_criteria":["General browsing with no treatment in mind.","Asks only about price, with no interest in a specific treatment.","Says they are \"just looking\"."],"qualification.disqualifiers":[{"reason":"Lives outside the area we serve.","closing_message":"Thanks so much for reaching out. We only see clients in our local area, so we're not the right fit, but we hope you find someone wonderful nearby."},{"reason":"Below the minimum age for treatment.","closing_message":"Thank you for your interest. We can only treat clients who are 18 or older, so we're not able to book you in."},{"reason":"Wants a treatment we do not offer.","closing_message":"Thanks for asking. That's not a treatment we offer, so we'd rather point you to a specialist who does."}],"qualification.minimum_info":["treatment_interest","timeline"],"response.first_touch_minutes":5,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":4},{"stage":"follow_up","max_gap_hours":24},{"stage":"objection_hold","max_gap_hours":24},{"stage":"no_show","max_gap_hours":4}],"response.ghost_days_soft":3,"response.ghost_days_hard":7,"response.max_sequence_days":7,"tone.formality":"friendly","tone.emoji":"sparing","tone.sms_max_chars":300,"tone.punctuation_rules":"At most one exclamation mark per message. No capitals for emphasis.","tone.preferred_terms":["consultation","treatment plan","provider","results vary"],"tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed results","cure","permanent","risk-free","pain-free","act now","last chance","limited time only"],"tone.examples":[{"channel":"sms","body":"Hi Jess, it's Maya from Glow Studio. We have a lip filler consultation open Thursday at 4. Would that work for you?"},{"channel":"email","body":"Thanks for asking about laser skin resurfacing. A short consultation lets our provider look at your skin and talk through what to expect, including downtime and cost. We have openings this week on Tuesday and Thursday afternoon. Would either suit you?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('home-services', 'Home Services', 'Recurring and one-time jobs: cleaning, HVAC, roofing, lawn care, plumbing, pest control, remodeling.', $cfg${"industry.business_description":"a local home services company doing recurring and one-time jobs at people's homes","identity.business_hours":{"days":{"mon":[{"start":"07:00","end":"18:00"}],"tue":[{"start":"07:00","end":"18:00"}],"wed":[{"start":"07:00","end":"18:00"}],"thu":[{"start":"07:00","end":"18:00"}],"fri":[{"start":"07:00","end":"18:00"}],"sat":[{"start":"08:00","end":"14:00"}],"sun":[]},"closures":[]},"industry.offers":[{"name":"Recurring service (cleaning, lawn care, pest control)","ticket_min":100,"ticket_max":400,"recurring":true},{"name":"One-time job","ticket_min":150,"ticket_max":1500,"recurring":false},{"name":"Repair or emergency call-out","ticket_min":150,"ticket_max":800,"recurring":false},{"name":"Large project (roofing, HVAC replacement, remodeling)","ticket_min":3000,"ticket_max":40000,"recurring":false}],"industry.case_facts":[{"key":"service_type","label":"Service needed","type":"text","required":true},{"key":"property_type","label":"Property type (house, apartment, business)","type":"text","required":false},{"key":"property_size","label":"Property size","type":"text","required":false},{"key":"service_area","label":"Address or area","type":"text","required":true},{"key":"timing","label":"When they need it","type":"text","required":true},{"key":"frequency","label":"One-time or recurring","type":"text","required":false},{"key":"access_notes","label":"Access notes (gate code, pets, parking)","type":"text","required":false}],"industry.compass_questions":[{"question":"Which estimate requests have not been called back yet?","audience":"managers"},{"question":"How quickly did we reach new leads this week?","audience":"managers"},{"question":"Which leads went quiet after an estimate?","audience":"managers"},{"question":"What are the most common objections this month?","audience":"managers"},{"question":"Which of my leads need a call back today?","audience":"operators"},{"question":"Which of my leads are at risk of missing their response window?","audience":"operators"}],"industry.urgency_signals":["today","leak","flooding","broken","no heat","no AC","emergency","A move-in or move-out date"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"That's expensive\", \"Can you do it cheaper?\"","guidance":"Explain what the price includes and why. Offer a smaller first job or a recurring rate if you have one. Do not undercut yourself to win the job."},{"label":"Availability","category":"timing","recognize":"\"When can you come?\", \"I need it sooner than that\"","guidance":"Give the earliest real date. If an emergency, say what you can do today."},{"label":"Trust and reviews","category":"trust","recognize":"\"Are you insured?\", \"Do you have reviews?\"","guidance":"Confirm licensing and insurance, and share where to read reviews."},{"label":"Getting other quotes","category":"competitor","recognize":"\"I'm getting a few quotes\", \"Someone else quoted less\"","guidance":"That's sensible. Make your quote easy to compare: what is included, warranty, and timing. Follow up once after a couple of days."},{"label":"Timing","category":"timing","recognize":"\"Not until next month\", \"After the holidays\"","guidance":"Offer to book a date now so they keep the slot, and set a reminder."}],"industry.lead_sources":[{"source":"Google local listing","priority":"high","treatment":"Usually needs help soon. Reply with the earliest date."},{"source":"Website quote form","priority":"high","treatment":"Confirm the job and the address, then give a time."},{"source":"Referral","priority":"high","treatment":"Mention who referred them."},{"source":"Lead marketplace (Angi, Thumbtack)","priority":"normal","treatment":"Reply fast; they contacted several companies."},{"source":"Flyers and door hangers","priority":"low","treatment":"Often price shopping. Lead with a clear starting price."}],"qualification.ready_criteria":["Described a specific job.","Gave an address or the area they are in.","Asked for a quote or a date.","Mentioned something urgent, like a leak or a broken system."],"qualification.not_ready_criteria":["Curious about prices in general.","Comparing many providers with no date in mind."],"qualification.disqualifiers":[{"reason":"Outside our service area.","closing_message":"Thanks for getting in touch. That address is outside the area we cover, so we can't help with this one. Sorry we couldn't be more useful."},{"reason":"A job type we do not offer.","closing_message":"Thanks for asking. That's not a job we do, but a specialist will be able to help."},{"reason":"Below our minimum job size.","closing_message":"Thanks for reaching out. That job is smaller than we usually take on, so we're not the best fit this time."}],"qualification.minimum_info":["service_type","service_area","timing"],"response.first_touch_minutes":10,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":24},{"stage":"follow_up","max_gap_hours":48},{"stage":"objection_hold","max_gap_hours":48},{"stage":"no_show","max_gap_hours":24}],"response.ghost_days_soft":7,"response.ghost_days_hard":21,"response.max_sequence_days":14,"escalation.levels":[{"severity":"warning","trigger":"A new lead has not had a first touch within the window.","after_windows":1,"notify":["assignee"],"channels":["push"]},{"severity":"urgent","trigger":"Still untouched at twice the window.","after_windows":2,"notify":["setters"],"channels":["push","team_channel"]},{"severity":"critical","trigger":"Still untouched at four times the window.","after_windows":4,"notify":["managers"],"channels":["push"]},{"severity":"urgent","trigger":"A lead mentions an emergency, like a leak, flooding, or no heat.","notify":["assignee","managers"],"channels":["push","sms"]}],"tone.formality":"friendly","tone.sms_max_chars":200,"tone.email_max_chars":600,"tone.punctuation_rules":"Plain words and short sentences. No exclamation marks in quotes or prices.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","kindly","do not hesitate","per our conversation"],"tone.examples":[{"channel":"sms","body":"Hi Dan, it's Luis from Northside Plumbing. We can be there tomorrow between 8 and 10 to look at the leak. Does that work?"},{"channel":"sms","body":"Thanks for the photos. A full gutter clean for a two-story house is usually $180 to $240. Want me to book you in for Saturday morning?"}]}$cfg$::jsonb);
SELECT public.config_seed_template('coaches-consultants', 'Coaches and Consultants', 'High-ticket programs, group programs, one-to-one coaching, and consulting engagements.', $cfg${"industry.business_description":"a high-ticket coaching or consulting business that sells through sales calls","industry.offers":[{"name":"High-ticket program","ticket_min":3000,"ticket_max":25000,"recurring":false},{"name":"Group program","ticket_min":500,"ticket_max":5000,"recurring":false},{"name":"One-to-one coaching","ticket_min":1000,"ticket_max":10000,"recurring":true},{"name":"Consulting engagement","ticket_min":5000,"ticket_max":50000,"recurring":false}],"industry.case_facts":[{"key":"stated_goal","label":"What they want to achieve","type":"text","required":true},{"key":"current_situation","label":"Where they are now","type":"text","required":false},{"key":"budget_range","label":"Budget range","type":"text","required":true},{"key":"decision_maker","label":"Who makes the decision","type":"text","required":true},{"key":"timeline","label":"When they want to start","type":"text","required":true},{"key":"previous_coaching","label":"Coaching or consulting they have had before","type":"text","required":false},{"key":"objections_raised","label":"Objections raised on the call","type":"text","required":false}],"industry.compass_questions":[{"question":"Which strategy-call leads went quiet after a good first call?","audience":"managers"},{"question":"Which hot leads have not had a follow-up in two days?","audience":"managers"},{"question":"How did our response time look this week?","audience":"managers"},{"question":"What objections came up most on sales calls this month?","audience":"managers"},{"question":"Which of my leads should I follow up on first today?","audience":"operators"},{"question":"Which of my booked calls need a reminder?","audience":"operators"}],"industry.urgency_signals":["A stated deadline","A launch date coming up","\"Ready to start\"","A recent trigger event, like losing a client or new funding"],"industry.objections":[{"label":"Price","category":"price","recognize":"\"It's a lot of money right now\", \"I can't justify that\"","guidance":"Tie the investment back to the goal they stated and what it is costing them to stay where they are. Offer a payment plan only if one exists."},{"label":"Timing","category":"timing","recognize":"\"Now's not the right time\", \"Maybe next quarter\"","guidance":"Ask what would need to be true for the timing to be right, and what waiting costs them."},{"label":"Needs to talk to a partner or team","category":"spouse_partner","recognize":"\"I need to talk to my partner\", \"I have to run it by my team\"","guidance":"Offer a short call with the other decision-maker, and send a one-page summary they can share."},{"label":"Skeptical about results","category":"trust","recognize":"\"How do I know this will work for me?\"","guidance":"Share a relevant client story with specifics, and be honest about what the program needs from them."},{"label":"Past bad experience","category":"trust","recognize":"\"I've done a program before and it didn't work\"","guidance":"Ask what went wrong, listen, and explain clearly how this differs. Never criticize the other provider."}],"industry.lead_sources":[{"source":"Referral","priority":"high","treatment":"Mention who referred them; trust is already there."},{"source":"Paid social ads","priority":"normal","treatment":"Confirm the problem they want solved before talking about the offer."},{"source":"Webinar or podcast","priority":"normal","treatment":"Reference what they watched or heard."},{"source":"Email list","priority":"normal","treatment":"They know you; ask what prompted them to reply now."}],"qualification.ready_criteria":["Has stated a clear problem and the goal they want.","Has acknowledged the budget.","The decision-maker is on the call.","Has stated a timeline for starting.","Has engaged with earlier touches."],"qualification.not_ready_criteria":["Curious, but with no clear goal.","No budget for this yet.","Needs approval from someone who is not on the call."],"qualification.disqualifiers":[{"reason":"Not at the right stage for the offer.","closing_message":"Thanks for the time today. Based on where you are right now, this isn't the right program yet. Here's what I'd focus on first, and I'm happy to talk again when you get there."},{"reason":"No decision-making authority, with no path to the person who has it.","closing_message":null},{"reason":"Unwilling to commit to the program format.","closing_message":"Thanks for being straight with me. The program only works with the full commitment, so it wouldn't be fair to take you on. I wish you the best with it."}],"qualification.minimum_info":["stated_goal","budget_range","decision_maker","timeline"],"response.first_touch_minutes":15,"response.follow_up_cadence":[{"stage":"working","max_gap_hours":48},{"stage":"follow_up","max_gap_hours":96},{"stage":"objection_hold","max_gap_hours":72},{"stage":"no_show","max_gap_hours":24}],"tone.formality":"friendly","tone.punctuation_rules":"Confident and plain. No hype, no exclamation marks in follow-ups after a call.","tone.banned_terms":["I hope this message finds you well","I hope you're doing well","I wanted to reach out","just circling back","circling back","touching base","following up on our conversation","as we discussed","leverage","utilize","synergy","streamline","robust","seamless","journey","solution","guaranteed","life-changing","secret","hack","only a few spots left"],"tone.examples":[{"channel":"sms","body":"Good talking today, Sam. You said the goal is 10 clients a month by March. I'll send the plan we walked through tonight; worth looking at before Thursday's call."},{"channel":"email","body":"Thanks for walking me through where the business is. You mentioned two things are holding growth back: no consistent lead flow and closing calls yourself. The program covers both, and the next step is a 20-minute call with your business partner so you can decide together. Does Thursday at 2 work?"}]}$cfg$::jsonb);
-- config-registry:end

-- ---------------------------------------------------------------------------
-- 10. Grants. Nothing here is callable by signed-out visitors.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  f text;
  user_facing text[] := ARRAY[
    'ws_can_see_transcripts(uuid)', 'call_transcript_texts(uuid, uuid[])', 'case_quotes_visible(uuid)',
    'compass_legacy_delete(uuid)', 'compass_availability(uuid)', 'compass_set_enabled(uuid, boolean, text)',
    'compass_effective_limits(uuid)', 'compass_consume(uuid)', 'compass_share(uuid, integer, uuid)', 'compass_unshare(uuid)',
    'compass_shared_conversation(uuid)', 'compass_shared_list()', 'compass_settings_save(jsonb)',
    'compass_workspace_limits_save(uuid, integer, integer, integer, text)', 'compass_workspace_usage(uuid)',
    'compass_platform_usage(timestamptz, timestamptz)', 'compass_quality_review(integer)',
    'help_article_save(text, text, text, text, text, text, integer, boolean)', 'help_article_delete(text)',
    'compass_lead_allowed(uuid, uuid)', 'compass_find_leads(uuid, jsonb, integer)', 'compass_case_file(uuid, uuid)',
    'compass_lead_transcript(uuid, uuid, integer)',
    'compass_metric_summary(uuid, text[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb)',
    'compass_metric_breakdown(uuid, text, timestamptz, timestamptz, jsonb, text)',
    'compass_metric_leads(uuid, text, timestamptz, timestamptz, jsonb, integer)',
    'compass_may_request_draft(uuid, uuid)', 'compass_request_draft(uuid, uuid)',
    'compass_create_next_action(uuid, uuid, text, timestamptz)', 'compass_record_action(uuid, text, uuid, jsonb)',
    'compass_is_mine(uuid, uuid)', 'compass_conversation_is_mine(uuid)', 'sales_os_tool_call_visible(uuid)'
  ];
  internal text[] := ARRAY[
    'compass_scope_filters(uuid, jsonb)', 'compass_purge()', 'compass_pins_cap()',
    'org_members_transcript_grant_guard()'
  ];
BEGIN
  FOREACH f IN ARRAY user_facing LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY internal LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- portal_member_flag and case_meaning_search were recreated above; keep their grants.
REVOKE ALL ON FUNCTION public.portal_member_flag(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_member_flag(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.case_meaning_search(uuid, extensions.vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_meaning_search(uuid, extensions.vector, integer) TO authenticated, service_role;
