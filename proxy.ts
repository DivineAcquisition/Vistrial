import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/supabase/env";

const LOGIN_PATH = "/login";
const PORTAL_LOGIN_PATH = "/portal/login";
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

/**
 * Refreshes the Supabase session on every request and gates the application.
 *
 * Team and portal populations use separate sign-in surfaces. Membership is
 * enforced again in requireAdmin / requireClient on every page and action.
 */
export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  const { pathname, search } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.publishableKey, {
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
          response.cookies.set(name, value, options);
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
      pathname === PORTAL_HOME || pathname.startsWith(`${PORTAL_HOME}/`);
    url.pathname = portalSurface ? PORTAL_LOGIN_PATH : LOGIN_PATH;
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return withCookies(NextResponse.redirect(url), response);
  }

  if (!user) return response;

  if (pathname === LOGIN_PATH) {
    // Send authenticated visitors through `/`, which picks the real home
    // (attention, MFA challenge, enrolment, password reset, portal). A hard
    // jump to ADMIN_HOME skips those gates and, with a prerendered detour
    // page, can loop login → continue → login until the browser gives up.
    const url = request.nextUrl.clone();
    url.pathname = "/";
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
