// @ts-nocheck
// ============================================
// EMAIL CONFIRMATION HANDLER
// This route handles the token_hash-based confirmation flow
// which does NOT require PKCE (works across browsers/devices).
//
// Set your Supabase email template confirmation URL to:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') || 'signup';
  const next = searchParams.get('next') || '/dashboard';
  const origin = new URL(request.url).origin;

  if (!token_hash) {
    return NextResponse.redirect(
      new URL('/login?error=' + encodeURIComponent('Missing confirmation token.'), origin)
    );
  }

  const cookieStore = await cookies();

  let redirectUrl = new URL(next, origin);
  let response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type,
  });

  if (error) {
    console.error('Email confirm error:', error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  // Confirmed -- redirect to dashboard (or next)
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/reset-password', origin));
  }

  return response;
}
