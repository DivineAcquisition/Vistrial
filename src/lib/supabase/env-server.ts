import "server-only";

import { supabaseUrl } from "@/lib/supabase/env";

/**
 * Service-role / secret key. Never expose to the browser.
 * Accepts SUPABASE_SERVICE_ROLE_KEY and the Marketplace alias SUPABASE_SECRET_KEY.
 *
 * Names are static so this cannot accidentally ride a dynamic `process.env[name]`
 * helper that Next would strip from other bundles.
 */
export function supabaseServiceRoleKey(): string {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) return serviceRole;
  return process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
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

export function supabaseServiceRoleKeyKind(
  key = supabaseServiceRoleKey()
): "service_role_jwt" | "secret" | "other" | null {
  if (!key) return null;
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("eyJ")) return "service_role_jwt";
  return "other";
}
