import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CRM_RETURN_COOKIE, GHL_OAUTH_COOKIE } from "@/lib/ghl/constants";
import { appUrl } from "@/lib/ghl/env";
import { exchangeAuthorizationCode, fetchLocationName } from "@/lib/ghl/client";
import { linkLocationToOrg, stashAgencySession } from "@/lib/ghl/connect";
import { parseOAuthState } from "@/lib/ghl/oauth-state";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectToIntegrations(query: Record<string, string>, base = "/app/settings/integrations") {
  const url = new URL(base, appUrl());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const returnStore = await cookies();
  const fromSetup = returnStore.get(CRM_RETURN_COOKIE)?.value === "onboarding";
  returnStore.delete(CRM_RETURN_COOKIE);
  const back = (query: Record<string, string>) =>
    redirectToIntegrations(query, fromSetup ? "/app/onboarding/step/crm" : "/app/settings/integrations");
  try {
    const db = getSupabaseAdmin();
    const limited = await rateLimitWebhook(db, request, "oauth");
    if (!limited.allowed) {
      await recordHttpSample(db, "/api/leadconnector/oauth/callback", true);
      return new NextResponse("Too many requests", { status: 429 });
    }
  } catch {
    /* misconfigured staging denylist must not skip the OAuth error mapping below */
  }
  const errorParam = incoming.searchParams.get("error");
  if (errorParam) {
    return back({ ghl_error: "oauth_denied" });
  }

  const code = incoming.searchParams.get("code");
  const stateParam = incoming.searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GHL_OAUTH_COOKIE)?.value ?? null;
  cookieStore.delete(GHL_OAUTH_COOKIE);

  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    return back({ ghl_error: "oauth_invalid" });
  }

  const state = parseOAuthState(stateParam);
  if (!state) {
    return back({ ghl_error: "oauth_expired" });
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const admin = getSupabaseAdmin();
    const locationId = tokens.locationId ?? incoming.searchParams.get("locationId");

    if (tokens.userType === "Company" && !locationId) {
      await stashAgencySession(admin, {
        orgId: state.orgId,
        memberId: state.memberId,
        tokens,
      });
      return back({ select_location: "1" });
    }

    if (!locationId) {
      return back({ ghl_error: "oauth_no_location" });
    }

    const linked = await linkLocationToOrg(admin, {
      orgId: state.orgId,
      tokens,
      locationId,
      memberId: state.memberId,
    });
    if (!linked.ok) {
      return back({
        ghl_error: linked.error === "location_claimed" ? "location_claimed" : "oauth_failed",
      });
    }
    // Ask the CRM for a live answer before claiming this worked.
    const name = await fetchLocationName(admin, state.orgId, locationId).catch(() => null);
    return back(
      name ? { connected: "1" } : { connected: "1", unverified: "1" }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "staging_crm_location_not_allowlisted") {
      return back({ ghl_error: "staging_blocked" });
    }
    return back({ ghl_error: "oauth_failed" });
  }
}
