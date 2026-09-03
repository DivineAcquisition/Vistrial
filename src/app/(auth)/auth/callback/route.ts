import { NextResponse, type NextRequest } from "next/server";

import { ORG_COOKIE_NAME, PENDING_INVITE_COOKIE, orgCookieOptions } from "@/lib/auth/cookies";
import { redeemInvite } from "@/lib/auth/invites";
import {
  inviteTokenFromPath,
  isAcceptInvitePath,
  safeInternalPath,
} from "@/lib/auth/paths";
import { listActiveMemberships } from "@/lib/auth/session";
import { landingPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next") ?? url.searchParams.get("redirect"));
  const pendingFromQuery = inviteTokenFromPath(next);
  const pendingFromCookie = request.cookies.get(PENDING_INVITE_COOKIE)?.value ?? null;
  const pendingToken = pendingFromQuery ?? pendingFromCookie;

  if (!code) {
    return redirectTo(request, "/login");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectTo(request, "/login?error=callback");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectTo(request, "/login");
  }

  if (pendingToken) {
    const result = await redeemInvite(pendingToken, user.id, user.email ?? null);

    let dest: string;
    if (result.ok) {
      const memberships = await listActiveMemberships(user.id);
      const membership = memberships.find((m) => m.orgId === result.orgId);
      dest = landingPath(membership?.surfaceAccess, membership?.role);
    } else if (result.error === "email_mismatch") {
      dest = `/accept-invite/${pendingToken}`;
    } else if (isAcceptInvitePath(next)) {
      dest = next;
    } else {
      dest = `/accept-invite/${pendingToken}`;
    }
    const response = redirectTo(request, dest);

    response.cookies.delete(PENDING_INVITE_COOKIE);
    if (result.ok) {
      response.cookies.set(ORG_COOKIE_NAME, result.orgId, orgCookieOptions);
    }
    return response;
  }

  if (isAcceptInvitePath(next)) {
    return redirectTo(request, next);
  }

  const memberships = await listActiveMemberships(user.id);
  if (memberships.length === 0) {
    return redirectTo(request, "/no-access");
  }

  return redirectTo(
    request,
    next.startsWith("/app") || next.startsWith("/portal")
      ? next
      : landingPath(memberships[0]?.surfaceAccess, memberships[0]?.role)
  );
}
