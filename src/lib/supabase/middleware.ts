// ============================================
// SUPABASE MIDDLEWARE HELPER
// Used to refresh auth session in middleware
// ============================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // No Supabase configured, just pass through
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/auth/callback',
    '/auth/reset-password',
    '/onboarding',
    '/unsubscribe',
  ];

  // Define routes that should always be public (webhooks, public pages)
  const alwaysPublicPrefixes = [
    '/api/webhooks/',
    '/book/',
    '/embed/',
    '/q/',
    '/lite',
    '/compliance',
  ];

  const isPublicRoute = publicRoutes.some(
    (route) => request.nextUrl.pathname === route
  );

  const isAlwaysPublic = alwaysPublicPrefixes.some(
    (prefix) => request.nextUrl.pathname.startsWith(prefix)
  );

  // Protected routes that require authentication
  const protectedPaths = [
    '/dashboard',
    '/contacts',
    '/workflows',
    '/usage',
    '/settings',
    '/bookings',
    '/customers',
    '/quotes',
    '/sequences',
    '/memberships',
  ];

  const isProtectedRoute = protectedPaths.some(
    (path) => request.nextUrl.pathname.startsWith(path)
  );

  // Redirect unauthenticated users to login for protected routes
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
