import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/supabase/env";

const LOGIN_PATH = "/login";
const ADMIN_HOME = "/appointments";
const PORTAL_HOME = "/portal";

/** Paths that never require a session. */
function isPublicPath(pathname: string): boolean {
  if (pathname === LOGIN_PATH) return true;
  if (pathname.startsWith("/invite/")) return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
}

function isPortalPath(pathname: string): boolean {
  return pathname === PORTAL_HOME || pathname.startsWith(`${PORTAL_HOME}/`);
}

/**
 * Refreshes the Supabase session on every request and gates the application.
 *
 * Admin surfaces require a session with no portal membership. The portal
 * requires a membership. Share links and invitations are public. `/api/*` is
 * excluded by the matcher: webhooks authenticate with their own secret header,
 * not a cookie.
 */
export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  const { pathname, search } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  // Unconfigured deploy: nobody can sign in at all, so let the request through
  // and let the app render its "Supabase not connected" state instead of a
  // redirect loop into a login page that cannot work.
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
    url.pathname = LOGIN_PATH;
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return withCookies(NextResponse.redirect(url), response);
  }

  if (!user) return response;

  // Resolve whether this session is a portal member. The service role is not
  // available in the edge proxy, so the membership check uses the same
  // publishable client against a table with no RLS policies — which means the
  // query would return nothing. Membership is therefore enforced again in
  // requireAdmin / requireClient on every page and action; here we only route
  // logged-in users away from the wrong home when the cookie already carries
  // a role hint, and otherwise let the server guard decide.
  //
  // Practical rule at the proxy: a signed-in user on /login goes to the admin
  // home, and the server redirects portal members from there to /portal.
  if (pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  // Portal paths stay reachable; admin paths stay reachable. Cross-boundary
  // redirects happen in requireAdmin / requireClient so the decision uses the
  // service role and the real membership row.
  void isPortalPath;

  return response;
}

/** Carries any refreshed session cookies onto a redirect. */
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
