import type { SupabaseClient } from "@supabase/supabase-js";

import { TOKEN_REFRESH_SKEW_MS } from "@/lib/ghl/constants";
import { decryptSecret, encryptSecret } from "@/lib/ghl/crypto";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { Database } from "@/types/database";

export type GhlDb = SupabaseClient<Database>;

export type GhlConnectionRow = Database["public"]["Tables"]["ghl_connections"]["Row"];

export type DecryptedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
};

export function connectionIsUsable(status: GhlConnectionRow["status"]): boolean {
  return status === "active";
}

export async function loadConnection(db: GhlDb, orgId: string): Promise<GhlConnectionRow | null> {
  const { data, error } = await db
    .from("ghl_connections")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export function decryptConnectionTokens(row: GhlConnectionRow): DecryptedTokens | null {
  if (!row.access_token_encrypted || !row.refresh_token_encrypted) return null;
  return {
    accessToken: decryptSecret(row.access_token_encrypted),
    refreshToken: decryptSecret(row.refresh_token_encrypted),
    expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
  };
}

export function tokensNeedRefresh(expiresAt: Date | null, now = Date.now(), skewMs = TOKEN_REFRESH_SKEW_MS): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now <= skewMs;
}

export async function persistTokens(
  db: GhlDb,
  orgId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  const { error } = await db
    .from("ghl_connections")
    .update({
      access_token_encrypted: encryptSecret(tokens.accessToken),
      refresh_token_encrypted: encryptSecret(tokens.refreshToken),
      token_expires_at: expiresAt,
      last_verified_at: new Date().toISOString(),
      last_refresh_error: null,
      status: "active",
    })
    .eq("org_id", orgId);
  if (error) {
    ghlError("ghl.token.persist_failed", { orgId, code: error.code });
    throw new Error("Could not store CRM tokens.");
  }
}

export async function markConnectionBroken(db: GhlDb, orgId: string, reason: string): Promise<void> {
  ghlError("ghl.connection.broken", { orgId, reason });
  await db
    .from("ghl_connections")
    .update({
      status: "broken",
      last_refresh_error: reason,
    })
    .eq("org_id", orgId);
}

export async function markConnectionInactive(db: GhlDb, orgId: string): Promise<void> {
  ghlLog("ghl.connection.inactive", { orgId });
  await db
    .from("ghl_connections")
    .update({
      status: "inactive",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      location_id: null,
      webhook_id: null,
      last_refresh_error: null,
    })
    .eq("org_id", orgId);
}
