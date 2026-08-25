import "server-only";

import { LOCATION_CLAIMED_MESSAGE, OAUTH_SESSION_TTL_MS } from "@/lib/ghl/constants";
import {
  deleteLocationWebhook,
  exchangeLocationToken,
  fetchLocationName,
  listInstalledLocations,
  registerLocationWebhooks,
  revokeGhlAccess,
  type GhlTokenSet,
} from "@/lib/ghl/client";
import { encryptSecret, decryptSecret } from "@/lib/ghl/crypto";
import { ghlLog, ghlError } from "@/lib/ghl/log";
import { assertStagingCrmAllowed } from "@/lib/ops/crm-guard";
import {
  decryptConnectionTokens,
  loadConnection,
  markConnectionInactive,
  persistTokens,
  type GhlDb,
} from "@/lib/ghl/tokens";

export { LOCATION_CLAIMED_MESSAGE };

export async function linkLocationToOrg(
  db: GhlDb,
  args: {
    orgId: string;
    tokens: GhlTokenSet;
    locationId: string;
    memberId?: string | null;
  }
): Promise<{ ok: true; locationName: string | null } | { ok: false; error: "location_claimed" | "org_missing" }> {
  assertStagingCrmAllowed(args.locationId);
  const linked = await db.rpc("link_ghl_location", {
    p_org_id: args.orgId,
    p_location_id: args.locationId,
  });
  const result = linked.data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    const error = result?.error === "org_missing" ? "org_missing" : "location_claimed";
    ghlError("ghl.oauth.link_failed", { orgId: args.orgId, error });
    return { ok: false, error };
  }

  const expiresAt = new Date(Date.now() + args.tokens.expiresIn * 1000).toISOString();
  const { error } = await db.from("ghl_connections").upsert(
    {
      org_id: args.orgId,
      location_id: args.locationId,
      company_id: args.tokens.companyId,
      access_token_encrypted: encryptSecret(args.tokens.accessToken),
      refresh_token_encrypted: encryptSecret(args.tokens.refreshToken),
      token_expires_at: expiresAt,
      status: "active",
      last_verified_at: new Date().toISOString(),
      last_refresh_error: null,
    },
    { onConflict: "org_id" }
  );

  if (error) {
    if (error.code === "23505") {
      await db.rpc("unlink_ghl_location", { p_org_id: args.orgId });
      return { ok: false, error: "location_claimed" };
    }
    ghlError("ghl.oauth.persist_failed", { orgId: args.orgId, code: error.code });
    throw new Error("Could not store the GoHighLevel connection.");
  }

  await persistTokens(db, args.orgId, args.tokens);
  const { error: enqueueError } = await db.rpc("enqueue_baseline_backfill", {
    p_org_id: args.orgId,
    p_member_id: args.memberId ?? null,
    p_replace: false,
  });
  if (enqueueError) {
    ghlError("ghl.oauth.backfill_enqueue_failed", { orgId: args.orgId, error: enqueueError.message });
  }
  const locationName = await fetchLocationName(db, args.orgId, args.locationId);
  if (locationName) {
    await db.from("ghl_connections").update({ location_name: locationName }).eq("org_id", args.orgId);
  }
  await registerLocationWebhooks(db, args.orgId);
  ghlLog("ghl.oauth.linked", { orgId: args.orgId });
  return { ok: true, locationName };
}

export async function stashAgencySession(
  db: GhlDb,
  args: {
    orgId: string;
    memberId: string;
    tokens: GhlTokenSet;
  }
): Promise<string> {
  await db.from("ghl_oauth_sessions").delete().eq("org_id", args.orgId);
  const { data, error } = await db
    .from("ghl_oauth_sessions")
    .insert({
      org_id: args.orgId,
      member_id: args.memberId,
      company_id: args.tokens.companyId,
      access_token_encrypted: encryptSecret(args.tokens.accessToken),
      refresh_token_encrypted: encryptSecret(args.tokens.refreshToken),
      token_expires_at: new Date(Date.now() + args.tokens.expiresIn * 1000).toISOString(),
      expires_at: new Date(Date.now() + OAUTH_SESSION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("Could not start location selection.");
  }
  return data.id;
}

export async function loadAgencySession(db: GhlDb, orgId: string, memberId: string) {
  const { data } = await db
    .from("ghl_oauth_sessions")
    .select("*")
    .eq("org_id", orgId)
    .eq("member_id", memberId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    accessToken: decryptSecret(data.access_token_encrypted),
    refreshToken: decryptSecret(data.refresh_token_encrypted),
  };
}

export async function listSessionLocations(db: GhlDb, orgId: string, memberId: string) {
  const session = await loadAgencySession(db, orgId, memberId);
  if (!session?.company_id) return [];
  return listInstalledLocations(session.accessToken, session.company_id);
}

export async function completeLocationSelection(
  db: GhlDb,
  args: { orgId: string; memberId: string; locationId: string }
) {
  const session = await loadAgencySession(db, args.orgId, args.memberId);
  if (!session?.company_id) {
    return { ok: false as const, error: "The location selection expired. Connect again." };
  }
  const tokens = await exchangeLocationToken({
    agencyAccessToken: session.accessToken,
    companyId: session.company_id,
    locationId: args.locationId,
  });
  const linked = await linkLocationToOrg(db, {
    orgId: args.orgId,
    tokens,
    locationId: args.locationId,
    memberId: args.memberId,
  });
  await db.from("ghl_oauth_sessions").delete().eq("org_id", args.orgId);
  if (!linked.ok) {
    return {
      ok: false as const,
      error: linked.error === "location_claimed" ? LOCATION_CLAIMED_MESSAGE : "Could not link that location.",
    };
  }
  return { ok: true as const };
}

export async function disconnectGhl(db: GhlDb, orgId: string): Promise<void> {
  const row = await loadConnection(db, orgId);
  const tokens = row ? decryptConnectionTokens(row) : null;
  try {
    await deleteLocationWebhook(db, orgId, row?.webhook_id ?? null);
  } catch {
    // Revoke locally even if GHL is unreachable.
  }
  await revokeGhlAccess(tokens?.accessToken ?? null);
  await markConnectionInactive(db, orgId);
  await db.rpc("unlink_ghl_location", { p_org_id: orgId });
  ghlLog("ghl.oauth.disconnected", { orgId });
}
