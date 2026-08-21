import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseServiceEnv } from "@/lib/supabase/env-server";
import { fetchForSupabaseKey } from "@/lib/supabase/fetch";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses RLS.
 * Only for webhook handlers, invite redemption, background jobs, and
 * member self-profile writes (RLS lets owner/admin mutate org_members;
 * setters still need to edit their own name and email).
 * Throws if it is ever imported into a browser bundle.
 *
 * Created on first use so `next build` can collect route data when Vercel
 * env aliases are not inlined at import time.
 */
if (typeof window !== "undefined") {
  throw new Error("supabase/admin.ts was imported client-side. It must not be.");
}

let admin: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (admin) return admin;
  const { url, key } = requireSupabaseServiceEnv();
  admin = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchForSupabaseKey(key) },
  });
  return admin;
}
