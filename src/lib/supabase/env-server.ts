import "server-only";

import { supabaseUrl } from "@/lib/supabase/env";

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/**
 * Service-role / secret key. Never expose to the browser.
 * Accepts SUPABASE_SERVICE_ROLE_KEY and the Marketplace alias SUPABASE_SECRET_KEY.
 */
export function supabaseServiceRoleKey(): string {
  return firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

export function requireSupabaseServiceEnv(): { url: string; key: string } {
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or the Vercel Marketplace aliases SUPABASE_URL / SUPABASE_SECRET_KEY)."
    );
  }
  return { url, key };
}
