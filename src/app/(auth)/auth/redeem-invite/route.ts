import { NextResponse, type NextRequest } from "next/server";

import { ORG_COOKIE_NAME, PENDING_INVITE_COOKIE, orgCookieOptions } from "@/lib/auth/cookies";
import { redeemInvite } from "@/lib/auth/invites";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(`/accept-invite/${token}`, request.url));
  }

  const result = await redeemInvite(token, user.id, user.email ?? null);
  if (result.ok) {
    const response = NextResponse.redirect(new URL("/app", request.url));
    response.cookies.set(ORG_COOKIE_NAME, result.orgId, orgCookieOptions);
    response.cookies.delete(PENDING_INVITE_COOKIE);
    return response;
  }

  const dest = new URL(`/accept-invite/${token}`, request.url);
  dest.searchParams.set("error", result.error);
  return NextResponse.redirect(dest);
}
