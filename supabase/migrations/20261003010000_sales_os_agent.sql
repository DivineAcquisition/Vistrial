-- Sales OS agent (Phase 1): the conversation a client opens Vistrial into.
--
-- Three tiers of work, each with its own record:
--   analysis   reads, changes nothing          -> sales_os_tool_calls
--   assets     produced into Vistrial only     -> sales_os_assets (versioned)
--   execution  posts to Slack / Discord, Drive -> sales_os_executions (gated)
--
-- Everything here is written by the signed-in person through RLS. There is no
-- service-role path. Nothing has a DELETE grant. Execution types are a CHECK
-- allowlist: adding one is a migration, not a setting.

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'regular',
  context_package_id uuid,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_os_conversations_id_org_key UNIQUE (id, org_id),
  CONSTRAINT sales_os_conversations_member_org_fkey FOREIGN KEY (member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE,
  CONSTRAINT sales_os_conversations_status_check CHECK (status IN ('regular', 'archived'))
);

CREATE INDEX sales_os_conversations_member_idx
  ON public.sales_os_conversations (org_id, member_id, created_at DESC);

COMMENT ON TABLE public.sales_os_conversations IS
  'One Sales OS conversation. Archived, never deleted. Visible to its owner and to workspace owners/admins.';

CREATE TABLE public.sales_os_messages (
  id text NOT NULL,
  conversation_id uuid NOT NULL,
  org_id uuid NOT NULL,
  seq integer NOT NULL,
  role text NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb,
  acted_as_member_id uuid NOT NULL,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, id),
  CONSTRAINT sales_os_messages_conversation_fkey FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.sales_os_conversations (id, org_id) ON DELETE CASCADE,
  CONSTRAINT sales_os_messages_member_org_fkey FOREIGN KEY (acted_as_member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE,
  CONSTRAINT sales_os_messages_role_check CHECK (role IN ('user', 'assistant')),
  CONSTRAINT sales_os_messages_seq_key UNIQUE (conversation_id, seq)
);

-- ---------------------------------------------------------------------------
-- Context package cache. Built per person, because what one person may read
-- (revenue, other reps' coaching rows) is not what another may.
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_context_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  fingerprint jsonb NOT NULL,
  payload jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_os_context_packages_id_org_key UNIQUE (id, org_id),
  CONSTRAINT sales_os_context_packages_member_org_fkey FOREIGN KEY (member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE
);

CREATE INDEX sales_os_context_packages_member_idx
  ON public.sales_os_context_packages (org_id, member_id, built_at DESC);

ALTER TABLE public.sales_os_conversations
  ADD CONSTRAINT sales_os_conversations_context_fkey FOREIGN KEY (context_package_id, org_id)
    REFERENCES public.sales_os_context_packages (id, org_id);

-- ---------------------------------------------------------------------------
-- Tool calls: every call the agent made, in plain language, with who it ran as.
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  tool_call_id text NOT NULL,
  tool_name text NOT NULL,
  tier text NOT NULL,
  label text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  state text NOT NULL DEFAULT 'running',
  error_text text,
  acted_as_member_id uuid NOT NULL,
  acted_as_user_id uuid NOT NULL,
  acted_as_display_name text NOT NULL,
  acted_as_role text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT sales_os_tool_calls_conversation_fkey FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.sales_os_conversations (id, org_id) ON DELETE CASCADE,
  CONSTRAINT sales_os_tool_calls_member_org_fkey FOREIGN KEY (acted_as_member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE,
  CONSTRAINT sales_os_tool_calls_call_key UNIQUE (conversation_id, tool_call_id),
  CONSTRAINT sales_os_tool_calls_tier_check CHECK (tier IN ('analysis', 'asset', 'execution')),
  CONSTRAINT sales_os_tool_calls_state_check CHECK (
    state IN ('running', 'done', 'failed', 'permission', 'insufficient_data', 'awaiting_approval', 'rejected')
  ),
  CONSTRAINT sales_os_tool_calls_tool_allowlist CHECK (tool_name IN (
    'analyze_funnel',
    'analyze_sources',
    'analyze_objections',
    'analyze_speed_to_lead',
    'compare_periods',
    'list_assets',
    'create_sales_script',
    'create_ad_angles',
    'create_channel_insights',
    'create_objection_responses',
    'post_slack_update',
    'post_discord_update',
    'save_asset_to_drive',
    'deliver_asset'
  )),
  CONSTRAINT sales_os_tool_calls_label_plain CHECK (
    length(btrim(label)) > 0 AND label !~ '^[a-z_]+$'
  )
);

CREATE INDEX sales_os_tool_calls_org_started_idx
  ON public.sales_os_tool_calls (org_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Assets: built from this workspace's own data, versioned, never pushed.
-- A version is immutable. Editing writes the next version.
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  version integer NOT NULL,
  asset_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  basis text NOT NULL,
  sample_size integer NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'current',
  origin text NOT NULL DEFAULT 'agent',
  created_by_member_id uuid NOT NULL,
  conversation_id uuid,
  superseded_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_os_assets_id_org_key UNIQUE (id, org_id),
  CONSTRAINT sales_os_assets_family_version_key UNIQUE (family_id, version),
  CONSTRAINT sales_os_assets_creator_org_fkey FOREIGN KEY (created_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id) ON DELETE CASCADE,
  CONSTRAINT sales_os_assets_reviewer_org_fkey FOREIGN KEY (reviewed_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_assets_conversation_fkey FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.sales_os_conversations (id, org_id),
  CONSTRAINT sales_os_assets_type_check CHECK (
    asset_type IN ('sales_script', 'ad_angles', 'channel_insights', 'objection_responses')
  ),
  CONSTRAINT sales_os_assets_status_check CHECK (status IN ('current', 'superseded')),
  CONSTRAINT sales_os_assets_origin_check CHECK (origin IN ('agent', 'edit')),
  CONSTRAINT sales_os_assets_version_check CHECK (version >= 1),
  CONSTRAINT sales_os_assets_sample_check CHECK (sample_size >= 1),
  CONSTRAINT sales_os_assets_basis_check CHECK (length(btrim(basis)) > 0),
  CONSTRAINT sales_os_assets_body_check CHECK (length(btrim(body)) > 0),
  CONSTRAINT sales_os_assets_title_check CHECK (length(btrim(title)) > 0),
  CONSTRAINT sales_os_assets_period_check CHECK (period_end >= period_start),
  CONSTRAINT sales_os_assets_superseded_check CHECK (
    (status = 'current' AND superseded_at IS NULL)
    OR (status = 'superseded' AND superseded_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX sales_os_assets_one_current
  ON public.sales_os_assets (family_id)
  WHERE status = 'current';

CREATE INDEX sales_os_assets_org_created_idx
  ON public.sales_os_assets (org_id, created_at DESC);

COMMENT ON TABLE public.sales_os_assets IS
  'Scripts, ad angles, channel insights, objection responses. Creating one pushes it nowhere. Delivery is an execution.';

-- ---------------------------------------------------------------------------
-- Destinations: where execution may write. Slack and Discord are channel
-- webhooks (post-only). Drive is an OAuth grant on the drive.file scope, so
-- Vistrial can only see files it created.
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  secret_ciphertext text NOT NULL,
  external_ref text,
  account_label text,
  active boolean NOT NULL DEFAULT true,
  created_by_member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_os_destinations_id_org_key UNIQUE (id, org_id),
  CONSTRAINT sales_os_destinations_creator_org_fkey FOREIGN KEY (created_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_destinations_kind_check CHECK (kind IN ('slack_channel', 'discord_channel', 'google_drive')),
  CONSTRAINT sales_os_destinations_label_check CHECK (length(btrim(label)) > 0),
  CONSTRAINT sales_os_destinations_secret_shape CHECK (secret_ciphertext LIKE 'v1.%')
);

CREATE UNIQUE INDEX sales_os_destinations_one_drive
  ON public.sales_os_destinations (org_id)
  WHERE kind = 'google_drive' AND active;

-- ---------------------------------------------------------------------------
-- Routing: which channel receives what.
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_routes (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  message_kind text NOT NULL,
  -- Null means "post these nowhere". Routes are changed, never deleted.
  destination_id uuid,
  updated_by_member_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, message_kind),
  CONSTRAINT sales_os_routes_destination_fkey FOREIGN KEY (destination_id, org_id)
    REFERENCES public.sales_os_destinations (id, org_id),
  CONSTRAINT sales_os_routes_member_org_fkey FOREIGN KEY (updated_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_routes_kind_check CHECK (
    message_kind IN ('summary', 'brief', 'alert', 'asset')
  )
);

-- ---------------------------------------------------------------------------
-- Gates: per client, per execution type. A missing row means "ask every time".
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_gates (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  execution_type text NOT NULL,
  mode text NOT NULL DEFAULT 'always_ask',
  updated_by_member_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, execution_type),
  CONSTRAINT sales_os_gates_member_org_fkey FOREIGN KEY (updated_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_gates_type_check CHECK (
    execution_type IN ('post_slack_update', 'post_discord_update', 'save_asset_to_drive', 'deliver_asset')
  ),
  CONSTRAINT sales_os_gates_mode_check CHECK (mode IN ('always_ask', 'ask_first_time', 'automatic'))
);

-- ---------------------------------------------------------------------------
-- Executions: the only rows that lead to a change outside Vistrial.
-- ---------------------------------------------------------------------------

CREATE TABLE public.sales_os_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  tool_call_id text NOT NULL,
  execution_type text NOT NULL,
  destination_id uuid NOT NULL,
  asset_id uuid,
  plan jsonb NOT NULL,
  plain_summary text NOT NULL,
  preview text NOT NULL,
  input_hash text NOT NULL,
  gate_mode text NOT NULL,
  status text NOT NULL,
  gate_satisfied_by text,
  requested_by_member_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  approved_by_member_id uuid,
  approved_at timestamptz,
  rejected_by_member_id uuid,
  rejected_at timestamptz,
  rejection_reason text,
  result jsonb,
  result_summary text,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT sales_os_executions_id_org_key UNIQUE (id, org_id),
  CONSTRAINT sales_os_executions_call_key UNIQUE (conversation_id, tool_call_id),
  CONSTRAINT sales_os_executions_conversation_fkey FOREIGN KEY (conversation_id, org_id)
    REFERENCES public.sales_os_conversations (id, org_id),
  CONSTRAINT sales_os_executions_destination_fkey FOREIGN KEY (destination_id, org_id)
    REFERENCES public.sales_os_destinations (id, org_id),
  CONSTRAINT sales_os_executions_asset_fkey FOREIGN KEY (asset_id, org_id)
    REFERENCES public.sales_os_assets (id, org_id),
  CONSTRAINT sales_os_executions_requester_fkey FOREIGN KEY (requested_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_executions_approver_fkey FOREIGN KEY (approved_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_executions_rejecter_fkey FOREIGN KEY (rejected_by_member_id, org_id)
    REFERENCES public.org_members (id, org_id),
  CONSTRAINT sales_os_executions_type_check CHECK (
    execution_type IN ('post_slack_update', 'post_discord_update', 'save_asset_to_drive', 'deliver_asset')
  ),
  CONSTRAINT sales_os_executions_mode_check CHECK (gate_mode IN ('always_ask', 'ask_first_time', 'automatic')),
  CONSTRAINT sales_os_executions_status_check CHECK (
    status IN ('awaiting_approval', 'approved', 'rejected', 'running', 'succeeded', 'failed')
  ),
  CONSTRAINT sales_os_executions_satisfied_check CHECK (
    gate_satisfied_by IS NULL OR gate_satisfied_by IN ('prior_configuration', 'in_conversation_approval')
  ),
  -- Nothing past approval without a recorded way the gate was satisfied.
  CONSTRAINT sales_os_executions_gate_required CHECK (
    status IN ('awaiting_approval', 'rejected') OR gate_satisfied_by IS NOT NULL
  ),
  CONSTRAINT sales_os_executions_approval_named CHECK (
    gate_satisfied_by IS DISTINCT FROM 'in_conversation_approval'
    OR (approved_by_member_id IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT sales_os_executions_always_ask_needs_person CHECK (
    gate_mode <> 'always_ask' OR gate_satisfied_by IS DISTINCT FROM 'prior_configuration'
  ),
  CONSTRAINT sales_os_executions_rejection_recorded CHECK (
    status <> 'rejected' OR (rejected_at IS NOT NULL AND rejected_by_member_id IS NOT NULL)
  ),
  CONSTRAINT sales_os_executions_summary_plain CHECK (
    length(btrim(plain_summary)) > 0 AND left(btrim(plain_summary), 1) NOT IN ('{', '[')
  ),
  CONSTRAINT sales_os_executions_preview_plain CHECK (
    left(btrim(preview), 1) NOT IN ('{', '[')
  )
);

CREATE INDEX sales_os_executions_org_created_idx
  ON public.sales_os_executions (org_id, created_at DESC);

COMMENT ON TABLE public.sales_os_executions IS
  'Gated writes to Slack, Discord, and Drive. Terminal states never move: a failure is not retried, a rejection is final.';

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------

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
      AND (
        c.user_id = auth.uid()
        OR public.user_has_org_role(c.org_id, 'owner', 'admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.sales_os_conversation_is_mine(p_conversation_id uuid)
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
      AND c.user_id = auth.uid()
      AND c.org_id IN (SELECT public.user_org_ids())
  );
$$;

REVOKE ALL ON FUNCTION public.sales_os_conversation_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_os_conversation_is_mine(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_os_conversation_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_os_conversation_is_mine(uuid) TO authenticated;

-- The one place a destination credential leaves the table. Owner/admin only,
-- active destinations only. Callers still need the app's encryption key.
CREATE OR REPLACE FUNCTION public.sales_os_destination_credential(p_destination_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.secret_ciphertext
  FROM public.sales_os_destinations d
  WHERE d.id = p_destination_id
    AND d.active
    AND d.org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(d.org_id, 'owner', 'admin');
$$;

REVOKE ALL ON FUNCTION public.sales_os_destination_credential(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_os_destination_credential(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sales_os_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Sales OS records are never deleted.' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER sales_os_conversations_no_delete BEFORE DELETE ON public.sales_os_conversations
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_forbid_delete();
CREATE TRIGGER sales_os_messages_no_delete BEFORE DELETE ON public.sales_os_messages
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_forbid_delete();
CREATE TRIGGER sales_os_tool_calls_no_delete BEFORE DELETE ON public.sales_os_tool_calls
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_forbid_delete();
CREATE TRIGGER sales_os_assets_no_delete BEFORE DELETE ON public.sales_os_assets
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_forbid_delete();
CREATE TRIGGER sales_os_executions_no_delete BEFORE DELETE ON public.sales_os_executions
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_forbid_delete();
CREATE TRIGGER sales_os_destinations_no_delete BEFORE DELETE ON public.sales_os_destinations
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_forbid_delete();

-- Asset versions are immutable apart from being superseded or reviewed.
CREATE OR REPLACE FUNCTION public.sales_os_assets_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.family_id IS DISTINCT FROM OLD.family_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.asset_type IS DISTINCT FROM OLD.asset_type
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.basis IS DISTINCT FROM OLD.basis
    OR NEW.sample_size IS DISTINCT FROM OLD.sample_size
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.evidence IS DISTINCT FROM OLD.evidence
    OR NEW.origin IS DISTINCT FROM OLD.origin
    OR NEW.created_by_member_id IS DISTINCT FROM OLD.created_by_member_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'An asset version cannot be changed. Save a new version instead.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'superseded' AND NEW.status = 'current' THEN
    RAISE EXCEPTION 'A superseded asset cannot become current again.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_os_assets_guard BEFORE UPDATE ON public.sales_os_assets
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_assets_guard();

-- Writes the next version of an asset family atomically. SECURITY INVOKER, so
-- RLS decides whether the caller may write assets at all.
CREATE OR REPLACE FUNCTION public.sales_os_save_asset_version(
  p_org_id uuid,
  p_family_id uuid,
  p_asset_type text,
  p_title text,
  p_body text,
  p_basis text,
  p_sample_size integer,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_evidence jsonb,
  p_origin text,
  p_conversation_id uuid
)
RETURNS public.sales_os_assets
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_family uuid := COALESCE(p_family_id, gen_random_uuid());
  v_member uuid := public.user_member_id(p_org_id);
  v_next integer;
  v_type text := p_asset_type;
  v_row public.sales_os_assets;
BEGIN
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace.' USING ERRCODE = '42501';
  END IF;

  IF p_family_id IS NOT NULL THEN
    SELECT a.asset_type INTO v_type
    FROM public.sales_os_assets a
    WHERE a.family_id = p_family_id AND a.org_id = p_org_id
    ORDER BY a.version DESC
    LIMIT 1
    FOR UPDATE;
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'That asset is not in this workspace.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.sales_os_assets
  WHERE family_id = v_family;

  UPDATE public.sales_os_assets
  SET status = 'superseded', superseded_at = now()
  WHERE family_id = v_family AND status = 'current';

  INSERT INTO public.sales_os_assets (
    org_id, family_id, version, asset_type, title, body, basis, sample_size,
    period_start, period_end, evidence, status, origin, created_by_member_id, conversation_id
  ) VALUES (
    p_org_id, v_family, v_next, v_type, p_title, p_body, p_basis, p_sample_size,
    p_period_start, p_period_end, COALESCE(p_evidence, '[]'::jsonb), 'current', p_origin, v_member, p_conversation_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_os_save_asset_version(
  uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_os_save_asset_version(
  uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid
) TO authenticated;

-- The execution gate, enforced in the database. Application code checks the
-- same rules first; this is the backstop that every path has to pass.
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

  -- UPDATE: immutable identity and plan.
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.tool_call_id IS DISTINCT FROM OLD.tool_call_id
    OR NEW.execution_type IS DISTINCT FROM OLD.execution_type
    OR NEW.destination_id IS DISTINCT FROM OLD.destination_id
    OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
    OR NEW.plan IS DISTINCT FROM OLD.plan
    OR NEW.plain_summary IS DISTINCT FROM OLD.plain_summary
    OR NEW.preview IS DISTINCT FROM OLD.preview
    OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
    OR NEW.gate_mode IS DISTINCT FROM OLD.gate_mode
    OR NEW.requested_by_member_id IS DISTINCT FROM OLD.requested_by_member_id
    OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'What an execution does cannot change after it is requested.' USING ERRCODE = '42501';
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

CREATE TRIGGER sales_os_executions_gate
  BEFORE INSERT OR UPDATE ON public.sales_os_executions
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_executions_gate();

-- Gate, destination, and routing changes land in the settings activity log.
CREATE OR REPLACE FUNCTION public.sales_os_settings_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid := public.user_member_id(NEW.org_id);
  v_label text;
  v_action text;
  v_from jsonb;
  v_to jsonb;
BEGIN
  SELECT display_name INTO v_label FROM public.org_members WHERE id = v_member;
  IF TG_TABLE_NAME = 'sales_os_gates' THEN
    v_action := 'agent_gate_changed';
    v_from := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('execution_type', OLD.execution_type, 'mode', OLD.mode) END;
    v_to := jsonb_build_object('execution_type', NEW.execution_type, 'mode', NEW.mode);
  ELSIF TG_TABLE_NAME = 'sales_os_routes' THEN
    v_action := 'agent_route_changed';
    v_from := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('message_kind', OLD.message_kind, 'destination_id', OLD.destination_id) END;
    v_to := jsonb_build_object('message_kind', NEW.message_kind, 'destination_id', NEW.destination_id);
  ELSE
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'agent_destination_added' ELSE 'agent_destination_changed' END;
    v_from := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('label', OLD.label, 'active', OLD.active) END;
    v_to := jsonb_build_object('kind', NEW.kind, 'label', NEW.label, 'active', NEW.active);
  END IF;

  INSERT INTO public.settings_activity (
    org_id, actor_member_id, actor_user_id, actor_label, actor_kind, section, action, from_value, to_value
  ) VALUES (
    NEW.org_id, v_member, auth.uid(), COALESCE(v_label, 'Unknown'), 'member', 'agent', v_action, v_from, v_to
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_os_gates_audit AFTER INSERT OR UPDATE ON public.sales_os_gates
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_settings_audit();
CREATE TRIGGER sales_os_routes_audit AFTER INSERT OR UPDATE ON public.sales_os_routes
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_settings_audit();
CREATE TRIGGER sales_os_destinations_audit AFTER INSERT OR UPDATE ON public.sales_os_destinations
  FOR EACH ROW EXECUTE FUNCTION public.sales_os_settings_audit();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales_os_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_context_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_os_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_os_conversations_select
  ON public.sales_os_conversations FOR SELECT TO authenticated
  USING (public.sales_os_conversation_visible(id));

CREATE POLICY sales_os_conversations_insert_self
  ON public.sales_os_conversations FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND user_id = auth.uid()
    AND member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_conversations_update_self
  ON public.sales_os_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (user_id = auth.uid() AND member_id = public.user_member_id(org_id));

CREATE POLICY sales_os_messages_select
  ON public.sales_os_messages FOR SELECT TO authenticated
  USING (public.sales_os_conversation_visible(conversation_id));

CREATE POLICY sales_os_messages_insert_owner
  ON public.sales_os_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.sales_os_conversation_is_mine(conversation_id)
    AND acted_as_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_messages_update_owner
  ON public.sales_os_messages FOR UPDATE TO authenticated
  USING (public.sales_os_conversation_is_mine(conversation_id))
  WITH CHECK (
    public.sales_os_conversation_is_mine(conversation_id)
    AND acted_as_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_context_packages_select_self
  ON public.sales_os_context_packages FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (member_id = public.user_member_id(org_id) OR public.user_has_org_role(org_id, 'owner', 'admin'))
  );

CREATE POLICY sales_os_context_packages_insert_self
  ON public.sales_os_context_packages FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_tool_calls_select
  ON public.sales_os_tool_calls FOR SELECT TO authenticated
  USING (public.sales_os_conversation_visible(conversation_id));

CREATE POLICY sales_os_tool_calls_insert_owner
  ON public.sales_os_tool_calls FOR INSERT TO authenticated
  WITH CHECK (
    public.sales_os_conversation_is_mine(conversation_id)
    AND acted_as_member_id = public.user_member_id(org_id)
    AND acted_as_user_id = auth.uid()
  );

CREATE POLICY sales_os_tool_calls_update_owner
  ON public.sales_os_tool_calls FOR UPDATE TO authenticated
  USING (public.sales_os_conversation_is_mine(conversation_id))
  WITH CHECK (
    public.sales_os_conversation_is_mine(conversation_id)
    AND acted_as_member_id = public.user_member_id(org_id)
    AND acted_as_user_id = auth.uid()
  );

CREATE POLICY sales_os_assets_select
  ON public.sales_os_assets FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY sales_os_assets_insert_managers
  ON public.sales_os_assets FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
    AND created_by_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_assets_update_managers
  ON public.sales_os_assets FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(org_id, 'owner', 'admin')
    AND (reviewed_by_member_id IS NULL OR reviewed_by_member_id = public.user_member_id(org_id))
  );

CREATE POLICY sales_os_destinations_select
  ON public.sales_os_destinations FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY sales_os_destinations_insert_managers
  ON public.sales_os_destinations FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND created_by_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_destinations_update_managers
  ON public.sales_os_destinations FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY sales_os_routes_select
  ON public.sales_os_routes FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY sales_os_routes_write_managers
  ON public.sales_os_routes FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND updated_by_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_routes_update_managers
  ON public.sales_os_routes FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND updated_by_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_gates_select
  ON public.sales_os_gates FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY sales_os_gates_insert_managers
  ON public.sales_os_gates FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND updated_by_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_gates_update_managers
  ON public.sales_os_gates FOR UPDATE TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND updated_by_member_id = public.user_member_id(org_id)
  );

CREATE POLICY sales_os_executions_select
  ON public.sales_os_executions FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND (
      requested_by_user_id = auth.uid()
      OR public.user_has_org_role(org_id, 'owner', 'admin')
    )
  );

CREATE POLICY sales_os_executions_insert_managers
  ON public.sales_os_executions FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND public.sales_os_conversation_is_mine(conversation_id)
  );

CREATE POLICY sales_os_executions_update_managers
  ON public.sales_os_executions FOR UPDATE TO authenticated
  USING (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND public.sales_os_conversation_is_mine(conversation_id)
  )
  WITH CHECK (
    public.user_has_org_role(org_id, 'owner', 'admin')
    AND public.sales_os_conversation_is_mine(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- Grants. No DELETE anywhere. Destination ciphertext is not selectable.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.sales_os_conversations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_messages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_context_packages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_tool_calls FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_assets FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_destinations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_routes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_gates FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales_os_executions FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON public.sales_os_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_os_messages TO authenticated;
GRANT SELECT, INSERT ON public.sales_os_context_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_os_tool_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_os_assets TO authenticated;
GRANT SELECT (
  id, org_id, kind, label, external_ref, account_label, active,
  created_by_member_id, created_at, updated_at
) ON public.sales_os_destinations TO authenticated;
GRANT INSERT (
  id, org_id, kind, label, secret_ciphertext, external_ref, account_label, active, created_by_member_id
) ON public.sales_os_destinations TO authenticated;
GRANT UPDATE (label, active, updated_at, external_ref) ON public.sales_os_destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_os_routes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_os_gates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_os_executions TO authenticated;
