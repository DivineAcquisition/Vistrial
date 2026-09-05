import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { pathRefreshesAuthSession, safeInternalPath } from "@/lib/auth/paths";
import {
  canonicalOriginUrl,
  resolveHostRoute,
  type CanonicalOrigin,
} from "@/lib/domains/routing";
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

function hostRedirect(request: NextRequest, origin: "same" | CanonicalOrigin, pathname: string, preserveSearch: boolean) {
  if (origin === "same") {
    const dest = request.nextUrl.clone();
    dest.pathname = pathname;
    if (!preserveSearch) dest.search = "";
    return NextResponse.redirect(dest);
  }
  const dest = new URL(canonicalOriginUrl(origin));
  dest.pathname = pathname;
  dest.search = preserveSearch ? request.nextUrl.search : "";
  return NextResponse.redirect(dest);
}

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (export `proxy`, not
 * `middleware`). Host isolation, session refresh, and `/app` protection live
 * here.
 *
 * Cookie writes must land on both the request and the response, or the
 * refreshed session will not persist.
 *
 * Do not set `runtime` in this file — Next.js 16 Proxy is Node.js only and
 * throws if that segment config is present.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  const hostRoute = resolveHostRoute({ host, pathname: path });
  if (hostRoute.action === "redirect") {
    return hostRedirect(request, hostRoute.origin, hostRoute.pathname, hostRoute.preserveSearch);
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

  if ((path.startsWith("/app") || path.startsWith("/portal") || path.startsWith("/stellar")) && !user) {
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
    "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
