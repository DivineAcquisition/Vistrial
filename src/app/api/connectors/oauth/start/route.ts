import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ORG_COOKIE_NAME } from "@/lib/auth/cookies";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { canManageConnections } from "@/lib/connectors/access";
import { createAttemptState, newVerifier } from "@/lib/connectors/attempts";
import { assertApprovedScopes, ATTEMPT_REJECTED, connectorByKey } from "@/lib/connectors/catalog";
import { connectorEnabled, connectorEntitlement } from "@/lib/connectors/store";
import { encryptSecret } from "@/lib/ghl/crypto";
import { authorizeUrl, requestedScopes, vendorConfigured } from "@/lib/connectors/vendors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COOKIE = "vistrial_connector_oauth";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("connector") ?? "";
  const connector = connectorByKey(key);
  if (!connector || connector.method !== "oauth" || connector.availability !== "connect") {
    return NextResponse.json({ error: "Unknown connector." }, { status: 404 });
  }
  if (key === "gohighlevel") {
    return NextResponse.redirect(new URL("/api/leadconnector/oauth/start?from=connections", request.url));
  }
  if (!vendorConfigured(key)) {
    return NextResponse.json({ error: "This connector is not configured on this deployment yet." }, { status: 503 });
  }
  const secret = process.env.GHL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "Encryption is not configured." }, { status: 503 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await listActiveMemberships(user.id);
  const cookieStore = await cookies();
  const orgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const active = memberships.find((membership) => membership.orgId === orgId) ?? memberships[0];
  if (!active) return NextResponse.json({ error: "No workspace." }, { status: 403 });
  const manage = canManageConnections({
    role: active.role,
    isStaff: active.seat === "staff",
    canManageFlag: active.canManageConnections,
  });
  if (!manage) return NextResponse.json({ error: "You do not have permission to connect a tool." }, { status: 403 });
  if (!(await connectorEnabled(active.orgId, key))) {
    return NextResponse.json({ error: "This connector is not turned on for this workspace." }, { status: 403 });
  }
  if (connector.countsTowardLimit) {
    const plan = await connectorEntitlement(active.orgId);
    if (!plan.allowed) {
      return NextResponse.json({ error: plan.reason }, { status: 402 });
    }
  }

  const scopes = requestedScopes(key);
  assertApprovedScopes(key, scopes);
  const verifier = key === "airtable" ? newVerifier() : null;
  const state = createAttemptState({
    orgId: active.orgId,
    memberId: active.id,
    connectorKey: key,
    secret,
  });
  const nonce = state.split(".")[0] ?? state;
  await (getSupabaseAdmin() as unknown as {
    from: (table: string) => { insert: (row: object) => Promise<unknown> };
  })
    .from("connection_attempts")
    .insert({
      org_id: active.orgId,
      member_id: active.id,
      connector_key: key,
      nonce_hash: createHash("sha256").update(nonce).digest("hex"),
      code_verifier_encrypted: verifier ? encryptSecret(verifier) : null,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

  cookieStore.set(COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  const url = authorizeUrl({ key, state, verifier });
  if (!url) return NextResponse.json({ error: ATTEMPT_REJECTED }, { status: 400 });
  return NextResponse.redirect(url);
}
