import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const pathname = request.nextUrl.pathname;

  // Protected routes - require auth
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
  const authPaths = ["/login", "/signup", "/verify"];
  const isAuthPath = authPaths.some((path) => pathname === path);

  if (isAuthPath && user) {
    // Check if user has a business with completed onboarding
    const { data: business } = await supabase
      .from("businesses")
      .select("id, onboarding_completed")
      .eq("owner_id", user.id)
      .maybeSingle();

    const url = request.nextUrl.clone();
    
    // No business or onboarding not completed -> go to onboarding
    if (!business || !business.onboarding_completed) {
      url.pathname = "/onboarding";
    } else {
      url.pathname = "/dashboard";
    }
    
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users from landing page to dashboard/onboarding
  if (pathname === "/" && user) {
    const { data: business } = await supabase
      .from("businesses")
      .select("id, onboarding_completed")
      .eq("owner_id", user.id)
      .maybeSingle();

    const url = request.nextUrl.clone();
    
    if (!business || !business.onboarding_completed) {
      url.pathname = "/onboarding";
    } else {
      url.pathname = "/dashboard";
    }
    
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
