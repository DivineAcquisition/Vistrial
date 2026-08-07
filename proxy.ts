import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hostSurface, pathAllowedOnHost } from "@/lib/hosts";
import {
  authCookieOptions,
  enforceHostOnlyCookieOptions,
} from "@/lib/supabase/cookie-options";
import { supabaseEnv } from "@/lib/supabase/env";

const LOGIN_PATH = "/login";
const PORTAL_LOGIN_PATH = "/portal/login";
const ADMIN_HOME = "/attention";
const PORTAL_HOME = "/portal";

/** Paths that never require a session. */
function isPublicPath(pathname: string): boolean {
  if (pathname === LOGIN_PATH) return true;
  if (pathname === PORTAL_LOGIN_PATH) return true;
  if (pathname.startsWith("/login/reset")) return true;
  if (pathname.startsWith("/invite/")) return true;
  if (pathname.startsWith("/share/")) return true;
  if (pathname.startsWith("/onboarding/")) return true;
  return false;
}

function notFound(): NextResponse {
  // Plain 404 — not a redirect and not a permission error. Cross-host probes
  // must not learn that a route exists on the other surface.
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Refreshes the Supabase session on every request and gates the application.
 *
 * Host matching runs first: admin.vistrial.io serves the staff workspace,
 * app.vistrial.io serves the client portal, and anything else is not found.
 * Team and portal populations use separate sign-in surfaces. Membership is
 * enforced again in requireAdmin / requireClient on every page and action.
 */
export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  const { pathname, search } = request.nextUrl;
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const surface = hostSurface(hostHeader);

  if (surface === "unknown") {
    return notFound();
  }

  if (!pathAllowedOnHost(surface, pathname)) {
    return notFound();
  }

  // Root resolves inside the originating host — never across surfaces.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.search = "";
    if (surface === "client") {
      url.pathname = PORTAL_HOME;
      return NextResponse.redirect(url);
    }
    if (surface === "staff") {
      url.pathname = ADMIN_HOME;
      return NextResponse.redirect(url);
    }
    // local: fall through to the root page's path-based resolution
  }

  const publicPath = isPublicPath(pathname);

  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const cookieDefaults = authCookieOptions({ hostHeader, surface });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookieOptions: cookieDefaults,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(
            name,
            value,
            enforceHostOnlyCookieOptions(options, cookieDefaults)
          );
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !publicPath) {
    const url = request.nextUrl.clone();
    const portalSurface =
      surface === "client" ||
      (surface === "local" &&
        (pathname === PORTAL_HOME || pathname.startsWith(`${PORTAL_HOME}/`)));
    url.pathname = portalSurface ? PORTAL_LOGIN_PATH : LOGIN_PATH;
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    // Relative redirect — stays on the originating host.
    return withCookies(NextResponse.redirect(url), response);
  }

  if (!user) return response;

  if (pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  if (pathname === PORTAL_LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = PORTAL_HOME;
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  return response;
}

function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
