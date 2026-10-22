import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { connectorByKey, type ConnectorDefinition } from "@/lib/connectors/catalog";
import { encryptSecret, decryptSecret } from "@/lib/ghl/crypto";
import type { GhlDb } from "@/lib/ghl/tokens";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type LooseResult = { data: unknown; error: { message: string; code?: string } | null };
type LooseQuery = PromiseLike<LooseResult> & {
  select: (columns?: string) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  neq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, value: unknown[]) => LooseQuery;
  is: (column: string, value: null) => LooseQuery;
  not: (column: string, operator: string, value: unknown) => LooseQuery;
  lte: (column: string, value: unknown) => LooseQuery;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  maybeSingle: () => Promise<LooseResult>;
  single: () => Promise<LooseResult>;
};

type Loose = {
  from: (table: string) => {
    select: (columns?: string) => LooseQuery;
    insert: (row: object | object[]) => LooseQuery;
    update: (row: object) => LooseQuery;
    delete: () => LooseQuery;
    upsert: (row: object, options?: { onConflict?: string }) => LooseQuery;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<LooseResult>;
};

export type ConnectionRow = {
  id: string;
  org_id: string;
  connector_key: string;
  connector_version: string;
  external_account_id: string | null;
  external_account_label: string | null;
  connected_by_member_id: string | null;
  connected_at: string | null;
  granted_scopes: string[];
  status: string;
  status_detail: string | null;
  mapping_version: number;
  setup_step: string | null;
  setup: Record<string, unknown>;
  paused_at: string | null;
  go_live_at: string | null;
  last_update_at: string | null;
  last_full_check_at: string | null;
  counts_toward_limit: boolean;
  limit_group: string | null;
  test_mode: boolean;
  author_removed_at: string | null;
  reconnect_notice_step: number;
  attention_notified_at: string | null;
  updated_at: string;
  created_at: string;
};

function db(): Loose {
  return getSupabaseAdmin() as unknown as Loose;
}

function rows<T>(result: LooseResult): T[] {
  return (result.data as T[] | null) ?? [];
}

export async function writeAudit(args: {
  orgId: string;
  connectionId?: string | null;
  actorMemberId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await db().from("connection_audit").insert({
    org_id: args.orgId,
    connection_id: args.connectionId ?? null,
    actor_member_id: args.actorMemberId ?? null,
    action: args.action,
    detail: args.detail ?? {},
  });
}

export async function listConnections(orgId: string): Promise<ConnectionRow[]> {
  const result = await db()
    .from("workspace_connections")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  return rows<ConnectionRow>(result);
}

export async function loadConnection(orgId: string, id: string): Promise<ConnectionRow | null> {
  const result = await db()
    .from("workspace_connections")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (result.data as ConnectionRow | null) ?? null;
}

export type Entitlement = {
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  reason: string;
};

export async function connectorEntitlement(orgId: string): Promise<Entitlement> {
  const result = await db().rpc("entitlement_check", { p_org_id: orgId, p_key: "connectors" });
  const row = (result.data ?? {}) as Partial<Entitlement> & { reason?: string };
  return {
    allowed: row.allowed !== false,
    limit: typeof row.limit === "number" ? row.limit : null,
    used: typeof row.used === "number" ? row.used : 0,
    remaining: typeof row.remaining === "number" ? row.remaining : null,
    reason: row.reason ?? "Within the plan.",
  };
}

export async function connectorEnabled(orgId: string, key: string): Promise<boolean> {
  const connector = connectorByKey(key);
  if (!connector || connector.availability !== "connect") return false;
  const result = await db().rpc("connector_enabled", { p_org_id: orgId, p_key: key });
  if (result.error) return connector.defaultEnabled;
  return result.data === true;
}

export async function externalAccountBlock(connectorKey: string, externalId: string, orgId: string): Promise<string | null> {
  const result = await db().rpc("external_account_block", {
    p_connector: connectorKey,
    p_external: externalId,
    p_org_id: orgId,
  });
  return typeof result.data === "string" && result.data ? result.data : null;
}

export async function setConnectorAccess(args: {
  orgId: string;
  connectorKey: string;
  enabled: boolean;
  actorId: string | null;
}): Promise<void> {
  await db().from("workspace_connector_access").upsert(
    {
      org_id: args.orgId,
      connector_key: args.connectorKey,
      enabled: args.enabled,
      updated_by: args.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,connector_key" }
  );
  await writeAudit({
    orgId: args.orgId,
    actorMemberId: null,
    action: args.enabled ? "connector.enabled" : "connector.disabled",
    detail: { connector: args.connectorKey },
  });
}

export async function allowSharedAccount(args: {
  connectorKey: string;
  externalAccountId: string;
  orgId: string;
  otherOrgId: string;
  reason: string;
  actorId: string | null;
}): Promise<void> {
  await db().from("external_account_exceptions").insert({
    connector_key: args.connectorKey,
    external_account_id: args.externalAccountId,
    org_id: args.orgId,
    other_org_id: args.otherOrgId,
    reason: args.reason,
    created_by: args.actorId,
  });
  await writeAudit({
    orgId: args.orgId,
    action: "external_account.shared",
    detail: {
      connector: args.connectorKey,
      external_account_id: args.externalAccountId,
      other_org_id: args.otherOrgId,
      reason: args.reason,
    },
  });
}

export async function upsertCatalogConnection(args: {
  orgId: string;
  connector: ConnectorDefinition;
  memberId: string | null;
  externalAccountId?: string | null;
  externalAccountLabel?: string | null;
  grantedScopes?: string[];
  status?: string;
  statusDetail?: string | null;
  testMode?: boolean;
  setup?: Record<string, unknown>;
}): Promise<ConnectionRow> {
  const existing = args.externalAccountId
    ? rows<ConnectionRow>(
        await db()
          .from("workspace_connections")
          .select("*")
          .eq("org_id", args.orgId)
          .eq("connector_key", args.connector.key)
          .eq("external_account_id", args.externalAccountId)
          .neq("status", "disconnected")
          .limit(1)
      )[0]
    : null;

  if (!existing && args.externalAccountId) {
    const block = await externalAccountBlock(args.connector.key, args.externalAccountId, args.orgId);
    if (block) throw new Error(block);
  }

  const now = new Date().toISOString();
  const patch = {
    external_account_id: args.externalAccountId ?? existing?.external_account_id ?? null,
    external_account_label: args.externalAccountLabel ?? existing?.external_account_label ?? null,
    granted_scopes: args.grantedScopes ?? existing?.granted_scopes ?? [],
    status: args.status ?? existing?.status ?? "setting_up",
    status_detail: args.statusDetail ?? null,
    test_mode: args.testMode ?? args.connector.key === "google_calendar",
    setup: args.setup ?? existing?.setup ?? {},
    connected_by_member_id: args.memberId,
    connected_at: now,
    updated_at: now,
  };

  if (existing) {
    const updated = await db().from("workspace_connections").update(patch).eq("id", existing.id).select("*").maybeSingle();
    await writeAudit({
      orgId: args.orgId,
      connectionId: existing.id,
      actorMemberId: args.memberId,
      action: "connection.reconnected",
      detail: { connector: args.connector.key },
    });
    return (updated.data as ConnectionRow) ?? existing;
  }

  const inserted = await db()
    .from("workspace_connections")
    .insert({
      org_id: args.orgId,
      connector_key: args.connector.key,
      connector_version: args.connector.version,
      counts_toward_limit: args.connector.countsTowardLimit,
      limit_group: args.connector.limitGroup,
      ...patch,
    })
    .select("*")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  const row = inserted.data as ConnectionRow;
  await db().from("connection_state_events").insert({
    connection_id: row.id,
    org_id: args.orgId,
    status: row.status,
    detail: row.status_detail,
  });
  await writeAudit({
    orgId: args.orgId,
    connectionId: row.id,
    actorMemberId: args.memberId,
    action: "connection.connected",
    detail: { connector: args.connector.key },
  });
  return row;
}

export async function setConnectionStatus(args: {
  orgId: string;
  connectionId: string;
  status: string;
  detail?: string | null;
  actorMemberId?: string | null;
  action: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await db()
    .from("workspace_connections")
    .update({ status: args.status, status_detail: args.detail ?? null, updated_at: now })
    .eq("id", args.connectionId)
    .eq("org_id", args.orgId);
  await db().from("connection_state_events").insert({
    connection_id: args.connectionId,
    org_id: args.orgId,
    status: args.status,
    detail: args.detail ?? null,
  });
  await writeAudit({
    orgId: args.orgId,
    connectionId: args.connectionId,
    actorMemberId: args.actorMemberId,
    action: args.action,
    detail: { status: args.status },
  });
}

export async function saveApiKey(connectionId: string, secret: string): Promise<void> {
  await db().from("connection_secrets").upsert({
    connection_id: connectionId,
    api_key_encrypted: encryptSecret(secret),
    api_key_last4: secret.trim().slice(-4),
    api_key_added_at: new Date().toISOString(),
  });
}

export async function saveOAuthTokens(connectionId: string, access: string, refresh: string | null, expiresAt: string | null): Promise<void> {
  await db().from("connection_secrets").upsert({
    connection_id: connectionId,
    access_token_encrypted: encryptSecret(access),
    refresh_token_encrypted: refresh ? encryptSecret(refresh) : null,
    token_expires_at: expiresAt,
  });
}

export async function readApiKey(connectionId: string): Promise<{ last4: string | null; addedAt: string | null; secret: string | null }> {
  const result = await db()
    .from("connection_secrets")
    .select("api_key_encrypted, api_key_last4, api_key_added_at")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const row = result.data as { api_key_encrypted: string | null; api_key_last4: string | null; api_key_added_at: string | null } | null;
  if (!row) return { last4: null, addedAt: null, secret: null };
  return {
    last4: row.api_key_last4,
    addedAt: row.api_key_added_at,
    secret: row.api_key_encrypted ? decryptSecret(row.api_key_encrypted) : null,
  };
}

export async function readAccessToken(connectionId: string): Promise<string | null> {
  const result = await db()
    .from("connection_secrets")
    .select("access_token_encrypted")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const row = result.data as { access_token_encrypted: string | null } | null;
  return row?.access_token_encrypted ? decryptSecret(row.access_token_encrypted) : null;
}

export async function readConnectionSetup(connectionId: string): Promise<Record<string, unknown>> {
  const result = await db().from("workspace_connections").select("setup").eq("id", connectionId).maybeSingle();
  return ((result.data as { setup?: Record<string, unknown> } | null)?.setup ?? {}) as Record<string, unknown>;
}

export async function ensureWebhook(connectionId: string, orgId: string): Promise<{ token: string; secret: string | null; previousUntil: string | null }> {
  const existing = await db().from("inbound_endpoints").select("public_token").eq("connection_id", connectionId).maybeSingle();
  const endpoint = existing.data as { public_token: string } | null;
  const token = endpoint?.public_token ?? randomBytes(24).toString("hex");
  if (!endpoint) {
    await db().from("inbound_endpoints").insert({ connection_id: connectionId, org_id: orgId, public_token: token });
  }
  const secrets = await db()
    .from("connection_secrets")
    .select("webhook_secret_encrypted, webhook_secret_previous_until")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const secretRow = secrets.data as { webhook_secret_encrypted: string | null; webhook_secret_previous_until: string | null } | null;
  if (secretRow?.webhook_secret_encrypted) {
    return {
      token,
      secret: null,
      previousUntil: secretRow.webhook_secret_previous_until,
    };
  }
  const secret = randomBytes(24).toString("hex");
  await db().from("connection_secrets").upsert({
    connection_id: connectionId,
    webhook_secret_encrypted: encryptSecret(secret),
  });
  return { token, secret, previousUntil: null };
}

export async function rotateWebhookSecret(connectionId: string, orgId: string, actorMemberId: string | null): Promise<string> {
  const current = await db()
    .from("connection_secrets")
    .select("webhook_secret_encrypted")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const row = current.data as { webhook_secret_encrypted: string | null } | null;
  const next = randomBytes(24).toString("hex");
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db().from("connection_secrets").upsert({
    connection_id: connectionId,
    webhook_secret_encrypted: encryptSecret(next),
    webhook_secret_previous_encrypted: row?.webhook_secret_encrypted ?? null,
    webhook_secret_previous_until: until,
  });
  await writeAudit({ orgId, connectionId, actorMemberId, action: "webhook.secret_rotated", detail: { previous_until: until } });
  return next;
}

export async function webhookSecrets(connectionId: string): Promise<{ current: string | null; previous: string | null; previousUntil: string | null }> {
  const result = await db()
    .from("connection_secrets")
    .select("webhook_secret_encrypted, webhook_secret_previous_encrypted, webhook_secret_previous_until")
    .eq("connection_id", connectionId)
    .maybeSingle();
  const row = result.data as {
    webhook_secret_encrypted: string | null;
    webhook_secret_previous_encrypted: string | null;
    webhook_secret_previous_until: string | null;
  } | null;
  return {
    current: row?.webhook_secret_encrypted ? decryptSecret(row.webhook_secret_encrypted) : null,
    previous: row?.webhook_secret_previous_encrypted ? decryptSecret(row.webhook_secret_previous_encrypted) : null,
    previousUntil: row?.webhook_secret_previous_until ?? null,
  };
}

export async function endpointForToken(token: string): Promise<{ connectionId: string; orgId: string; disabled: boolean } | null> {
  const result = await db()
    .from("inbound_endpoints")
    .select("connection_id, org_id, disabled_at")
    .eq("public_token", token)
    .maybeSingle();
  const row = result.data as { connection_id: string; org_id: string; disabled_at: string | null } | null;
  if (!row) return null;
  return { connectionId: row.connection_id, orgId: row.org_id, disabled: Boolean(row.disabled_at) };
}

export async function rememberEvent(connectionId: string, eventId: string): Promise<boolean> {
  const inserted = await db().from("inbound_event_ids").insert({ connection_id: connectionId, event_id: eventId }).select("event_id");
  if (inserted.error?.code === "23505") return false;
  return !inserted.error;
}

export async function logDelivery(args: {
  connectionId: string;
  orgId: string;
  eventType: string | null;
  result: "accepted" | "rejected" | "duplicate";
  reason: string;
  ignored: string[];
}): Promise<void> {
  await db().from("inbound_deliveries").insert({
    connection_id: args.connectionId,
    org_id: args.orgId,
    event_type: args.eventType,
    result: args.result,
    reason: args.reason,
    ignored_fields: args.ignored,
  });
  const recent = await db()
    .from("inbound_deliveries")
    .select("id")
    .eq("connection_id", args.connectionId)
    .order("received_at", { ascending: false })
    .limit(80);
  const extra = rows<{ id: string }>(recent).slice(50);
  for (const row of extra) {
    await db().from("inbound_deliveries").delete().eq("id", row.id);
  }
}

export async function recentDeliveries(connectionId: string, orgId: string): Promise<Array<{ received_at: string; event_type: string | null; result: string; reason: string | null; ignored_fields: string[] }>> {
  const result = await db()
    .from("inbound_deliveries")
    .select("received_at, event_type, result, reason, ignored_fields")
    .eq("connection_id", connectionId)
    .eq("org_id", orgId)
    .order("received_at", { ascending: false })
    .limit(50);
  return rows(result);
}

export async function stateHistory(connectionId: string, orgId: string): Promise<Array<{ status: string; detail: string | null; created_at: string }>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db()
    .from("connection_state_events")
    .select("status, detail, created_at")
    .eq("connection_id", connectionId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  return rows<{ status: string; detail: string | null; created_at: string }>(result).filter((row) => row.created_at >= since);
}

export async function disconnectConnection(args: {
  orgId: string;
  connectionId: string;
  actorMemberId: string | null;
  detail: string;
}): Promise<void> {
  await db().from("connection_secrets").delete().eq("connection_id", args.connectionId);
  await db().from("inbound_endpoints").update({ disabled_at: new Date().toISOString() }).eq("connection_id", args.connectionId);
  await setConnectionStatus({
    orgId: args.orgId,
    connectionId: args.connectionId,
    status: "disconnected",
    detail: args.detail,
    actorMemberId: args.actorMemberId,
    action: "connection.disconnected",
  });
}

export async function pauseConnection(orgId: string, connectionId: string, actorMemberId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db()
    .from("workspace_connections")
    .update({ status: "paused", paused_at: now, paused_by_member_id: actorMemberId, updated_at: now })
    .eq("id", connectionId)
    .eq("org_id", orgId);
  await writeAudit({ orgId, connectionId, actorMemberId, action: "connection.paused" });
}

export async function resumeConnection(orgId: string, connectionId: string, actorMemberId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db()
    .from("workspace_connections")
    .update({ status: "live", go_live_at: now, paused_at: null, updated_at: now, status_detail: null })
    .eq("id", connectionId)
    .eq("org_id", orgId);
  await writeAudit({ orgId, connectionId, actorMemberId, action: "connection.resumed" });
}

export async function saveSetup(orgId: string, connectionId: string, setup: Record<string, unknown>, step: string, actorMemberId: string | null): Promise<void> {
  const current = await loadConnection(orgId, connectionId);
  const version = (current?.mapping_version ?? 1) + 1;
  await db()
    .from("workspace_connections")
    .update({ setup, setup_step: step, mapping_version: version, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("org_id", orgId);
  await writeAudit({
    orgId,
    connectionId,
    actorMemberId,
    action: "connection.setup_edited",
    detail: { step, mapping_version: version },
  });
}

export async function recordInterest(orgId: string, connectorKey: string, memberId: string | null): Promise<void> {
  await db().from("connector_interest").upsert(
    { org_id: orgId, connector_key: connectorKey, member_id: memberId },
    { onConflict: "org_id,connector_key" }
  );
}

export async function recordRequest(args: {
  orgId: string;
  memberId: string | null;
  toolName: string;
  wanted: string;
  urgency: string;
}): Promise<void> {
  await db().from("connector_requests").insert({
    org_id: args.orgId,
    member_id: args.memberId,
    tool_name: args.toolName.slice(0, 120),
    wanted: args.wanted.slice(0, 1000),
    urgency: args.urgency.slice(0, 40),
  });
}

export async function createConnectInvite(args: {
  orgId: string;
  connectorKey: string;
  actorId: string | null;
}): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db().from("connection_invites").insert({
    org_id: args.orgId,
    connector_key: args.connectorKey,
    token_hash: createHash("sha256").update(token).digest("hex"),
    created_by: args.actorId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await writeAudit({
    orgId: args.orgId,
    action: "connection.invite_created",
    detail: { connector: args.connectorKey },
  });
  return token;
}

export async function inviteOrg(token: string): Promise<{ orgId: string; connectorKey: string } | null> {
  const hash = createHash("sha256").update(token).digest("hex");
  const result = await db()
    .from("connection_invites")
    .select("org_id, connector_key, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  const row = result.data as { org_id: string; connector_key: string; expires_at: string } | null;
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  return { orgId: row.org_id, connectorKey: row.connector_key };
}

export async function unhealthyTools(orgId: string): Promise<string[]> {
  const list = await listConnections(orgId);
  return list
    .filter((row) => row.status !== "live" && row.status !== "disconnected" && row.status !== "setting_up")
    .map((row) => connectorByKey(row.connector_key)?.name ?? row.connector_key);
}

export async function ghlCatalogLive(orgId: string): Promise<boolean> {
  const list = await listConnections(orgId);
  const ghl = list.filter((row) => row.connector_key === "gohighlevel" && row.status !== "disconnected");
  if (ghl.length === 0) return true;
  return ghl.some((row) => row.status === "live");
}

export async function markGhlDisconnected(dbClient: GhlDb, orgId: string, locationId: string | null, detail: string): Promise<void> {
  const list = await listConnections(orgId);
  const matches = list.filter((row) => {
    if (row.connector_key !== "gohighlevel" || row.status === "disconnected") return false;
    if (!locationId) return true;
    return row.external_account_id === locationId || row.external_account_id === null;
  });
  for (const row of matches) {
    await disconnectConnection({ orgId, connectionId: row.id, actorMemberId: null, detail });
  }
  void dbClient;
  await notifyOwners({
    orgId,
    title: "GoHighLevel was disconnected",
    body: "Vistrial lost access because the app was removed in GoHighLevel. Reconnect to keep your data up to date.",
    href: "/app/settings/connections/gohighlevel",
    dedupeKey: `ghl-uninstall:${orgId}:${locationId ?? "all"}`,
    emergency: true,
  });
}

async function notifyOwners(args: {
  orgId: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  emergency?: boolean;
  eventType?: "crm_broken" | "onboarding" | "workspace_notice";
}): Promise<void> {
  const { data } = await getSupabaseAdmin()
    .from("org_members")
    .select("id, user_id")
    .eq("org_id", args.orgId)
    .eq("role", "owner")
    .eq("active", true);
  for (const owner of data ?? []) {
    if (!owner.user_id) continue;
    await enqueueNotification(getSupabaseAdmin(), {
      orgId: args.orgId,
      eventType: args.eventType ?? "crm_broken",
      channel: "email",
      recipientUserId: owner.user_id,
      recipientMemberId: owner.id,
      subjectIds: [],
      title: args.title,
      body: args.body,
      href: args.href,
      dedupeKey: `${args.dedupeKey}:${owner.id}`,
      isEmergency: args.emergency ?? false,
    });
  }
}

export async function notifyReconnect(args: {
  orgId: string;
  connectorName: string;
  connectionId: string;
  testMode: boolean;
  step: number;
}): Promise<void> {
  const body = args.testMode
    ? "This calendar connection is in testing and needs to be reconnected about once a week until Google finishes its review."
    : `Vistrial lost access to ${args.connectorName}. Reconnect to keep your data up to date.`;
  await notifyOwners({
    orgId: args.orgId,
    title: `${args.connectorName} needs reconnecting`,
    body,
    href: `/app/settings/connections/view/${args.connectionId}`,
    dedupeKey: `reconnect:${args.connectionId}:${args.step}`,
    emergency: !args.testMode,
  });
}

export async function fileAlreadyImported(orgId: string, fileHash: string): Promise<boolean> {
  const result = await db().from("file_imports").select("id").eq("org_id", orgId).eq("file_hash", fileHash).maybeSingle();
  return Boolean(result.data);
}

export async function saveFileImport(args: {
  orgId: string;
  connectionId: string | null;
  fileHash: string;
  recordKind: string;
  mode: "past" | "active";
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  errorReport: string;
  rawBody: string;
  actorId: string | null;
}): Promise<void> {
  await db().from("file_imports").insert({
    org_id: args.orgId,
    connection_id: args.connectionId,
    file_hash: args.fileHash,
    record_kind: args.recordKind,
    mode: args.mode,
    created_count: args.created,
    updated_count: args.updated,
    skipped_count: args.skipped,
    rejected_count: args.rejected,
    error_report: args.errorReport,
    raw_body: args.rawBody,
    raw_delete_after: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: args.actorId,
  });
}

export async function purgeExpiredRawFiles(): Promise<number> {
  const now = new Date().toISOString();
  const result = await db().from("file_imports").select("id").not("raw_body", "is", null).lte("raw_delete_after", now).limit(100);
  const due = rows<{ id: string }>(result);
  for (const row of due) {
    await db().from("file_imports").update({ raw_body: null }).eq("id", row.id);
  }
  return due.length;
}
