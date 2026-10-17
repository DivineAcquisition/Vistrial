import "server-only";

import { appUrl } from "@/lib/app-url";
import { connectorByKey } from "@/lib/connectors/catalog";
import { pkceChallenge } from "@/lib/connectors/attempts";

export function connectorRedirectUri(): string {
  return `${appUrl()}/api/connectors/oauth/callback`;
}

export function vendorConfigured(key: string): boolean {
  if (key === "airtable") return Boolean(process.env.AIRTABLE_CLIENT_ID && process.env.AIRTABLE_CLIENT_SECRET);
  if (key === "hubspot") return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
  if (key === "google_calendar") return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
  if (key === "gohighlevel") return Boolean(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET);
  return false;
}

export function authorizeUrl(args: { key: string; state: string; verifier: string | null }): string | null {
  const redirect = connectorRedirectUri();
  if (args.key === "airtable") {
    const url = new URL("https://airtable.com/oauth2/v1/authorize");
    url.searchParams.set("client_id", process.env.AIRTABLE_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", args.state);
    url.searchParams.set("scope", "data.records:read schema.bases:read webhook:manage");
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", pkceChallenge(args.verifier ?? ""));
    return url.toString();
  }
  if (args.key === "google_calendar") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", args.state);
    url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    return url.toString();
  }
  if (args.key === "hubspot") {
    const url = new URL("https://app.hubspot.com/oauth/authorize");
    url.searchParams.set("client_id", process.env.HUBSPOT_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("state", args.state);
    url.searchParams.set("scope", "crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read oauth");
    return url.toString();
  }
  return null;
}

type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: string | null; scope: string[]; accountLabel: string | null; accountId: string | null };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function scopesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/[ ,]+/).filter(Boolean);
  return [];
}

export async function exchangeCode(args: {
  key: string;
  code: string;
  verifier: string | null;
}): Promise<TokenSet> {
  const redirect = connectorRedirectUri();
  if (args.key === "airtable") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: redirect,
      code_verifier: args.verifier ?? "",
      client_id: process.env.AIRTABLE_CLIENT_ID ?? "",
    });
    const secret = process.env.AIRTABLE_CLIENT_SECRET ?? "";
    const response = await fetch("https://airtable.com/oauth2/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.AIRTABLE_CLIENT_ID}:${secret}`).toString("base64")}`,
      },
      body,
    });
    const json = await readJson(response);
    if (!response.ok || typeof json.access_token !== "string") throw new Error("Airtable did not accept that sign-in.");
    return {
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresAt: typeof json.expires_in === "number" ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
      scope: scopesOf(json.scope),
      accountLabel: null,
      accountId: null,
    };
  }
  if (args.key === "google_calendar") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: redirect,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await readJson(response);
    if (!response.ok || typeof json.access_token !== "string") throw new Error("Google did not accept that sign-in.");
    const list = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    const calendars = await readJson(list);
    const first = Array.isArray(calendars.items) ? (calendars.items[0] as { id?: string; summary?: string } | undefined) : undefined;
    return {
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresAt: typeof json.expires_in === "number" ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
      scope: scopesOf(json.scope),
      accountLabel: typeof first?.summary === "string" ? first.summary : typeof first?.id === "string" ? first.id : null,
      accountId: typeof first?.id === "string" ? first.id : null,
    };
  }
  if (args.key === "hubspot") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: redirect,
      client_id: process.env.HUBSPOT_CLIENT_ID ?? "",
      client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
    });
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await readJson(response);
    if (!response.ok || typeof json.access_token !== "string") throw new Error("HubSpot did not accept that sign-in.");
    const info = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    const account = await readJson(info);
    return {
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresAt: typeof json.expires_in === "number" ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
      scope: scopesOf(json.scopes),
      accountLabel: typeof account.companyCurrency === "string" ? null : typeof account.uiDomain === "string" ? account.uiDomain : null,
      accountId: typeof account.portalId === "number" ? String(account.portalId) : null,
    };
  }
  throw new Error("This tool does not use sign-in.");
}

export async function testApiKey(key: string, secret: string): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  if (key === "fathom") {
    const response = await fetch("https://api.fathom.ai/external/v1/meetings?limit=1", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "That key was rejected. Check the key and that it can read meetings." };
    if (!response.ok) return { ok: false, reason: "Fathom did not answer. Try the key again in a minute." };
    return { ok: true, label: "Fathom account" };
  }
  if (key === "fireflies") {
    const response = await fetch("https://api.fireflies.ai/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ query: "query { user { email } }" }),
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "That key was rejected. Check the key and that it can read meetings." };
    if (!response.ok) return { ok: false, reason: "Fireflies did not answer. Try the key again in a minute." };
    const json = await readJson(response);
    const user = json.data && typeof json.data === "object" ? (json.data as { user?: { email?: string } }).user : null;
    return { ok: true, label: user?.email ?? "Fireflies account" };
  }
  return { ok: false, reason: "This tool does not use an API key." };
}

export function requestedScopes(key: string): string[] {
  return connectorByKey(key)?.permissions.map((row) => row.scope) ?? [];
}
