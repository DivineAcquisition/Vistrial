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
  const isAccessDomain = hostname.includes("access.") || hostname === ACCESS_DOMAIN;
  const isAppDomain = hostname.includes("app.") || hostname === APP_DOMAIN;
  const isLocalhost = hostname.includes("localhost") || hostname.includes("127.0.0.1");

  // For localhost, check the pathname to determine behavior
  // /login, /signup, / = access behavior
  // /dashboard, /onboarding, etc = app behavior

  // ===========================================
  // ACCESS SUBDOMAIN (access.vistrial.io)
  // Landing page, login, signup only
  // ===========================================
  if (isAccessDomain) {
    // Auth pages allowed on access domain
    const accessAllowedPaths = ["/", "/login", "/signup", "/forgot-password", "/verify", "/pricing", "/features", "/demo", "/privacy", "/terms"];
    const isAllowedPath = accessAllowedPaths.some(path => pathname === path || pathname.startsWith(path + "/"));
    
    // If authenticated user on access domain
    if (user) {
      // Check business status
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const business = businesses?.[0] || null;
      
      // Redirect to app domain
      const appUrl = new URL(`https://${APP_DOMAIN}`);
      if (!business || !business.onboarding_completed) {
        appUrl.pathname = "/onboarding";
      } else {
        appUrl.pathname = "/dashboard";
      }
      
      return NextResponse.redirect(appUrl);
    }
    
    // Not authenticated - allow access to auth pages
    if (!isAllowedPath) {
      // Redirect unknown paths to home
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    
    return supabaseResponse;
  }

  // ===========================================
  // APP SUBDOMAIN (app.vistrial.io)
  // Dashboard, onboarding, all app features
  // ===========================================
  if (isAppDomain) {
    // Protected routes on app domain
    const protectedPaths = [
      "/dashboard",
      "/bookings",
      "/customers",
      "/memberships",
      "/quotes",
      "/settings",
      "/sequences",
      "/onboarding",
    ];

    const isProtectedPath = protectedPaths.some((path) =>
      pathname === path || pathname.startsWith(path + "/")
    );

    // If not authenticated, redirect to access domain for login
    if (!user && isProtectedPath) {
      const accessUrl = new URL(`https://${ACCESS_DOMAIN}/login`);
      accessUrl.searchParams.set("redirect", `https://${APP_DOMAIN}${pathname}`);
      return NextResponse.redirect(accessUrl);
    }

    // If authenticated, check onboarding status for dashboard routes
    if (user && isProtectedPath && pathname !== "/onboarding" && !pathname.startsWith("/onboarding")) {
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const business = businesses?.[0] || null;

      // If no business or onboarding not completed, redirect to onboarding
      if (!business || !business.onboarding_completed) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }

    // If on root of app domain, redirect appropriately
    if (pathname === "/" && user) {
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const business = businesses?.[0] || null;
      const url = request.nextUrl.clone();

      if (!business || !business.onboarding_completed) {
        url.pathname = "/onboarding";
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    }

    // If on root of app domain and not authenticated, redirect to access
    if (pathname === "/" && !user) {
      return NextResponse.redirect(new URL(`https://${ACCESS_DOMAIN}`));
    }

    return supabaseResponse;
  }

  // ===========================================
  // LOCALHOST / DEFAULT BEHAVIOR
  // Handle both flows on same domain for development
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

    // Redirect authenticated users away from auth pages
    if (isAuthPath && user) {
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const business = businesses?.[0] || null;
      const url = request.nextUrl.clone();

      if (!business || !business.onboarding_completed) {
        url.pathname = "/onboarding";
      } else {
        url.pathname = "/dashboard";
      }

      return NextResponse.redirect(url);
    }

    // Redirect authenticated users from landing page
    if (pathname === "/" && user) {
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const business = businesses?.[0] || null;
      const url = request.nextUrl.clone();

      if (!business || !business.onboarding_completed) {
        url.pathname = "/onboarding";
      } else {
        url.pathname = "/dashboard";
      }

      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
