import "server-only";

import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { GhlDb } from "@/lib/ghl/tokens";
import { upsertSourceConnection } from "@/lib/sources/connections";
import {
  googleAdsClientId,
  googleAdsClientSecret,
  googleAdsDeveloperToken,
  googleCalendarClientId,
  googleCalendarClientSecret,
  metaAdsClientId,
  metaAdsClientSecret,
  sourceOAuthRedirectUri,
  stripeClientSecret,
} from "@/lib/sources/env";
import type { SourceKind } from "@/types/database";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function completeSourceOAuth(
  db: GhlDb,
  args: { orgId: string; kind: SourceKind; code: string }
): Promise<void> {
  if (args.kind === "meta_ads") {
    await completeMeta(db, args.orgId, args.code);
    return;
  }
  if (args.kind === "google_ads") {
    await completeGoogleAds(db, args.orgId, args.code);
    return;
  }
  if (args.kind === "stripe") {
    await completeStripe(db, args.orgId, args.code);
    return;
  }
  if (args.kind === "calendar") {
    await completeGoogleCalendar(db, args.orgId, args.code);
    return;
  }
  throw new Error("This source does not use OAuth.");
}

async function completeMeta(db: GhlDb, orgId: string, code: string) {
  const body = new URLSearchParams({
    client_id: metaAdsClientId(),
    client_secret: metaAdsClientSecret(),
    redirect_uri: sourceOAuthRedirectUri(),
    code,
  });
  const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${body.toString()}`);
  const json = asRecord(await res.json());
  const token = asString(json?.access_token);
  if (!res.ok || !token) {
    ghlError("source.oauth.meta_failed", { status: res.status });
    throw new Error("Could not complete the Meta Ads connection.");
  }
  const accountsRes = await fetch(
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_id&access_token=${encodeURIComponent(token)}`
  );
  const accountsJson = asRecord(await accountsRes.json());
  const first = Array.isArray(accountsJson?.data) ? asRecord(accountsJson.data[0]) : null;
  const accountId = asString(first?.account_id) ?? asString(first?.id)?.replace(/^act_/, "");
  await upsertSourceConnection(db, {
    orgId,
    kind: "meta_ads",
    provider: "meta",
    secret: token,
    accountLabel: asString(first?.name) ?? accountId,
    metadata: { account_id: accountId },
    verified: true,
  });
  ghlLog("source.oauth.meta_linked", { orgId });
}

export async function listGoogleAdsCustomerId(accessToken: string): Promise<string | null> {
  const developerToken = googleAdsDeveloperToken();
  if (!developerToken) return null;
  const res = await fetch("https://googleads.googleapis.com/v18/customers:listAccessibleCustomers", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
  });
  if (!res.ok) return null;
  const json = asRecord(await res.json());
  const names = Array.isArray(json?.resourceNames) ? json.resourceNames : [];
  for (const name of names) {
    const id = asString(name)?.replace(/^customers\//, "").replace(/-/g, "");
    if (id) return id;
  }
  return null;
}

async function completeGoogleAds(db: GhlDb, orgId: string, code: string) {
  const body = new URLSearchParams({
    client_id: googleAdsClientId(),
    client_secret: googleAdsClientSecret(),
    redirect_uri: sourceOAuthRedirectUri(),
    grant_type: "authorization_code",
    code,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = asRecord(await res.json());
  const token = asString(json?.access_token);
  const refresh = asString(json?.refresh_token);
  if (!res.ok || !token) {
    ghlError("source.oauth.google_ads_failed", { status: res.status, error: asString(json?.error) });
    throw new Error("Could not complete the Google Ads connection. The read-only scope may have been rejected.");
  }
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : 3600;
  const customerId = await listGoogleAdsCustomerId(token);
  await upsertSourceConnection(db, {
    orgId,
    kind: "google_ads",
    provider: "google",
    secret: token,
    refresh,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    accountLabel: customerId,
    metadata: { customer_id: customerId, scope: "adwords.readonly" },
    lastError: customerId
      ? null
      : "Read-only access was granted. No Google Ads customer id was listed yet. Spend will not import until one is.",
    verified: true,
  });
  ghlLog("source.oauth.google_ads_linked", { orgId, customerId: customerId ?? "none" });
}

async function completeStripe(db: GhlDb, orgId: string, code: string) {
  const body = new URLSearchParams({
    client_secret: stripeClientSecret(),
    code,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = asRecord(await res.json());
  const token = asString(json?.access_token);
  const userId = asString(json?.stripe_user_id);
  const scope = asString(json?.scope);
  if (!res.ok || !token || !userId) {
    ghlError("source.oauth.stripe_failed", { status: res.status });
    throw new Error("Could not complete the Stripe connection.");
  }
  if (scope && scope !== "read_only") {
    throw new Error("Stripe did not grant read-only access. Disconnect and try again.");
  }
  await upsertSourceConnection(db, {
    orgId,
    kind: "stripe",
    provider: "stripe",
    secret: token,
    refresh: asString(json?.refresh_token),
    accountLabel: userId,
    metadata: { account_id: userId, stripe_user_id: userId, livemode: json?.livemode === true },
    verified: true,
  });
  ghlLog("source.oauth.stripe_linked", { orgId });
}

async function completeGoogleCalendar(db: GhlDb, orgId: string, code: string) {
  const body = new URLSearchParams({
    client_id: googleCalendarClientId(),
    client_secret: googleCalendarClientSecret(),
    redirect_uri: sourceOAuthRedirectUri(),
    grant_type: "authorization_code",
    code,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = asRecord(await res.json());
  const token = asString(json?.access_token);
  if (!res.ok || !token) {
    throw new Error("Could not complete the Google Calendar connection.");
  }
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : 3600;
  await upsertSourceConnection(db, {
    orgId,
    kind: "calendar",
    provider: "google",
    secret: token,
    refresh: asString(json?.refresh_token),
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    metadata: { calendar_id: "primary" },
    verified: true,
  });
  ghlLog("source.oauth.calendar_linked", { orgId });
}
