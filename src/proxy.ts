import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/auth/paths";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (export `proxy`, not
 * `middleware`). Session refresh and `/app` protection live here.
 *
 * Cookie writes must land on both the request and the response, or the
 * refreshed session will not persist.
 *
 * Do not set `runtime` in this file — Next.js 16 Proxy is Node.js only and
 * throws if that segment config is present.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (path.startsWith("/app") && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("redirect", safeInternalPath(path + request.nextUrl.search, path));
    return NextResponse.redirect(login);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Cover /app and nested routes. Static assets, images, and the favicon
     * are not under /app, so they never wait on a Supabase round-trip.
     */
    "/app",
    "/app/:path*",
  ],
};
