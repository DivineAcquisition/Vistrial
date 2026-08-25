import { NextResponse, type NextRequest } from "next/server";

import { ORG_COOKIE_NAME, PENDING_INVITE_COOKIE, ONBOARDING_DEFER_COOKIE } from "@/lib/auth/cookies";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(ORG_COOKIE_NAME);
  response.cookies.delete(PENDING_INVITE_COOKIE);
  response.cookies.delete(ONBOARDING_DEFER_COOKIE);
  return response;
}
