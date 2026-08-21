import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { ORG_COOKIE_NAME } from "@/lib/auth/cookies";
import { GHL_OAUTH_COOKIE, GHL_OAUTH_RETURN_COOKIE, GHL_OAUTH_SCOPES } from "@/lib/ghl/constants";
import { ghlClientId, ghlOAuthAuthorizeUrl, ghlOAuthConfigured, ghlOAuthRedirectUri } from "@/lib/ghl/env";
import { createOAuthState } from "@/lib/ghl/oauth-state";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!ghlOAuthConfigured()) {
    return NextResponse.json({ error: "GoHighLevel credentials are not configured." }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await listActiveMemberships(user.id);
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const active =
    memberships.find((membership) => membership.orgId === cookieOrgId) ?? memberships[0];
  if (!active) {
    return NextResponse.json({ error: "No workspace." }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!canManageOrgSettings(active.role, Boolean(platformAdmin))) {
    return NextResponse.json({ error: "You do not have permission to connect the CRM." }, { status: 403 });
  }

  const state = createOAuthState(active.orgId, active.id);
  const url = new URL(ghlOAuthAuthorizeUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", ghlClientId());
  url.searchParams.set("redirect_uri", ghlOAuthRedirectUri());
  url.searchParams.set("scope", GHL_OAUTH_SCOPES);
  url.searchParams.set("state", state);

  cookieStore.set(GHL_OAUTH_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });

  const next = new URL(request.url).searchParams.get("next");
  if (
    next &&
    (next.startsWith("/app/setup") || next.startsWith("/app/settings/integrations")) &&
    !next.startsWith("//") &&
    !next.includes("://")
  ) {
    cookieStore.set(GHL_OAUTH_RETURN_COOKIE, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });
  }

  return NextResponse.redirect(url.toString());
}
