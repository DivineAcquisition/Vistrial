import { createBrowserClient } from "@supabase/ssr";

import { hostSurface } from "@/lib/hosts";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * Browser Supabase client. Cookie name follows the hostname surface so staff
 * and portal sessions never share a storage key even on local single-host dev.
 * Domain is never set — host-only cookies only.
 */
export function createClient() {
  const host =
    typeof window !== "undefined" ? window.location.hostname : "localhost";
  const surface = hostSurface(host);
  const cookieDefaults = authCookieOptions({ hostHeader: host, surface });

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: cookieDefaults.name,
        path: cookieDefaults.path,
        sameSite: cookieDefaults.sameSite,
        secure: cookieDefaults.secure,
        // Browser-set chunks cannot be httpOnly; the proxy sets the real
        // session cookies as httpOnly on the response.
      },
    }
  );
}
