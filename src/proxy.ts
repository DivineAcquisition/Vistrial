import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { pathRefreshesAuthSession, safeInternalPath } from "@/lib/auth/paths";
import { hostnameFromHostHeader, isOperatorAppHost } from "@/lib/marketing/hosts";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { fetchForSupabaseKey } from "@/lib/supabase/fetch";
import type { Database } from "@/types/database";

function pathWithSearch(request: NextRequest) {
  return request.nextUrl.pathname + request.nextUrl.search;
}

function nextWithPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vistrial-pathname", pathWithSearch(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

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
  const path = request.nextUrl.pathname;
  const hostname = hostnameFromHostHeader(request.headers.get("host"));

  if (path === "/" && isOperatorAppHost(hostname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  if (!pathRefreshesAuthSession(path)) {
    return nextWithPath(request);
  }

  let supabaseResponse = nextWithPath(request);

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const publishableKey = supabasePublishableKey();
  const supabase = createServerClient<Database>(
    supabaseUrl(),
    publishableKey,
    {
      global: { fetch: fetchForSupabaseKey(publishableKey) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = nextWithPath(request);
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

  if (path.startsWith("/app") && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set(
      "redirect",
      safeInternalPath(pathWithSearch(request), path)
    );
    return NextResponse.redirect(login);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/no-access",
    "/auth/:path*",
    "/accept-invite/:path*",
    "/app",
    "/app/:path*",
  ],
};
