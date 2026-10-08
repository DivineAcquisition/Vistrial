import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { sessionCookieOptions } from "@/lib/auth/session-cookie";
import { requireSupabaseBrowserEnv } from "@/lib/supabase/env";
import { fetchForSupabaseKey } from "@/lib/supabase/fetch";
import type { Database } from "@/types/database";

/**
 * One server client per request. `getUser()` runs before the client is
 * handed out so PostgREST calls carry the user JWT. A second client on the
 * same request that skipped `getUser()` would query as `anon`; `org_members`
 * policies are `TO authenticated`, so the membership row exists and still
 * comes back empty — which the app treated as "no workspace".
 */
export const createClient = cache(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const { url, key } = requireSupabaseBrowserEnv();

  const client = createServerClient<Database>(url, key, {
    global: { fetch: fetchForSupabaseKey(key) },
    cookieOptions: sessionCookieOptions(headerStore.get("x-forwarded-host") ?? headerStore.get("host")),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component. Session refresh writes cookies in src/proxy.ts.
        }
      },
    },
  });

  await client.auth.getUser();
  return client;
});
