// ============================================
// SUPABASE MIDDLEWARE HELPER
// Refreshes auth session on every request
// Handles domain-based routing:
//   access.vistrial.io → landing / marketing site only
//   app.vistrial.io    → signup, login, dashboard & full app
//   vistrial.io        → marketing site (same as access)
// ============================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, just pass through
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as any)
        );
      },
    },
  });

  // IMPORTANT: DO NOT add logic between createServerClient and getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get('host') || '';

  // ============================================
  // DOMAIN-BASED ROUTING
  // ============================================

  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'vistrial.io';
  const isAccessDomain = hostname.startsWith('access.') || hostname.includes(`access.${baseDomain}`);
  const isAppDomain = hostname.startsWith('app.') || hostname.includes(`app.${baseDomain}`);

  // --------------------------------------------------
  // access.vistrial.io → landing / marketing pages only
  // --------------------------------------------------
  if (isAccessDomain) {
    // Paths allowed on the landing-page domain
    const landingAllowed = ['/', '/lite'];
    const landingPrefixes = ['/api/', '/_next/', '/lite', '/compliance', '/book/', '/embed/', '/q/'];

    const isLandingAllowed =
      landingAllowed.includes(pathname) ||
      landingPrefixes.some(p => pathname.startsWith(p));

    // Auth-related routes should live on the app domain – redirect there
    const authRoutes = ['/signup', '/login', '/forgot-password', '/auth/callback', '/auth/confirm', '/auth/reset-password', '/onboarding'];
    const isAuthRoute = authRoutes.includes(pathname);

    if (isAuthRoute) {
      const appUrl = new URL(`https://app.${baseDomain}${pathname}`);
      // Preserve any query params (e.g. ?plan=lite, ?redirect=…)
      request.nextUrl.searchParams.forEach((value, key) => {
        appUrl.searchParams.set(key, value);
      });
      return NextResponse.redirect(appUrl);
    }

    // Dashboard / protected routes should also go to the app domain
    const protectedPrefixes = ['/dashboard', '/contacts', '/workflows', '/settings', '/bookings', '/booking', '/analytics', '/inbox'];
    const isProtectedRoute = protectedPrefixes.some(p => pathname.startsWith(p));

    if (isProtectedRoute) {
      const appUrl = new URL(`https://app.${baseDomain}${pathname}`);
      return NextResponse.redirect(appUrl);
    }

    // Any other unrecognised path on access domain → redirect to landing root
    if (!isLandingAllowed) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }

    // Landing pages don't need further auth checks
    return supabaseResponse;
  }

  // --------------------------------------------------
  // app.vistrial.io → auth + dashboard (full application)
  // --------------------------------------------------
  // When on the app domain, redirect bare "/" to dashboard (authenticated) or login
  if (isAppDomain && pathname === '/') {
    const dest = request.nextUrl.clone();
    dest.pathname = user ? '/dashboard' : '/login';
    return NextResponse.redirect(dest);
  }

  // ============================================
  // STANDARD AUTH ROUTING (applies to app domain & development)
  // ============================================

  // Public routes - no auth required
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/auth/callback',
    '/auth/confirm',
    '/auth/reset-password',
    '/onboarding',
    '/unsubscribe',
  ];

  const alwaysPublicPrefixes = [
    '/api/',
    '/book/',
    '/embed/',
    '/q/',
    '/lite',
    '/compliance',
    '/_next/',
  ];

  const isPublic =
    publicRoutes.includes(pathname) ||
    alwaysPublicPrefixes.some((p) => pathname.startsWith(p));

  // Protected routes
  const protectedPrefixes = [
    '/dashboard',
    '/contacts',
    '/workflows',
    '/settings',
    '/bookings',
    '/booking',
    '/analytics',
    '/inbox',
    '/messaging',
  ];

  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users away from protected routes
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/signup to dashboard
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashUrl);
  }

  return supabaseResponse;
}
