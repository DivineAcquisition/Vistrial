import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { completeSourceOAuth } from "@/lib/sources/oauth";
import { parseSourceOAuthState } from "@/lib/sources/oauth-state";
import { sourceOAuthCookieName } from "@/lib/sources/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectToPortal(query: Record<string, string>) {
  const url = new URL("/portal", appUrl());
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const db = getSupabaseAdmin();
  try {
    const limited = await rateLimitWebhook(db, request, "oauth");
    if (!limited.allowed) {
      await recordHttpSample(db, "/api/sources/oauth/callback", true);
      return new NextResponse("Too many requests", { status: 429 });
    }
  } catch {
    /* continue */
  }

  if (incoming.searchParams.get("error")) {
    return redirectToPortal({ source_error: "oauth_denied" });
  }

  const code = incoming.searchParams.get("code");
  const stateParam = incoming.searchParams.get("state");
  const state = stateParam ? parseSourceOAuthState(stateParam) : null;
  const cookieStore = await cookies();
  const cookieState = state ? cookieStore.get(sourceOAuthCookieName(state.kind))?.value ?? null : null;
  if (state) cookieStore.delete(sourceOAuthCookieName(state.kind));

  if (!code || !stateParam || !cookieState || stateParam !== cookieState || !state) {
    return redirectToPortal({ source_error: "oauth_invalid" });
  }

  try {
    await completeSourceOAuth(db, { orgId: state.orgId, kind: state.kind, code });
    await recordHttpSample(db, "/api/sources/oauth/callback", false);
    return redirectToPortal({ source_connected: state.kind });
  } catch {
    await recordHttpSample(db, "/api/sources/oauth/callback", true);
    return redirectToPortal({ source_error: "oauth_failed" });
  }
}
