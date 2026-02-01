import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Domain configuration
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io";
const ACCESS_DOMAIN = `access.${BASE_DOMAIN}`;
const APP_DOMAIN = `app.${BASE_DOMAIN}`;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  
  // Determine which subdomain we're on
  const isAccessDomain = hostname.includes("access.");
  const isAppDomain = hostname.includes("app.");
  const isLocalhost = hostname.includes("localhost") || hostname.includes("127.0.0.1");

  // ===========================================
  // ACCESS SUBDOMAIN (access.vistrial.io)
  // Landing page, login, signup only
  // ===========================================
  if (isAccessDomain) {
    // If authenticated, redirect to app domain dashboard
    if (user) {
      return NextResponse.redirect(new URL(`https://${APP_DOMAIN}/dashboard`));
    }
    
    // Allow all paths on access domain for unauthenticated users
    return supabaseResponse;
  }

  // ===========================================
  // APP SUBDOMAIN (app.vistrial.io)
  // Dashboard and all app features
  // ===========================================
  if (isAppDomain) {
    // If not authenticated, redirect to access domain for login
    if (!user) {
      const accessUrl = new URL(`https://${ACCESS_DOMAIN}/login`);
      accessUrl.searchParams.set("redirect", `https://${APP_DOMAIN}${pathname}`);
      return NextResponse.redirect(accessUrl);
    }

    // If on root of app domain, redirect to dashboard
    if (pathname === "/") {
      return NextResponse.redirect(new URL(`https://${APP_DOMAIN}/dashboard`));
    }

    return supabaseResponse;
  }

  // ===========================================
  // LOCALHOST / DEFAULT BEHAVIOR
  // ===========================================
  if (isLocalhost) {
    const authPaths = ["/login", "/signup", "/forgot-password", "/verify"];
    const isAuthPath = authPaths.some((path) => pathname === path);
    
    const protectedPaths = [
      "/dashboard",
      "/bookings",
      "/customers",
      "/memberships",
      "/quotes",
      "/settings",
      "/sequences",
    ];
    const isProtectedPath = protectedPaths.some((path) =>
      pathname.startsWith(path)
    );

    // Redirect unauthenticated users from protected routes
    if (isProtectedPath && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    // Redirect authenticated users away from auth pages to dashboard
    if (isAuthPath && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Redirect authenticated users from landing page to dashboard
    if (pathname === "/" && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
