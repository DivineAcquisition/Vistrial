import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GHL_OAUTH_COOKIE } from "@/lib/ghl/constants";
import { appUrl } from "@/lib/ghl/env";
import { exchangeAuthorizationCode } from "@/lib/ghl/client";
import { linkLocationToOrg, stashAgencySession } from "@/lib/ghl/connect";
import { parseOAuthState } from "@/lib/ghl/oauth-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectToIntegrations(query: Record<string, string>) {
  const url = new URL("/app/settings/integrations", appUrl());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const errorParam = incoming.searchParams.get("error");
  if (errorParam) {
    return redirectToIntegrations({ ghl_error: "oauth_denied" });
  }

  const code = incoming.searchParams.get("code");
  const stateParam = incoming.searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GHL_OAUTH_COOKIE)?.value ?? null;
  cookieStore.delete(GHL_OAUTH_COOKIE);

  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    return redirectToIntegrations({ ghl_error: "oauth_invalid" });
  }

  const state = parseOAuthState(stateParam);
  if (!state) {
    return redirectToIntegrations({ ghl_error: "oauth_expired" });
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
      return redirectToIntegrations({ select_location: "1" });
    }

    if (!locationId) {
      return redirectToIntegrations({ ghl_error: "oauth_no_location" });
    }

    const linked = await linkLocationToOrg(admin, {
      orgId: state.orgId,
      tokens,
      locationId,
      memberId: state.memberId,
    });
    if (!linked.ok) {
      return redirectToIntegrations({
        ghl_error: linked.error === "location_claimed" ? "location_claimed" : "oauth_failed",
      });
    }
    return redirectToIntegrations({ connected: "1" });
  } catch {
    return redirectToIntegrations({ ghl_error: "oauth_failed" });
  }
}
