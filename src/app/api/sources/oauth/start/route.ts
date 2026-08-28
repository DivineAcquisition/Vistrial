import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canViewPortal } from "@/lib/auth/permissions";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { ORG_COOKIE_NAME } from "@/lib/auth/cookies";
import { createSourceOAuthState } from "@/lib/sources/oauth-state";
import {
  GOOGLE_ADS_READONLY_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
  googleAdsClientId,
  googleAdsConfigured,
  googleCalendarClientId,
  googleCalendarConfigured,
  metaAdsClientId,
  metaAdsConfigured,
  sourceOAuthCookieName,
  sourceOAuthRedirectUri,
  stripeClientId,
  stripeConnectConfigured,
} from "@/lib/sources/env";
import { createClient } from "@/lib/supabase/server";
import type { SourceKind } from "@/types/database";

export const dynamic = "force-dynamic";

const KINDS: SourceKind[] = ["meta_ads", "google_ads", "stripe", "calendar"];

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") as SourceKind | null;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown source." }, { status: 400 });
  }
  if (kind === "meta_ads" && !metaAdsConfigured()) {
    return NextResponse.json({ error: "Meta Ads is not configured on this deployment." }, { status: 503 });
  }
  if (kind === "google_ads" && !googleAdsConfigured()) {
    return NextResponse.json({ error: "Google Ads is not configured on this deployment." }, { status: 503 });
  }
  if (kind === "stripe" && !stripeConnectConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured on this deployment." }, { status: 503 });
  }
  if (kind === "calendar" && !googleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar is not configured on this deployment." }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await listActiveMemberships(user.id);
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE_NAME)?.value;
  const active = memberships.find((membership) => membership.orgId === cookieOrgId) ?? memberships[0];
  if (!active) return NextResponse.json({ error: "No workspace." }, { status: 403 });
  const supabase = await createClient();
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!canViewPortal(active.role, Boolean(platformAdmin))) {
    return NextResponse.json({ error: "The owner portal is owner and admin only." }, { status: 403 });
  }

  const state = createSourceOAuthState(active.orgId, active.id, kind);
  const redirectUri = sourceOAuthRedirectUri();
  let authorize: URL;
  if (kind === "meta_ads") {
    authorize = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    authorize.searchParams.set("client_id", metaAdsClientId());
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", "ads_read");
    authorize.searchParams.set("response_type", "code");
  } else if (kind === "google_ads") {
    authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id", googleAdsClientId());
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", GOOGLE_ADS_READONLY_SCOPE);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("access_type", "offline");
    authorize.searchParams.set("prompt", "consent");
  } else if (kind === "calendar") {
    authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id", googleCalendarClientId());
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", GOOGLE_CALENDAR_READONLY_SCOPE);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("access_type", "offline");
    authorize.searchParams.set("prompt", "consent");
  } else {
    authorize = new URL("https://connect.stripe.com/oauth/authorize");
    authorize.searchParams.set("client_id", stripeClientId());
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "read_only");
  }

  cookieStore.set(sourceOAuthCookieName(kind), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return NextResponse.redirect(authorize.toString());
}
