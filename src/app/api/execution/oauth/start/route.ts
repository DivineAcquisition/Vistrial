import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ORG_COOKIE_NAME } from "@/lib/auth/cookies";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getSessionUser, listActiveMemberships } from "@/lib/auth/session";
import { discordAuthorizeUrl } from "@/lib/execution/discord";
import { discordConfigured, executionOAuthCookieName, googleDriveConfigured, slackConfigured } from "@/lib/execution/env";
import { driveAuthorizeUrl } from "@/lib/execution/google-drive";
import { isExecutionKind, type ExecutionKind } from "@/lib/execution/kinds";
import { createExecutionOAuthState } from "@/lib/execution/oauth-state";
import { slackAuthorizeUrl } from "@/lib/execution/slack";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONFIGURED: Record<ExecutionKind, () => boolean> = {
  slack: slackConfigured,
  discord: discordConfigured,
  google_drive: googleDriveConfigured,
};

const AUTHORIZE: Record<ExecutionKind, (state: string) => string> = {
  slack: slackAuthorizeUrl,
  discord: discordAuthorizeUrl,
  google_drive: driveAuthorizeUrl,
};

/** One button, then the provider's own consent screen. Nothing is typed or pasted. */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isExecutionKind(kind)) return NextResponse.json({ error: "Unknown destination." }, { status: 400 });
  if (!CONFIGURED[kind]()) {
    return NextResponse.json({ error: "This is not set up on this deployment yet." }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await listActiveMemberships(user.id);
  const cookieStore = await cookies();
  const active =
    memberships.find((membership) => membership.orgId === cookieStore.get(ORG_COOKIE_NAME)?.value) ?? memberships[0];
  if (!active) return NextResponse.json({ error: "No workspace." }, { status: 403 });

  const supabase = await createClient();
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!canManageOrgSettings(active.role, Boolean(platformAdmin))) {
    return NextResponse.json({ error: "Only an owner or admin can connect this." }, { status: 403 });
  }

  const state = createExecutionOAuthState(active.orgId, active.id, kind);
  cookieStore.set(executionOAuthCookieName(kind), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return NextResponse.redirect(AUTHORIZE[kind](state));
}
