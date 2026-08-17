import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS.
 * Only for webhook handlers and background jobs.
 * Throws if it is ever imported into a browser bundle.
 */
if (typeof window !== "undefined") {
  throw new Error("supabase/admin.ts was imported client-side. It must not be.");
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);
