import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/supabase/env";

const LOGIN_PATH = "/login";
const DEFAULT_DESTINATION = "/appointments";

/**
 * Refreshes the Supabase session on every request and gates the application.
 *
 * Everything requires a session except the login page itself. `/api/*` is
 * excluded by the matcher: webhooks authenticate with their own secret header,
 * not a cookie.
 */
export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  const { pathname, search } = request.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;

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

  if (!user && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return withCookies(NextResponse.redirect(url), response);
  }

  if (user && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_DESTINATION;
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

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
