import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";

/**
 * Service-role client. Bypasses RLS, so it must never be imported into a
 * Client Component or exposed through an unauthenticated route.
 */
export function createServiceClient() {
  const url = supabaseUrl();
  const serviceRoleKey = supabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or the Vercel Marketplace aliases SUPABASE_URL / SUPABASE_SECRET_KEY)."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
