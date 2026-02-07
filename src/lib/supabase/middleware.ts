// ============================================
// SUPABASE MIDDLEWARE HELPER
// Refreshes auth session on every request
// Handles domain-based routing:
//   app.vistrial.io   → core app (dashboard, workflows, etc.)
//   access.vistrial.io → early access signup (50% off all plans)
//   vistrial.io        → marketing site
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

  // access.vistrial.io → only allow signup/login and early access pages
  if (hostname.startsWith('access.') || hostname.includes('access.vistrial')) {
    // On the access subdomain, allow: signup, login, auth routes, onboarding
    const accessAllowed = [
      '/signup', '/login', '/forgot-password',
      '/auth/callback', '/auth/confirm', '/auth/reset-password',
      '/onboarding', '/lite',
    ];
    const accessPrefixes = ['/api/', '/_next/', '/lite'];

    const isAccessAllowed =
      pathname === '/' || // root redirects to /signup
      accessAllowed.includes(pathname) ||
      accessPrefixes.some(p => pathname.startsWith(p));

    // Redirect root to signup on access subdomain
    if (pathname === '/') {
      const signupUrl = request.nextUrl.clone();
      signupUrl.pathname = '/signup';
      return NextResponse.redirect(signupUrl);
    }

    // If authenticated on access domain, let them through to dashboard pages too
    if (user) {
      // Authenticated users on access domain can use the full app
      // (they already signed up through early access)
    } else if (!isAccessAllowed) {
      const signupUrl = request.nextUrl.clone();
      signupUrl.pathname = '/signup';
      return NextResponse.redirect(signupUrl);
    }
  }

  // ============================================
  // STANDARD AUTH ROUTING
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
    '/analytics',
    '/inbox',
  ];

  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users away from protected routes
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/signup
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashUrl);
  }

  return supabaseResponse;
}
