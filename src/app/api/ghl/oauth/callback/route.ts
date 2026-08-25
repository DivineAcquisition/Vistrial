import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GHL_OAUTH_COOKIE } from "@/lib/ghl/constants";
import { appUrl } from "@/lib/ghl/env";
import { exchangeAuthorizationCode } from "@/lib/ghl/client";
import { linkLocationToOrg, stashAgencySession } from "@/lib/ghl/connect";
import { parseOAuthState } from "@/lib/ghl/oauth-state";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectToWorkspace(query: Record<string, string>) {
  const url = new URL("/app/settings/workspace", appUrl());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  try {
    const db = getSupabaseAdmin();
    const limited = await rateLimitWebhook(db, request, "oauth");
    if (!limited.allowed) {
      await recordHttpSample(db, "/api/ghl/oauth/callback", true);
      return new NextResponse("Too many requests", { status: 429 });
    }
  } catch {
    /* misconfigured staging denylist must not skip the OAuth error mapping below */
  }
  const errorParam = incoming.searchParams.get("error");
  if (errorParam) {
    return redirectToWorkspace({ ghl_error: "oauth_denied" });
  }

  const code = incoming.searchParams.get("code");
  const stateParam = incoming.searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GHL_OAUTH_COOKIE)?.value ?? null;
  cookieStore.delete(GHL_OAUTH_COOKIE);

  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    return redirectToWorkspace({ ghl_error: "oauth_invalid" });
  }

  const state = parseOAuthState(stateParam);
  if (!state) {
    return redirectToWorkspace({ ghl_error: "oauth_expired" });
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
      return redirectToWorkspace({ select_location: "1" });
    }

    if (!locationId) {
      return redirectToWorkspace({ ghl_error: "oauth_no_location" });
    }

    const linked = await linkLocationToOrg(admin, {
      orgId: state.orgId,
      tokens,
      locationId,
      memberId: state.memberId,
    });
    if (!linked.ok) {
      return redirectToWorkspace({
        ghl_error: linked.error === "location_claimed" ? "location_claimed" : "oauth_failed",
      });
    }
    return redirectToWorkspace({ connected: "1" });
  } catch (error) {
    if (error instanceof Error && error.message === "staging_crm_location_not_allowlisted") {
      return redirectToWorkspace({ ghl_error: "staging_blocked" });
    }
    return redirectToWorkspace({ ghl_error: "oauth_failed" });
  }
}
