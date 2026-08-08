import { NextResponse } from "next/server";

import {
  supabasePublishableKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";

/**
 * Liveness plus a boolean config check. Never returns secret values — only
 * whether the server has what sign-in needs. Accepts classic and Vercel
 * Marketplace env names.
 */
export function GET() {
  const url = Boolean(supabaseUrl());
  const publishable = Boolean(supabasePublishableKey());
  const serviceRole = Boolean(supabaseServiceRoleKey());

  return NextResponse.json({
    ok: url && publishable && serviceRole,
    supabase: { url, publishable, serviceRole },
  });
}
