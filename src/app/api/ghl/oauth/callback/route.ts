import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GHL_OAUTH_COOKIE, GHL_OAUTH_RETURN_COOKIE } from "@/lib/ghl/constants";
import { appUrl } from "@/lib/ghl/env";
import { exchangeAuthorizationCode } from "@/lib/ghl/client";
import { linkLocationToOrg, stashAgencySession } from "@/lib/ghl/connect";
import { parseOAuthState } from "@/lib/ghl/oauth-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectAfterOauth(query: Record<string, string>, returnPath: string | null) {
  const allowed =
    returnPath &&
    (returnPath.startsWith("/app/setup") || returnPath.startsWith("/app/settings/integrations")) &&
    !returnPath.startsWith("//") &&
    !returnPath.includes("://");
  const url = new URL(allowed ? returnPath : "/app/settings/integrations", appUrl());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const cookieStore = await cookies();
  const returnPath = cookieStore.get(GHL_OAUTH_RETURN_COOKIE)?.value ?? null;
  cookieStore.delete(GHL_OAUTH_RETURN_COOKIE);

  const errorParam = incoming.searchParams.get("error");
  if (errorParam) {
    return redirectAfterOauth({ ghl_error: "oauth_denied" }, returnPath);
  }

  const code = incoming.searchParams.get("code");
  const stateParam = incoming.searchParams.get("state");
  const cookieState = cookieStore.get(GHL_OAUTH_COOKIE)?.value ?? null;
  cookieStore.delete(GHL_OAUTH_COOKIE);

  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    return redirectAfterOauth({ ghl_error: "oauth_invalid" }, returnPath);
  }

  const state = parseOAuthState(stateParam);
  if (!state) {
    return redirectAfterOauth({ ghl_error: "oauth_expired" }, returnPath);
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
      return redirectAfterOauth({ select_location: "1" }, returnPath);
    }

    if (!locationId) {
      return redirectAfterOauth({ ghl_error: "oauth_no_location" }, returnPath);
    }

    const linked = await linkLocationToOrg(admin, {
      orgId: state.orgId,
      tokens,
      locationId,
      memberId: state.memberId,
    });
    if (!linked.ok) {
      return redirectAfterOauth(
        {
          ghl_error: linked.error === "location_claimed" ? "location_claimed" : "oauth_failed",
        },
        returnPath
      );
    }
    return redirectAfterOauth({ connected: "1" }, returnPath);
  } catch {
    return redirectAfterOauth({ ghl_error: "oauth_failed" }, returnPath);
  }
}
