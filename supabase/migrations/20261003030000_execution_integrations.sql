-- Execution integrations: Slack, Discord, Google Drive.
-- Places the agent writes into once a person has approved. Internal-facing:
-- nothing here ever reaches a prospect. Additive only, no enum changes.
--
-- Separate from source_connections on purpose. That table holds read-only
-- sources the portal loops over; these are write destinations with a
-- different revocation story (disconnect halts writes, never deletes).

-- ---------------------------------------------------------------------------
-- Connections. One row per workspace per destination kind.
-- Tokens are AES-GCM ciphertext written by the app. The authenticated role
-- is never granted the secret columns, so a signed-in user cannot read them
-- through the API even with a matching row-level policy.
-- ---------------------------------------------------------------------------

CREATE TABLE public.execution_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  -- Slack workspace name, Discord server name, or the Google account's folder.
  account_label text,
  -- Slack team id or Discord guild id. Null for Drive.
  external_account_id text,
  -- Slack bot token or Google access token. Ciphertext.
  secret_encrypted text,
  -- Google refresh token. Ciphertext.
  refresh_encrypted text,
  token_expires_at timestamptz,
  -- Channel id, or Drive root folder id. Chosen from a live list or picker.
  destination_id text,
  destination_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  last_verified_at timestamptz,
  connected_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT execution_connections_org_kind_key UNIQUE (org_id, kind),
  CONSTRAINT execution_connections_kind CHECK (kind IN ('slack', 'discord', 'google_drive')),
  CONSTRAINT execution_connections_status CHECK (status IN ('active', 'broken', 'inactive')),
  -- An active connection can always be written to or is waiting for a
  -- destination; it never keeps a token once inactive.
  CONSTRAINT execution_connections_inactive_has_no_tokens CHECK (
    status <> 'inactive' OR (secret_encrypted IS NULL AND refresh_encrypted IS NULL)
  )
);

COMMENT ON TABLE public.execution_connections IS
  'Write destinations (Slack, Discord, Drive). Disconnect clears tokens and halts writes; nothing already posted or filed is touched.';
COMMENT ON COLUMN public.execution_connections.secret_encrypted IS
  'Ciphertext only. Never selectable by the authenticated role.';

CREATE TRIGGER execution_connections_set_updated_at
  BEFORE UPDATE ON public.execution_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Write log. Every attempt, including the ones that were blocked. Records
-- what was posted or filed, where, and which approval authorised it.
-- ---------------------------------------------------------------------------

CREATE TABLE public.execution_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  operation text NOT NULL,
  action_type text NOT NULL REFERENCES public.approval_action_types (action_type),
  status text NOT NULL,
  destination_id text,
  destination_label text,
  -- The message text, or the folder path and file name that was filed.
  content text NOT NULL,
  -- Slack message timestamp, Discord message id, or Drive file id.
  external_ref text,
  authorization_kind text NOT NULL,
  approval_item_id uuid REFERENCES public.approval_items (id) ON DELETE SET NULL,
  authorized_by_member_id uuid REFERENCES public.org_members (id) ON DELETE SET NULL,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT execution_writes_kind CHECK (kind IN ('slack', 'discord', 'google_drive')),
  CONSTRAINT execution_writes_operation CHECK (
    operation IN ('slack.post_message', 'discord.post_message', 'drive.store_asset')
  ),
  CONSTRAINT execution_writes_status CHECK (status IN ('sent', 'failed', 'blocked')),
  CONSTRAINT execution_writes_authorization CHECK (
    authorization_kind IN ('approval_item', 'auto_run', 'owner_test')
  ),
  -- Sent without a named approval is only legal when the workspace allowed
  -- auto-run or an owner or admin clicked a test button themselves.
  CONSTRAINT execution_writes_sent_is_authorised CHECK (
    status <> 'sent'
    OR authorization_kind = 'auto_run'
    OR approval_item_id IS NOT NULL
    OR authorized_by_member_id IS NOT NULL
  )
);

COMMENT ON TABLE public.execution_writes IS
  'Append-only record of every write to Slack, Discord, or Drive. Service-role writes only.';

CREATE INDEX execution_writes_org_created_idx
  ON public.execution_writes (org_id, created_at DESC);
CREATE INDEX execution_writes_item_idx
  ON public.execution_writes (approval_item_id)
  WHERE approval_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Approval action types. Internal-facing, so they do not reach people, and
-- ask first like every new action type.
-- ---------------------------------------------------------------------------

INSERT INTO public.approval_action_types (action_type, area, reaches_people, default_mode)
VALUES
  ('slack_post', 'sales', false, 'ask_first'),
  ('discord_post', 'sales', false, 'ask_first'),
  ('drive_store', 'sales', false, 'ask_first')
ON CONFLICT (action_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE public.execution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_writes ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_connections_select
  ON public.execution_connections FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

CREATE POLICY execution_writes_select
  ON public.execution_writes FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id, 'owner', 'admin'));

REVOKE ALL ON TABLE public.execution_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.execution_writes FROM PUBLIC, anon, authenticated;

-- Every column except the token ciphertext.
GRANT SELECT (
  id, org_id, kind, status, account_label, external_account_id,
  token_expires_at, destination_id, destination_label, metadata,
  last_error, last_verified_at, connected_by_member_id, created_at, updated_at
) ON public.execution_connections TO authenticated;

GRANT SELECT ON public.execution_writes TO authenticated;

GRANT ALL ON TABLE public.execution_connections TO service_role;
GRANT ALL ON TABLE public.execution_writes TO service_role;
