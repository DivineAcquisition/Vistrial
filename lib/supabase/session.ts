import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { hostSurface } from "@/lib/hosts";
import {
  authCookieOptions,
  enforceHostOnlyCookieOptions,
} from "@/lib/supabase/cookie-options";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Session-aware server client. One per render — never shared across requests,
 * because each carries the caller's session. Separate from the service-role
 * client in `server.ts`, which bypasses RLS and knows nothing about sessions.
 *
 * Cookies are host-only (exact hostname, never `.vistrial.io`), http-only,
 * secure outside localhost, and SameSite=Lax.
 */
export async function createSessionClient() {
  const env = supabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  const cookieStore = await cookies();
  const headerList = await headers();
  const hostHeader =
    headerList.get("x-forwarded-host") ?? headerList.get("host");
  const surface = hostSurface(hostHeader);
  const cookieDefaults = authCookieOptions({ hostHeader, surface });

  return createServerClient(env.url, env.publishableKey, {
    cookieOptions: cookieDefaults,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(
              name,
              value,
              enforceHostOnlyCookieOptions(options, cookieDefaults)
            );
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes sessions
          // on every request, so this is safe to swallow here.
        }
      },
    },
  });
}
