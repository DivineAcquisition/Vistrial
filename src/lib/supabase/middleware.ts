import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Public routes - no auth check needed
  const publicPaths = [
    "/",
    "/book",
    "/embed",
    "/q",
    "/portal",
    "/api",
    "/forgot-password",
    "/auth/reset-password",
    "/login",
    "/signup",
  ];
  
  const isPublicPath = publicPaths.some((path) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  });

  // Skip auth check for public routes
  if (isPublicPath) {
    return supabaseResponse;
  }

  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase is not configured, allow access (for development)
    return supabaseResponse;
  }

  try {
    let response = supabaseResponse;
    
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session if expired
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Protected routes
    const protectedPaths = ["/dashboard", "/bookings", "/customers", "/memberships", "/quotes", "/settings", "/overview", "/details", "/sequences", "/onboarding"];
    const isProtectedPath = protectedPaths.some((path) =>
      pathname.startsWith(path)
    );

    if (isProtectedPath && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    return response;
  } catch (error) {
    console.error("Middleware error:", error);
    // On error, allow access to prevent blocking
    return supabaseResponse;
  }
}
