-- Customer connections: catalog records, limits, and the shared-account exception.
-- Secrets live in connection_secrets and are never granted to signed-in users.
-- Existing GoHighLevel ingest tables stay. This extends them.

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS can_manage_connections boolean NOT NULL DEFAULT false;

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_can_manage_connections_member_only;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_can_manage_connections_member_only
  CHECK (NOT can_manage_connections OR role IN ('member', 'client_viewer'));

COMMENT ON COLUMN public.org_members.can_manage_connections IS
  'Members only. Off by default. Owners always manage connections. Staff never authorize one.';

ALTER TABLE public.ghl_connections
  ADD COLUMN IF NOT EXISTS refresh_claimed_at timestamptz;

ALTER TABLE public.calendar_blocks
  ADD COLUMN IF NOT EXISTS meeting_kind text,
  ADD COLUMN IF NOT EXISTS event_status text;

ALTER TABLE public.calendar_blocks DROP CONSTRAINT IF EXISTS calendar_blocks_meeting_kind_check;
ALTER TABLE public.calendar_blocks
  ADD CONSTRAINT calendar_blocks_meeting_kind_check
  CHECK (meeting_kind IS NULL OR meeting_kind IN ('phone', 'video', 'in_person'));

-- ---------------------------------------------------------------------------
-- Plans: Private Access and Pilot include 3 named connections.
-- Custom has no default cap. A contract sets one with a billing override.
-- ---------------------------------------------------------------------------

UPDATE public.billing_plan_versions
SET entitlements = jsonb_set(entitlements, '{connectors}', '3'::jsonb)
WHERE plan_id IN ('private_access', 'pilot');

UPDATE public.billing_plan_versions
SET entitlements = jsonb_set(entitlements, '{connectors}', 'null'::jsonb)
WHERE plan_id = 'custom';

UPDATE public.billing_plans
SET bullets = array_replace(
  bullets,
  'One CRM connection, plus a webhook and file import',
  'Up to 3 connections. Webhooks, file imports, and records entered by hand do not count. All calendars together count as one.'
)
WHERE id = 'private_access';

-- ---------------------------------------------------------------------------
-- Catalog records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_connector_access (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, connector_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  connector_version text NOT NULL DEFAULT '1',
  external_account_id text,
  external_account_label text,
  connected_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  connected_at timestamptz,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'setting_up' CHECK (status IN (
    'setting_up', 'importing', 'live', 'delayed', 'needs_attention', 'needs_reconnecting', 'paused', 'disconnected'
  )),
  status_detail text,
  mapping_version integer NOT NULL DEFAULT 1,
  setup_step text,
  setup jsonb NOT NULL DEFAULT '{}'::jsonb,
  paused_by_member_id uuid,
  paused_at timestamptz,
  go_live_at timestamptz,
  last_update_at timestamptz,
  last_full_check_at timestamptz,
  counts_toward_limit boolean NOT NULL DEFAULT true,
  limit_group text,
  test_mode boolean NOT NULL DEFAULT false,
  author_removed_at timestamptz,
  removed_notice_at timestamptz,
  attention_notified_at timestamptz,
  reconnect_notice_step integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_connections_org_idx
  ON public.workspace_connections (org_id, connector_key, created_at);

CREATE INDEX IF NOT EXISTS workspace_connections_external_idx
  ON public.workspace_connections (connector_key, external_account_id)
  WHERE external_account_id IS NOT NULL AND status <> 'disconnected';

CREATE TABLE IF NOT EXISTS public.connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.workspace_connections (id) ON DELETE CASCADE,
  access_token_encrypted text,
  refresh_token_encrypted text,
  api_key_encrypted text,
  api_key_last4 text,
  api_key_added_at timestamptz,
  webhook_secret_encrypted text,
  webhook_secret_previous_encrypted text,
  webhook_secret_previous_until timestamptz,
  token_expires_at timestamptz,
  refresh_claimed_at timestamptz
);

COMMENT ON TABLE public.connection_secrets IS
  'Ciphertext only. Never select this from a signed-in session.';

CREATE TABLE IF NOT EXISTS public.connection_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  connector_key text NOT NULL,
  nonce_hash text NOT NULL,
  code_verifier_encrypted text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.connection_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.workspace_connections (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  status text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connection_state_events_recent_idx
  ON public.connection_state_events (connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.external_account_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_key text NOT NULL,
  external_account_id text NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  other_org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_account_exceptions_distinct CHECK (org_id <> other_org_id),
  CONSTRAINT external_account_exceptions_reason CHECK (char_length(btrim(reason)) >= 8)
);

CREATE TABLE IF NOT EXISTS public.connector_interest (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, connector_key)
);

CREATE TABLE IF NOT EXISTS public.connector_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid,
  tool_name text NOT NULL,
  wanted text NOT NULL,
  urgency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.connection_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inbound_endpoints (
  connection_id uuid PRIMARY KEY REFERENCES public.workspace_connections (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  public_token text NOT NULL UNIQUE,
  disabled_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.inbound_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.workspace_connections (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text,
  result text NOT NULL CHECK (result IN ('accepted', 'rejected', 'duplicate')),
  reason text,
  ignored_fields text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS inbound_deliveries_recent_idx
  ON public.inbound_deliveries (connection_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.inbound_event_ids (
  connection_id uuid NOT NULL REFERENCES public.workspace_connections (id) ON DELETE CASCADE,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.file_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.workspace_connections (id) ON DELETE SET NULL,
  file_hash text NOT NULL,
  record_kind text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('past', 'active')),
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  error_report text,
  raw_body text,
  raw_delete_after timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_imports_org_hash_key UNIQUE (org_id, file_hash)
);

CREATE TABLE IF NOT EXISTS public.connector_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.workspace_connections (id) ON DELETE CASCADE,
  external_id text NOT NULL,
  lead_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_people_external_key UNIQUE (connection_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.connection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  connection_id uuid,
  actor_member_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connection_audit_org_idx
  ON public.connection_audit (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Limits. Enforced here, not only on the screen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.connector_slot_count(p_org_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    count(*) FILTER (WHERE limit_group IS NULL)
    + count(DISTINCT limit_group) FILTER (WHERE limit_group IS NOT NULL)
  )::integer
  FROM public.workspace_connections
  WHERE org_id = p_org_id
    AND status <> 'disconnected'
    AND counts_toward_limit
    AND (p_exclude IS NULL OR id <> p_exclude);
$$;

CREATE OR REPLACE FUNCTION public.connector_entitlement(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := public.billing_limit(p_org_id, 'connectors');
  v_used integer := public.connector_slot_count(p_org_id, NULL);
  v_reset date := public.billing_period_end(p_org_id);
BEGIN
  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'limit', v_limit,
      'used', v_used,
      'remaining', 0,
      'reason', 'Your plan includes ' || v_limit || ' connections',
      'reset_on', v_reset
    );
  END IF;
  RETURN jsonb_build_object(
    'allowed', true,
    'limit', v_limit,
    'used', v_used,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE greatest(v_limit - v_used, 0) END,
    'reason', 'Within the plan.',
    'reset_on', v_reset
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_connections_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used integer;
  v_next integer;
  v_group_exists boolean;
  v_block text;
BEGIN
  v_block := public.external_account_block(NEW.connector_key, NEW.external_account_id, NEW.org_id);
  IF v_block IS NOT NULL AND NEW.status <> 'disconnected' THEN
    RAISE EXCEPTION '%', v_block USING ERRCODE = 'check_violation';
  END IF;
  IF NOT NEW.counts_toward_limit OR NEW.status = 'disconnected' THEN
    RETURN NEW;
  END IF;
  v_limit := public.billing_limit(NEW.org_id, 'connectors');
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;
  v_used := public.connector_slot_count(NEW.org_id, NEW.id);
  IF NEW.limit_group IS NULL THEN
    v_next := v_used + 1;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.workspace_connections
      WHERE org_id = NEW.org_id
        AND status <> 'disconnected'
        AND counts_toward_limit
        AND limit_group = NEW.limit_group
        AND id <> NEW.id
    ) INTO v_group_exists;
    v_next := CASE WHEN v_group_exists THEN v_used ELSE v_used + 1 END;
  END IF;
  IF v_next > v_limit AND v_next > v_used THEN
    RAISE EXCEPTION 'Your plan includes % connections', v_limit USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_connections_enforce_limit ON public.workspace_connections;
CREATE TRIGGER workspace_connections_enforce_limit
  BEFORE INSERT OR UPDATE OF status, counts_toward_limit, limit_group ON public.workspace_connections
  FOR EACH ROW EXECUTE FUNCTION public.workspace_connections_enforce_limit();

-- Patch entitlement_check so connectors uses the live count.
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

-- ---------------------------------------------------------------------------
-- The same external account on two workspaces needs a recorded exception.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.external_account_shared(
  p_connector text,
  p_external text,
  p_org_id uuid,
  p_other uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.external_account_exceptions e
    WHERE e.connector_key = p_connector
      AND e.external_account_id = p_external
      AND (
        (e.org_id = p_org_id AND e.other_org_id = p_other)
        OR (e.org_id = p_other AND e.other_org_id = p_org_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.external_account_block(
  p_connector text,
  p_external text,
  p_org_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other uuid;
BEGIN
  IF p_external IS NULL OR btrim(p_external) = '' THEN
    RETURN NULL;
  END IF;

  SELECT org_id INTO v_other
  FROM public.workspace_connections
  WHERE connector_key = p_connector
    AND external_account_id = p_external
    AND org_id <> p_org_id
    AND status <> 'disconnected'
  LIMIT 1;

  IF v_other IS NULL AND p_connector = 'gohighlevel' THEN
    SELECT id INTO v_other FROM public.organizations
    WHERE ghl_location_id = p_external AND id <> p_org_id
    LIMIT 1;
  END IF;

  IF v_other IS NULL AND p_connector = 'gohighlevel' THEN
    SELECT org_id INTO v_other FROM public.ghl_connections
    WHERE location_id = p_external AND org_id <> p_org_id AND status <> 'inactive'
    LIMIT 1;
  END IF;

  IF v_other IS NULL THEN
    RETURN NULL;
  END IF;
  IF public.external_account_shared(p_connector, p_external, p_org_id, v_other) THEN
    RETURN NULL;
  END IF;
  RETURN 'This account is already connected to another Vistrial workspace. Contact your team if you need help.';
END;
$$;

CREATE OR REPLACE FUNCTION public.link_ghl_location(p_org_id uuid, p_location_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block text;
  v_owner uuid;
BEGIN
  v_block := public.external_account_block('gohighlevel', p_location_id, p_org_id);
  IF v_block IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'location_claimed');
  END IF;

  SELECT id INTO v_owner FROM public.organizations
  WHERE ghl_location_id = p_location_id AND id <> p_org_id;

  IF v_owner IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'shared', true);
  END IF;

  UPDATE public.organizations
  SET ghl_location_id = p_location_id
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'org_missing');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'location_claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ghl_refresh(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.ghl_connections
  SET refresh_claimed_at = now()
  WHERE org_id = p_org_id
    AND (refresh_claimed_at IS NULL OR refresh_claimed_at < now() - interval '30 seconds')
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ghl_refresh(p_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ghl_connections SET refresh_claimed_at = NULL WHERE org_id = p_org_id;
$$;

CREATE OR REPLACE FUNCTION public.connector_enabled(p_org_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.workspace_connector_access WHERE org_id = p_org_id AND connector_key = p_key),
    p_key IN ('gohighlevel', 'generic_webhook', 'file_upload', 'manual')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_connections(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.active
      AND (m.seat = 'staff' OR m.role IN ('owner', 'member', 'client_viewer', 'admin'))
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants. Secret tables stay on the service role.
-- ---------------------------------------------------------------------------

ALTER TABLE public.workspace_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_connector_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_connections_select ON public.workspace_connections;
CREATE POLICY workspace_connections_select ON public.workspace_connections
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id));

DROP POLICY IF EXISTS connection_state_events_select ON public.connection_state_events;
CREATE POLICY connection_state_events_select ON public.connection_state_events
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id));

DROP POLICY IF EXISTS inbound_deliveries_select ON public.inbound_deliveries;
CREATE POLICY inbound_deliveries_select ON public.inbound_deliveries
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id));

DROP POLICY IF EXISTS connection_audit_select ON public.connection_audit;
CREATE POLICY connection_audit_select ON public.connection_audit
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id));

DROP POLICY IF EXISTS connector_interest_select ON public.connector_interest;
CREATE POLICY connector_interest_select ON public.connector_interest
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS connector_requests_select ON public.connector_requests;
CREATE POLICY connector_requests_select ON public.connector_requests
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS file_imports_select ON public.file_imports;
CREATE POLICY file_imports_select ON public.file_imports
  FOR SELECT TO authenticated
  USING (public.can_view_connections(org_id));

ALTER TABLE public.connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_event_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_account_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_people ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.connection_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.connection_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.connection_invites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inbound_endpoints FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inbound_event_ids FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.external_account_exceptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.connector_people FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.workspace_connections FROM anon;
REVOKE ALL ON public.connection_state_events FROM anon;
REVOKE ALL ON public.inbound_deliveries FROM anon;
REVOKE ALL ON public.connection_audit FROM anon;
REVOKE ALL ON public.connector_interest FROM anon;
REVOKE ALL ON public.connector_requests FROM anon;
REVOKE ALL ON public.file_imports FROM anon;
REVOKE ALL ON public.workspace_connector_access FROM anon;

GRANT SELECT ON public.workspace_connections TO authenticated;
GRANT SELECT ON public.connection_state_events TO authenticated;
GRANT SELECT ON public.inbound_deliveries TO authenticated;
GRANT SELECT ON public.connection_audit TO authenticated;
GRANT SELECT ON public.connector_interest TO authenticated;
GRANT SELECT ON public.connector_requests TO authenticated;
GRANT SELECT ON public.file_imports TO authenticated;
GRANT SELECT ON public.workspace_connector_access TO authenticated;

GRANT ALL ON public.workspace_connections TO service_role;
GRANT ALL ON public.connection_secrets TO service_role;
GRANT ALL ON public.connection_attempts TO service_role;
GRANT ALL ON public.connection_state_events TO service_role;
GRANT ALL ON public.external_account_exceptions TO service_role;
GRANT ALL ON public.connector_interest TO service_role;
GRANT ALL ON public.connector_requests TO service_role;
GRANT ALL ON public.connection_invites TO service_role;
GRANT ALL ON public.inbound_endpoints TO service_role;
GRANT ALL ON public.inbound_deliveries TO service_role;
GRANT ALL ON public.inbound_event_ids TO service_role;
GRANT ALL ON public.file_imports TO service_role;
GRANT ALL ON public.connector_people TO service_role;
GRANT ALL ON public.connection_audit TO service_role;
GRANT ALL ON public.workspace_connector_access TO service_role;

GRANT SELECT (can_manage_connections), UPDATE (can_manage_connections) ON public.org_members TO authenticated;

REVOKE ALL ON FUNCTION public.connector_slot_count(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connector_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.external_account_block(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ghl_refresh(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_ghl_refresh(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.connector_entitlement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.connector_slot_count(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.external_account_block(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ghl_refresh(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ghl_refresh(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.connector_enabled(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.external_account_shared(text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_connections(uuid) TO authenticated, service_role;
