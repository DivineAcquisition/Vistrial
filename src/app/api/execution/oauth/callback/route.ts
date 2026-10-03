import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { getSessionUser } from "@/lib/auth/session";
import { saveConnection } from "@/lib/execution/connections";
import { discordExchangeCode } from "@/lib/execution/discord";
import { executionOAuthCookieName } from "@/lib/execution/env";
import { ProviderError } from "@/lib/execution/errors";
import { driveExchangeCode } from "@/lib/execution/google-drive";
import { parseExecutionOAuthState } from "@/lib/execution/oauth-state";
import { slackExchangeCode } from "@/lib/execution/slack";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BACK = "/app/settings/integrations";

function back(query: Record<string, string>) {
  const url = new URL(BACK, appUrl());
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

/** One redirect URI for all three providers; the signed state says which one this is. */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const db = getSupabaseAdmin();
  try {
    const limited = await rateLimitWebhook(db, request, "oauth");
    if (!limited.allowed) {
      await recordHttpSample(db, "/api/execution/oauth/callback", true);
      return new NextResponse("Too many requests", { status: 429 });
    }
  } catch {
    /* continue */
  }

  const stateParam = incoming.searchParams.get("state");
  const state = stateParam ? parseExecutionOAuthState(stateParam) : null;
  const cookieStore = await cookies();
  const cookieState = state ? (cookieStore.get(executionOAuthCookieName(state.kind))?.value ?? null) : null;
  if (state) cookieStore.delete(executionOAuthCookieName(state.kind));

  if (!state || !stateParam || !cookieState || stateParam !== cookieState) {
    return back({ exec_error: "oauth_invalid" });
  }
  // The person who started this must be the one finishing it.
  const user = await getSessionUser();
  const { data: member } = await db
    .from("org_members")
    .select("user_id, role, active")
    .eq("id", state.memberId)
    .eq("org_id", state.orgId)
    .maybeSingle();
  if (!user || !member || !member.active || member.user_id !== user.id) {
    return back({ exec_error: "oauth_invalid" });
  }

  if (incoming.searchParams.get("error")) return back({ exec_error: "oauth_denied", exec_kind: state.kind });
  const code = incoming.searchParams.get("code");
  if (!code) return back({ exec_error: "oauth_invalid" });

  try {
    if (state.kind === "slack") {
      const install = await slackExchangeCode(code);
      await saveConnection(db, {
        orgId: state.orgId,
        kind: "slack",
        memberId: state.memberId,
        accountLabel: install.teamName,
        externalAccountId: install.teamId,
        secret: install.token,
      });
    } else if (state.kind === "discord") {
      const install = await discordExchangeCode(code);
      // No client token: one bot serves every server. Only the server id is kept.
      await saveConnection(db, {
        orgId: state.orgId,
        kind: "discord",
        memberId: state.memberId,
        accountLabel: install.guildName,
        externalAccountId: install.guildId,
      });
    } else {
      const grant = await driveExchangeCode(code);
      await saveConnection(db, {
        orgId: state.orgId,
        kind: "google_drive",
        memberId: state.memberId,
        accountLabel: null,
        secret: grant.accessToken,
        refresh: grant.refreshToken,
        expiresAt: grant.expiresAt,
      });
    }
    await recordHttpSample(db, "/api/execution/oauth/callback", false);
    return back({ exec_connected: state.kind });
  } catch (error) {
    await recordHttpSample(db, "/api/execution/oauth/callback", true);
    const tooBroad = error instanceof ProviderError && /more access/.test(error.message);
    return back({ exec_error: tooBroad ? "too_broad" : "oauth_failed", exec_kind: state.kind });
  }
}
