import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ORG_COOKIE_NAME } from "@/lib/auth/cookies";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { openAttemptState } from "@/lib/connectors/attempts";
import { CONNECTION_CANCELED, connectorByKey, missingRequiredScopes } from "@/lib/connectors/catalog";
import { saveOAuthTokens, upsertCatalogConnection } from "@/lib/connectors/store";
import { decryptSecret } from "@/lib/ghl/crypto";
import { appUrl } from "@/lib/app-url";
import { exchangeCode } from "@/lib/connectors/vendors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COOKIE = "vistrial_connector_oauth";

function back(connector: string, query: Record<string, string>) {
  const url = new URL(`/app/settings/connections/${connector}`, appUrl());
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const secret = process.env.GHL_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(COOKIE)?.value ?? "";
  cookieStore.delete(COOKIE);
  const stateParam = incoming.searchParams.get("state") ?? "";
  const opened = openAttemptState({ state: stateParam, secret });
  const connectorKey = opened.ok ? opened.claims.connectorKey : "gohighlevel";

  if (incoming.searchParams.get("error")) {
    return back(connectorKey, { notice: CONNECTION_CANCELED });
  }
  if (!cookieState || cookieState !== stateParam || !opened.ok) {
    return back(connectorKey, { error: opened.ok ? "mismatch" : opened.reason === "expired" ? "expired" : "mismatch" });
  }

  const user = await getSessionUser();
  const memberships = user ? await listActiveMemberships(user.id) : [];
  const orgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const active = memberships.find((membership) => membership.orgId === orgId) ?? memberships[0];
  if (!active || active.orgId !== opened.claims.orgId || active.id !== opened.claims.memberId) {
    return back(connectorKey, { error: "mismatch" });
  }
  if (active.seat === "staff") return back(connectorKey, { error: "mismatch" });

  const nonce = stateParam.split(".")[0] ?? "";
  const attempt = await (getSupabaseAdmin() as unknown as {
    from: (table: string) => {
      select: (q: string) => {
        eq: (c: string, v: string) => {
          is: (c: string, v: null) => { maybeSingle: () => Promise<{ data: { code_verifier_encrypted: string | null; id: string } | null }> };
        };
      };
      update: (row: object) => { eq: (c: string, v: string) => Promise<unknown> };
    };
  })
    .from("connection_attempts")
    .select("id, code_verifier_encrypted")
    .eq("nonce_hash", createHash("sha256").update(nonce).digest("hex"))
    .is("consumed_at", null)
    .maybeSingle();
  if (!attempt.data) return back(connectorKey, { error: "mismatch" });

  const code = incoming.searchParams.get("code");
  if (!code) return back(connectorKey, { error: "mismatch" });
  const verifier = attempt.data.code_verifier_encrypted ? decryptSecret(attempt.data.code_verifier_encrypted) : null;

  try {
    const tokens = await exchangeCode({ key: connectorKey, code, verifier });
    const connector = connectorByKey(connectorKey);
    if (!connector) return back(connectorKey, { error: "mismatch" });
    const missing = missingRequiredScopes(connectorKey, tokens.scope.length ? tokens.scope : connector.requiredScopes);
    if (tokens.scope.length && missing.length) {
      return back(connectorKey, { error: "partial", missing: missing.join(",") });
    }
    const row = await upsertCatalogConnection({
      orgId: active.orgId,
      connector,
      memberId: active.id,
      externalAccountId: tokens.accountId,
      externalAccountLabel: tokens.accountLabel,
      grantedScopes: tokens.scope,
      status: "setting_up",
      testMode: connectorKey === "google_calendar",
    });
    await saveOAuthTokens(row.id, tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
    await (getSupabaseAdmin() as unknown as {
      from: (table: string) => { update: (row: object) => { eq: (c: string, v: string) => Promise<unknown> } };
    })
      .from("connection_attempts")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", attempt.data.id);
    const url = new URL(`/app/settings/connections/${connectorKey}/setup`, appUrl());
    url.searchParams.set("connection", row.id);
    url.searchParams.set("connected", tokens.accountLabel ?? "1");
    return NextResponse.redirect(url);
  } catch {
    return back(connectorKey, { error: "failed" });
  }
}
