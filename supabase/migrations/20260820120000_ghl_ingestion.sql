-- CRM connection, webhook ingest, outbound dispatch queue, and GHL field maps.
-- Tokens live in ghl_connections and are never granted to authenticated clients.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.ghl_connection_status AS ENUM ('active', 'broken', 'inactive');

CREATE TYPE public.ghl_dispatch_status AS ENUM ('queued', 'sent', 'failed', 'suppressed');

CREATE TYPE public.webhook_event_status AS ENUM ('pending', 'processed', 'dead', 'rejected');

-- ---------------------------------------------------------------------------
-- Lead / member / call keys used by ingest
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_members
  ADD COLUMN ghl_user_id text;

CREATE UNIQUE INDEX org_members_org_ghl_user_id_key
  ON public.org_members (org_id, ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

ALTER TABLE public.calls
  ADD COLUMN ghl_appointment_id text;

CREATE UNIQUE INDEX calls_org_ghl_appointment_id_key
  ON public.calls (org_id, ghl_appointment_id)
  WHERE ghl_appointment_id IS NOT NULL;

CREATE UNIQUE INDEX touches_org_ghl_message_id_key
  ON public.touches (org_id, ghl_message_id)
  WHERE ghl_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Webhook events: provider id, status, retry, contact ordering key
-- ---------------------------------------------------------------------------

ALTER TABLE public.webhook_events
  ADD COLUMN provider_event_id text,
  ADD COLUMN contact_key text,
  ADD COLUMN status public.webhook_event_status NOT NULL DEFAULT 'pending',
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX webhook_events_source_provider_id_key
  ON public.webhook_events (source, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX webhook_events_pending_contact_idx
  ON public.webhook_events (contact_key, received_at)
  WHERE processed = false AND status = 'pending';

CREATE INDEX webhook_events_org_received_idx
  ON public.webhook_events (org_id, received_at DESC);

CREATE INDEX webhook_events_dead_org_idx
  ON public.webhook_events (org_id, received_at DESC)
  WHERE status = 'dead';

COMMENT ON COLUMN public.webhook_events.provider_event_id IS
  'GHL webhookId (or a hash of the raw body when webhookId is absent). Dedupes retries.';

COMMENT ON COLUMN public.webhook_events.contact_key IS
  'locationId:contactId when present. Processing serializes on this key.';

-- ---------------------------------------------------------------------------
-- Connections (encrypted tokens) and short-lived OAuth sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.ghl_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  location_id text,
  location_name text,
  company_id text,
  webhook_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status public.ghl_connection_status NOT NULL DEFAULT 'inactive',
  last_verified_at timestamptz,
  last_refresh_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_connections_org_id_key UNIQUE (org_id)
);

CREATE UNIQUE INDEX ghl_connections_active_location_key
  ON public.ghl_connections (location_id)
  WHERE location_id IS NOT NULL AND status <> 'inactive';

COMMENT ON TABLE public.ghl_connections IS
  'Per-org GHL OAuth connection. Token columns are service-role only.';

COMMENT ON COLUMN public.ghl_connections.access_token_encrypted IS
  'AES-256-GCM ciphertext. Never log, return, or render.';

COMMENT ON COLUMN public.ghl_connections.refresh_token_encrypted IS
  'AES-256-GCM ciphertext. Never log, return, or render.';

CREATE TRIGGER ghl_connections_set_updated_at
  BEFORE UPDATE ON public.ghl_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ghl_oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members (id) ON DELETE CASCADE,
  company_id text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ghl_oauth_sessions_org_idx ON public.ghl_oauth_sessions (org_id);

COMMENT ON TABLE public.ghl_oauth_sessions IS
  'Short-lived agency tokens while an admin picks a location. Service-role only.';

-- ---------------------------------------------------------------------------
-- Field mapping: GHL custom fields -> application_answers keys
-- ---------------------------------------------------------------------------

CREATE TABLE public.ghl_field_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  ghl_field_id text,
  ghl_field_key text,
  answer_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_field_maps_answer_key_present CHECK (char_length(trim(answer_key)) > 0),
  CONSTRAINT ghl_field_maps_has_source CHECK (
    (ghl_field_id IS NOT NULL AND char_length(trim(ghl_field_id)) > 0)
    OR (ghl_field_key IS NOT NULL AND char_length(trim(ghl_field_key)) > 0)
  )
);

CREATE UNIQUE INDEX ghl_field_maps_org_field_id_key
  ON public.ghl_field_maps (org_id, ghl_field_id)
  WHERE ghl_field_id IS NOT NULL;

CREATE UNIQUE INDEX ghl_field_maps_org_field_key_key
  ON public.ghl_field_maps (org_id, ghl_field_key)
  WHERE ghl_field_key IS NOT NULL;

CREATE INDEX ghl_field_maps_org_idx ON public.ghl_field_maps (org_id);

CREATE TRIGGER ghl_field_maps_set_updated_at
  BEFORE UPDATE ON public.ghl_field_maps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Outbound dispatch queue and per-org rate window
-- ---------------------------------------------------------------------------

CREATE TABLE public.ghl_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  channel public.touch_channel NOT NULL,
  body_text text,
  email_subject text,
  actor_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  status public.ghl_dispatch_status NOT NULL DEFAULT 'queued',
  failure_reason text,
  ghl_message_id text,
  idempotency_key text,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_dispatches_lead_org_fkey FOREIGN KEY (lead_id, org_id)
    REFERENCES public.leads (id, org_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ghl_dispatches_idempotency_key
  ON public.ghl_dispatches (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX ghl_dispatches_ghl_message_id_key
  ON public.ghl_dispatches (org_id, ghl_message_id)
  WHERE ghl_message_id IS NOT NULL;

CREATE INDEX ghl_dispatches_queued_idx
  ON public.ghl_dispatches (org_id, available_at)
  WHERE status = 'queued';

COMMENT ON TABLE public.ghl_dispatches IS
  'Outbound send attempts. body_text is cleared after send. A failed send never creates a touch.';

CREATE TABLE public.ghl_rate_windows (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  paused_until timestamptz
);

CREATE TABLE public.ghl_contact_locks (
  contact_key text PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ingestion_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail text NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingestion_alerts_org_kind_key UNIQUE (org_id, kind)
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_ghl_location(p_org_id uuid, p_location_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.unlink_ghl_location(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organizations
  SET ghl_location_id = NULL
  WHERE id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ghl_contact_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  locked text;
BEGIN
  FOR rec IN
    SELECT COALESCE(contact_key, 'id:' || id::text) AS k
    FROM public.webhook_events
    WHERE source = 'ghl'
      AND processed = false
      AND status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY received_at ASC
    LIMIT 80
  LOOP
    INSERT INTO public.ghl_contact_locks (contact_key, claimed_at)
    VALUES (rec.k, now())
    ON CONFLICT (contact_key) DO UPDATE
      SET claimed_at = EXCLUDED.claimed_at
      WHERE public.ghl_contact_locks.claimed_at < now() - interval '5 minutes'
    RETURNING contact_key INTO locked;

    IF locked IS NOT NULL THEN
      RETURN locked;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ghl_contact_key(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.ghl_contact_locks WHERE contact_key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.try_consume_ghl_rate(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_count integer;
  v_paused timestamptz;
  v_limit integer := 80;
  v_secs integer := 10;
BEGIN
  INSERT INTO public.ghl_rate_windows (org_id, window_started_at, request_count)
  VALUES (p_org_id, now(), 0)
  ON CONFLICT (org_id) DO NOTHING;

  SELECT window_started_at, request_count, paused_until
  INTO v_window, v_count, v_paused
  FROM public.ghl_rate_windows
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF v_paused IS NOT NULL AND v_paused > now() THEN
    RETURN false;
  END IF;

  IF v_window < now() - make_interval(secs => v_secs) THEN
    UPDATE public.ghl_rate_windows
    SET window_started_at = now(), request_count = 1
    WHERE org_id = p_org_id;
    RETURN true;
  END IF;

  IF v_count >= v_limit THEN
    RETURN false;
  END IF;

  UPDATE public.ghl_rate_windows
  SET request_count = request_count + 1
  WHERE org_id = p_org_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_ghl_location(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_ghl_location(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ghl_contact_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_ghl_contact_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_consume_ghl_rate(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.link_ghl_location(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_ghl_location(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ghl_contact_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ghl_contact_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_consume_ghl_rate(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.ghl_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_field_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_rate_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_contact_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_alerts ENABLE ROW LEVEL SECURITY;

-- Non-secret connection columns are visible to owner/admin. Token columns are
-- not granted to authenticated, so SELECT * cannot return them.
CREATE POLICY ghl_connections_select
  ON public.ghl_connections
  FOR SELECT
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY ghl_field_maps_select
  ON public.ghl_field_maps
  FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY ghl_field_maps_write
  ON public.ghl_field_maps
  FOR ALL
  TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'))
  WITH CHECK (public.user_has_org_role(org_id, 'owner', 'admin'));

GRANT SELECT ON public.ghl_oauth_sessions TO authenticated;
GRANT SELECT ON public.ghl_dispatches TO authenticated;
GRANT SELECT ON public.ghl_rate_windows TO authenticated;
GRANT SELECT ON public.ghl_contact_locks TO authenticated;
GRANT SELECT ON public.ingestion_alerts TO authenticated;

REVOKE ALL ON public.ghl_connections FROM PUBLIC, authenticated;
GRANT SELECT (
  id,
  org_id,
  location_id,
  location_name,
  company_id,
  webhook_id,
  status,
  last_verified_at,
  last_refresh_error,
  token_expires_at,
  created_at,
  updated_at
) ON public.ghl_connections TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghl_field_maps TO authenticated;

GRANT ALL ON public.ghl_connections TO service_role;
GRANT ALL ON public.ghl_oauth_sessions TO service_role;
GRANT ALL ON public.ghl_field_maps TO service_role;
GRANT ALL ON public.ghl_dispatches TO service_role;
GRANT ALL ON public.ghl_rate_windows TO service_role;
GRANT ALL ON public.ghl_contact_locks TO service_role;
GRANT ALL ON public.ingestion_alerts TO service_role;
GRANT ALL ON public.webhook_events TO service_role;
