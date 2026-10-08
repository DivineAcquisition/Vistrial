import { NextResponse, type NextRequest } from "next/server";

import { ORG_COOKIE_NAME, PENDING_INVITE_COOKIE, ONBOARDING_DEFER_COOKIE } from "@/lib/auth/cookies";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete(ORG_COOKIE_NAME);
  response.cookies.delete(PENDING_INVITE_COOKIE);
  response.cookies.delete(ONBOARDING_DEFER_COOKIE);
  return response;
}

// Link prefetches and crawlers issue GETs; signing out here would end sessions nobody chose to end.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
