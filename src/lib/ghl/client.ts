import "server-only";

import { GHL_WEBHOOK_EVENTS, TOKEN_REFRESH_CRON_MS } from "@/lib/ghl/constants";
import { ghlApiBase, ghlClientId, ghlClientSecret, ghlOAuthRedirectUri, ghlWebhookUrl } from "@/lib/ghl/env";
import { ghlError, ghlLog, ghlWarn } from "@/lib/ghl/log";
import {
  decryptConnectionTokens,
  loadConnection,
  markConnectionBroken,
  persistTokens,
  tokensNeedRefresh,
  type GhlDb,
} from "@/lib/ghl/tokens";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  userType?: string;
  user_type?: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
};

export type GhlTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userType: "Location" | "Company" | string;
  locationId: string | null;
  companyId: string | null;
  userId: string | null;
};

function asTokenSet(json: TokenResponse): GhlTokenSet | null {
  if (!json.access_token || !json.refresh_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 86399,
    userType: json.userType ?? json.user_type ?? "Location",
    locationId: json.locationId ?? null,
    companyId: json.companyId ?? null,
    userId: json.userId ?? null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { parse_error: true, status: response.status };
  }
}

export async function exchangeAuthorizationCode(code: string): Promise<GhlTokenSet> {
  const body = {
    client_id: ghlClientId(),
    client_secret: ghlClientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: ghlOAuthRedirectUri(),
  };
  const response = await fetch(`${ghlApiBase()}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await readJson(response)) as TokenResponse;
  const tokens = asTokenSet(json);
  if (!response.ok || !tokens) {
    ghlError("ghl.oauth.exchange_failed", { status: response.status });
    throw new Error("Could not complete the GoHighLevel connection.");
  }
  ghlLog("ghl.oauth.exchanged", { userType: tokens.userType, hasLocation: Boolean(tokens.locationId) });
  return tokens;
}

export async function refreshGhlTokens(refreshToken: string): Promise<GhlTokenSet> {
  const params = new URLSearchParams({
    client_id: ghlClientId(),
    client_secret: ghlClientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: ghlOAuthRedirectUri(),
  });
  const response = await fetch(`${ghlApiBase()}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await readJson(response)) as TokenResponse;
  const tokens = asTokenSet(json);
  if (!response.ok || !tokens) {
    throw new Error("refresh_failed");
  }
  return tokens;
}

export async function exchangeLocationToken(args: {
  agencyAccessToken: string;
  companyId: string;
  locationId: string;
}): Promise<GhlTokenSet> {
  const response = await fetch(`${ghlApiBase()}/oauth/locationToken`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Version: "2021-07-28",
      Authorization: `Bearer ${args.agencyAccessToken}`,
    },
    body: JSON.stringify({ companyId: args.companyId, locationId: args.locationId }),
  });
  const json = (await readJson(response)) as TokenResponse;
  const tokens = asTokenSet(json);
  if (!response.ok || !tokens) {
    ghlError("ghl.oauth.location_token_failed", { status: response.status });
    throw new Error("Could not create a location token for that GoHighLevel account.");
  }
  return { ...tokens, locationId: tokens.locationId ?? args.locationId, companyId: tokens.companyId ?? args.companyId };
}

export type GhlApiResult<T> = {
  ok: boolean;
  status: number;
  json: T | null;
  headers: Headers;
};

/**
 * Every GHL API call goes through here so token refresh is one path.
 * Refreshes proactively before expiry. A failed refresh marks the connection
 * broken and stops dispatch rather than failing silently per-feature.
 */
export async function ghlRequest<T = unknown>(
  db: GhlDb,
  orgId: string,
  path: string,
  init: RequestInit & { version?: string } = {}
): Promise<GhlApiResult<T>> {
  const access = await getValidAccessToken(db, orgId);
  if (!access.ok) {
    return { ok: false, status: 0, json: null, headers: new Headers() };
  }

  const url = path.startsWith("http") ? path : `${ghlApiBase()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access.token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Version", init.version ?? "2021-07-28");
  const { version, ...rest } = init;
  void version;
  const response = await fetch(url, { ...rest, headers });
  const json = (await readJson(response)) as T | null;

  if (response.status === 401) {
    ghlWarn("ghl.api.unauthorized", { orgId, path, status: 401 });
  }

  const remaining = response.headers.get("x-ratelimit-daily-remaining") ?? response.headers.get("x-ratelimit-remaining");
  if (remaining === "0") {
    const until = new Date(Date.now() + 60_000).toISOString();
    await db.from("ghl_rate_windows").upsert({
      org_id: orgId,
      window_started_at: new Date().toISOString(),
      request_count: 80,
      paused_until: until,
    });
  }

  return { ok: response.ok, status: response.status, json, headers: response.headers };
}

export async function getValidAccessToken(
  db: GhlDb,
  orgId: string
): Promise<{ ok: true; token: string } | { ok: false; reason: "missing" | "broken" | "refresh_failed" }> {
  const row = await loadConnection(db, orgId);
  if (!row) return { ok: false, reason: "missing" };
  if (row.status === "broken" || row.status === "inactive") {
    return { ok: false, reason: "broken" };
  }
  const tokens = decryptConnectionTokens(row);
  if (!tokens) {
    await markConnectionBroken(db, orgId, "missing_tokens");
    return { ok: false, reason: "broken" };
  }
  if (!tokensNeedRefresh(tokens.expiresAt)) {
    return { ok: true, token: tokens.accessToken };
  }

  try {
    const refreshed = await refreshGhlTokens(tokens.refreshToken);
    await persistTokens(db, orgId, refreshed);
    ghlLog("ghl.token.refreshed", { orgId });
    return { ok: true, token: refreshed.accessToken };
  } catch (error) {
    const reloaded = await loadConnection(db, orgId);
    const again = reloaded ? decryptConnectionTokens(reloaded) : null;
    if (again && !tokensNeedRefresh(again.expiresAt)) {
      return { ok: true, token: again.accessToken };
    }
    const reason = error instanceof Error ? error.message : "refresh_failed";
    await markConnectionBroken(db, orgId, reason === "refresh_failed" ? "refresh_failed" : "refresh_failed");
    return { ok: false, reason: "refresh_failed" };
  }
}

export async function refreshExpiringConnections(db: GhlDb): Promise<number> {
  const horizon = new Date(Date.now() + TOKEN_REFRESH_CRON_MS).toISOString();
  const { data } = await db
    .from("ghl_connections")
    .select("org_id")
    .eq("status", "active")
    .or(`token_expires_at.is.null,token_expires_at.lte.${horizon}`);

  let refreshed = 0;
  for (const row of data ?? []) {
    const result = await getValidAccessToken(db, row.org_id);
    if (result.ok) refreshed += 1;
  }
  return refreshed;
}

export async function fetchLocationName(db: GhlDb, orgId: string, locationId: string): Promise<string | null> {
  const result = await ghlRequest<{ location?: { name?: string; id?: string }; name?: string }>(
    db,
    orgId,
    `/locations/${encodeURIComponent(locationId)}`
  );
  if (!result.ok || !result.json) return null;
  return result.json.location?.name ?? result.json.name ?? null;
}

export async function fetchCustomFields(
  db: GhlDb,
  orgId: string,
  locationId: string
): Promise<Array<{ id: string; name: string; key?: string }>> {
  const result = await ghlRequest<{ customFields?: Array<{ id?: string; name?: string; fieldKey?: string; key?: string }> }>(
    db,
    orgId,
    `/locations/${encodeURIComponent(locationId)}/customFields`
  );
  if (!result.ok || !result.json?.customFields) return [];
  return result.json.customFields
    .filter((field) => field.id && field.name)
    .map((field) => ({
      id: field.id as string,
      name: field.name as string,
      key: field.fieldKey ?? field.key,
    }));
}

export async function fetchContact(db: GhlDb, orgId: string, contactId: string) {
  return ghlRequest<{ contact?: Record<string, unknown> }>(
    db,
    orgId,
    `/contacts/${encodeURIComponent(contactId)}`,
    { version: "2021-07-28" }
  );
}

export async function fetchUser(db: GhlDb, orgId: string, userId: string) {
  return ghlRequest<{ email?: string; name?: string; id?: string }>(
    db,
    orgId,
    `/users/${encodeURIComponent(userId)}`
  );
}

export async function listInstalledLocations(agencyAccessToken: string, companyId: string) {
  const url = new URL(`${ghlApiBase()}/oauth/installedLocations`);
  url.searchParams.set("companyId", companyId);
  url.searchParams.set("limit", "100");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${agencyAccessToken}`,
      Version: "2021-07-28",
    },
  });
  const json = (await readJson(response)) as {
    locations?: Array<{ id?: string; locationId?: string; name?: string; address?: string }>;
  } | null;
  if (!response.ok || !json) return [];
  return (json.locations ?? [])
    .map((loc) => ({
      id: loc.locationId ?? loc.id ?? "",
      name: loc.name ?? loc.locationId ?? loc.id ?? "Unnamed location",
    }))
    .filter((loc) => loc.id);
}

export async function registerLocationWebhooks(db: GhlDb, orgId: string): Promise<string | null> {
  const result = await ghlRequest<{ id?: string; webhookId?: string }>(db, orgId, "/hooks/", {
    method: "POST",
    version: "2021-07-28",
    body: JSON.stringify({
      url: ghlWebhookUrl(),
      events: [...GHL_WEBHOOK_EVENTS],
    }),
  });
  if (!result.ok) {
    ghlWarn("ghl.webhook.register_failed", { orgId, status: result.status });
    return null;
  }
  const id = result.json?.id ?? result.json?.webhookId ?? null;
  if (id) {
    await db.from("ghl_connections").update({ webhook_id: id }).eq("org_id", orgId);
  }
  ghlLog("ghl.webhook.registered", { orgId, registered: Boolean(id) });
  return id;
}

export async function deleteLocationWebhook(db: GhlDb, orgId: string, webhookId: string | null) {
  if (!webhookId) return;
  await ghlRequest(db, orgId, `/hooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
    version: "2021-07-28",
  });
}

export async function revokeGhlAccess(accessToken: string | null) {
  if (!accessToken) return;
  try {
    await fetch(`${ghlApiBase()}/oauth/revoke`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams({
        token: accessToken,
        client_id: ghlClientId(),
        client_secret: ghlClientSecret(),
      }),
    });
  } catch {
    ghlWarn("ghl.oauth.revoke_failed", {});
  }
}

export { contactIsSuppressed } from "@/lib/ghl/message-meta";

export async function sendConversationMessage(
  db: GhlDb,
  orgId: string,
  body: Record<string, unknown>
) {
  return ghlRequest<{ messageId?: string; conversationId?: string; message?: { id?: string } }>(
    db,
    orgId,
    "/conversations/messages",
    {
      method: "POST",
      version: "2021-04-15",
      body: JSON.stringify(body),
    }
  );
}
