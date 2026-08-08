import { NextResponse } from "next/server";

/**
 * Liveness plus a boolean config check. Never returns secret values — only
 * whether the server has what sign-in needs.
 */
export function GET() {
  const url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const publishable = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
  const serviceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  return NextResponse.json({
    ok: url && publishable && serviceRole,
    supabase: { url, publishable, serviceRole },
  });
}
