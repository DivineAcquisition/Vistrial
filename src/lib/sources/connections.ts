import "server-only";

import { randomBytes } from "node:crypto";

import { encryptSecret } from "@/lib/ghl/crypto";
import { ghlOAuthConfigured } from "@/lib/ghl/env";
import type { GhlDb } from "@/lib/ghl/tokens";
import {
  SOURCE_CATALOG,
  SOURCE_KINDS,
  type SourceCardModel,
  type SourceConnectMode,
} from "@/lib/sources/catalog";
import {
  formWebhookUrl,
  googleAdsConfigured,
  googleCalendarConfigured,
  metaAdsConfigured,
  stripeConnectConfigured,
} from "@/lib/sources/env";
import type { Enums, Json } from "@/types/database";

export type { SourceCardModel, SourceConnectionPublic } from "@/lib/sources/catalog";

export function newPublicToken(): string {
  return randomBytes(24).toString("hex");
}

export function connectModeFor(
  kind: Enums<"source_kind">,
  ghlConnected: boolean
): SourceConnectMode {
  if (kind === "meta_ads") return metaAdsConfigured() ? "oauth" : "unavailable";
  if (kind === "google_ads") return googleAdsConfigured() ? "oauth" : "unavailable";
  if (kind === "stripe") return stripeConnectConfigured() ? "oauth" : "unavailable";
  if (kind === "commas") return "api_key";
  if (kind === "form_platform") return "webhook";
  if (kind === "calendar") {
    if (googleCalendarConfigured()) return "oauth";
    if (ghlConnected && ghlOAuthConfigured()) return "ghl_reuse";
    return "unavailable";
  }
  return "unavailable";
}

export function unavailableReason(kind: Enums<"source_kind">, ghlConnected: boolean): string {
  const mode = connectModeFor(kind, ghlConnected);
  if (mode !== "unavailable") return "";
  if (kind === "meta_ads") {
    return "Meta Ads credentials are not configured on this deployment, so connect stays unavailable.";
  }
  if (kind === "google_ads") {
    return "Google Ads read-only credentials are not configured on this deployment, so connect stays unavailable.";
  }
  if (kind === "stripe") {
    return "Stripe Connect credentials are not configured on this deployment, so connect stays unavailable.";
  }
  if (kind === "calendar") {
    return "Neither Google Calendar read-only credentials nor a GoHighLevel connection are available, so connect stays unavailable.";
  }
  return "This source is not configured on this deployment.";
}

export async function loadSourceCards(db: GhlDb, orgId: string): Promise<SourceCardModel[]> {
  const [{ data: rows }, { data: ghl }] = await Promise.all([
    db
      .from("source_connections")
      .select("kind, status, provider, account_label, last_verified_at, last_error, public_token, metadata")
      .eq("org_id", orgId),
    db.from("ghl_connections").select("status").eq("org_id", orgId).maybeSingle(),
  ]);
  const ghlConnected = ghl?.status === "active";
  const byKind = new Map((rows ?? []).map((row) => [row.kind, row]));
  return SOURCE_KINDS.map((kind) => {
    const catalog = SOURCE_CATALOG[kind];
    const row = byKind.get(kind);
    const status = row?.status ?? "missing";
    return {
      ...catalog,
      kind,
      connectMode: connectModeFor(kind, ghlConnected),
      status: status === "inactive" && !row ? "missing" : status,
      provider: row?.provider ?? catalog.providerLabel.toLowerCase(),
      accountLabel: row?.account_label ?? null,
      lastVerifiedAt: row?.last_verified_at ?? null,
      lastError: row?.last_error ?? null,
      publicToken: row?.public_token ?? null,
      metadata: (row?.metadata as Record<string, unknown> | null) ?? {},
      webhookUrl:
        kind === "form_platform" && row?.public_token ? formWebhookUrl(row.public_token) : null,
      unavailableReason: unavailableReason(kind, ghlConnected),
      connected: row?.status === "active",
    };
  });
}

export async function upsertSourceConnection(
  db: GhlDb,
  args: {
    orgId: string;
    kind: Enums<"source_kind">;
    provider: string;
    status?: Enums<"ghl_connection_status">;
    accountLabel?: string | null;
    secret?: string | null;
    refresh?: string | null;
    tokenExpiresAt?: string | null;
    publicToken?: string | null;
    metadata?: Json;
    lastError?: string | null;
    verified?: boolean;
  }
) {
  const now = new Date().toISOString();
  const { error } = await db.from("source_connections").upsert(
    {
      org_id: args.orgId,
      kind: args.kind,
      provider: args.provider,
      status: args.status ?? "active",
      account_label: args.accountLabel ?? null,
      secret_encrypted: args.secret ? encryptSecret(args.secret) : undefined,
      refresh_encrypted: args.refresh ? encryptSecret(args.refresh) : undefined,
      token_expires_at: args.tokenExpiresAt ?? null,
      public_token: args.publicToken,
      metadata: args.metadata ?? {},
      last_error: args.lastError ?? null,
      last_verified_at: args.verified === false ? undefined : now,
      updated_at: now,
    },
    { onConflict: "org_id,kind" }
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function markSourceVerified(db: GhlDb, orgId: string, kind: Enums<"source_kind">) {
  await db
    .from("source_connections")
    .update({
      last_verified_at: new Date().toISOString(),
      last_error: null,
      status: "active",
    })
    .eq("org_id", orgId)
    .eq("kind", kind);
}

export async function markSourceError(
  db: GhlDb,
  orgId: string,
  kind: Enums<"source_kind">,
  message: string
) {
  await db
    .from("source_connections")
    .update({ last_error: message, status: "broken" })
    .eq("org_id", orgId)
    .eq("kind", kind);
}

export async function disconnectSource(db: GhlDb, orgId: string, kind: Enums<"source_kind">) {
  await db
    .from("source_connections")
    .update({
      status: "inactive",
      secret_encrypted: null,
      refresh_encrypted: null,
      token_expires_at: null,
      last_error: null,
      account_label: null,
      public_token: null,
      metadata: {},
    })
    .eq("org_id", orgId)
    .eq("kind", kind);
}

export async function loadSourceSecret(
  db: GhlDb,
  orgId: string,
  kind: Enums<"source_kind">
): Promise<{
  secret: string | null;
  refresh: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  status: Enums<"ghl_connection_status">;
  publicToken: string | null;
  accountLabel: string | null;
  provider: string;
} | null> {
  const { data } = await db
    .from("source_connections")
    .select(
      "secret_encrypted, refresh_encrypted, token_expires_at, metadata, status, public_token, account_label, provider"
    )
    .eq("org_id", orgId)
    .eq("kind", kind)
    .maybeSingle();
  if (!data) return null;
  const { decryptSecret } = await import("@/lib/ghl/crypto");
  return {
    secret: data.secret_encrypted ? decryptSecret(data.secret_encrypted) : null,
    refresh: data.refresh_encrypted ? decryptSecret(data.refresh_encrypted) : null,
    expiresAt: data.token_expires_at,
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
    status: data.status,
    publicToken: data.public_token,
    accountLabel: data.account_label,
    provider: data.provider,
  };
}
