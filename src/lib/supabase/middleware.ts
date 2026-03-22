import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

  if (isAccessDomain) {
    const landingAllowed = ['/', '/lite'];
    const landingPrefixes = ['/api/', '/_next/', '/lite', '/compliance', '/book/', '/embed/', '/q/'];

    const isLandingAllowed =
      landingAllowed.includes(pathname) ||
      landingPrefixes.some(p => pathname.startsWith(p));

    const authRoutes = ['/signup', '/login', '/forgot-password', '/auth/callback', '/auth/confirm', '/auth/reset-password', '/onboarding'];
    const isAuthRoute = authRoutes.includes(pathname);

    if (isAuthRoute) {
      const appUrl = new URL(`https://app.${baseDomain}${pathname}`);
      request.nextUrl.searchParams.forEach((value, key) => {
        appUrl.searchParams.set(key, value);
      });
      return NextResponse.redirect(appUrl);
    }

    const protectedPrefixes = ['/dashboard', '/contacts', '/clients', '/workflows', '/settings', '/bookings', '/booking', '/analytics', '/inbox', '/messaging', '/projects', '/team', '/reports'];
    const isProtectedRoute = protectedPrefixes.some(p => pathname.startsWith(p));

    if (isProtectedRoute) {
      const appUrl = new URL(`https://app.${baseDomain}${pathname}`);
      return NextResponse.redirect(appUrl);
    }

    if (!isLandingAllowed) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }

    return supabaseResponse;
  }

  if (isAppDomain && pathname === '/') {
    const dest = request.nextUrl.clone();
    dest.pathname = user ? '/dashboard' : '/login';
    return NextResponse.redirect(dest);
  }

  // ============================================
  // STANDARD AUTH ROUTING
  // ============================================

  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/auth/callback',
    '/auth/confirm',
    '/auth/reset-password',
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
  const isOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding');

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!user && isOnboarding) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashUrl);
  }

  // ============================================
  // ONBOARDING ENFORCEMENT
  // If user is authenticated and on a protected route,
  // check onboarding status and redirect if not completed.
  // We use a lightweight API check to avoid heavy DB calls in middleware.
  // The dashboard layout also enforces this as a secondary check.
  // ============================================
  if (user && (isProtected || isOnboarding)) {
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        const adminClient = createServerClient(url, serviceRoleKey, {
          cookies: {
            getAll() { return []; },
            setAll() {},
          },
        });

        const { data: memberships } = await adminClient
          .from('organization_members')
          .select('organization_id, organizations(onboarding_completed)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        const membership = memberships?.[0];

        const org = (membership as any)?.organizations;
        const onboardingCompleted = org?.onboarding_completed === true;

        if (isProtected && !onboardingCompleted) {
          const onboardingUrl = request.nextUrl.clone();
          onboardingUrl.pathname = '/onboarding';
          return NextResponse.redirect(onboardingUrl);
        }

        if (isOnboarding && onboardingCompleted) {
          const dashUrl = request.nextUrl.clone();
          dashUrl.pathname = '/dashboard';
          return NextResponse.redirect(dashUrl);
        }
      }
    } catch (err) {
      // If the check fails, let the page-level checks handle it
      console.error('Middleware onboarding check error:', err);
    }
  }

  return supabaseResponse;
}
