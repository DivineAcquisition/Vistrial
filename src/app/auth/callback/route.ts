// @ts-nocheck
// ============================================
// AUTH CALLBACK HANDLER
// Handles:
//   1. OAuth code exchange (Google, etc.) - needs PKCE verifier in cookies
//   2. Email confirmation via token_hash - NO PKCE needed (safe across browsers)
//   3. Password recovery
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { seedOrganizationDefaults } from '@/lib/services/org-defaults.service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') || '/onboarding';
  const error_param = searchParams.get('error');
  const error_description = searchParams.get('error_description');
  const origin = new URL(request.url).origin;

  // If Supabase sent an error directly (e.g. access_denied)
  if (error_param) {
    const msg = error_description || error_param;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, origin)
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
          // Recreate response with cookies
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // ---- Flow 1: token_hash (email confirmation, magic links) ----
  // This does NOT need PKCE. Safe when opened in different browser/device.
  // Check this FIRST because it's the most common email confirmation flow.
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type,
    });

    if (error) {
      console.error('OTP verify error:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
      );
    }

    if (type === 'recovery') {
      redirectUrl = new URL('/auth/reset-password', origin);
      response = NextResponse.redirect(redirectUrl);
    }

    if (data?.user) {
      await ensureOrganization(data.user);
    }

    return response;
  }

  // ---- Flow 2: OAuth code exchange (Google, etc.) ----
  // This REQUIRES the PKCE verifier cookie from the same browser session.
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', error);

      // If PKCE verifier missing, give the user a clear message
      if (error.message.includes('code verifier')) {
        return NextResponse.redirect(
          new URL(
            '/login?error=' +
              encodeURIComponent(
                'Your email was confirmed but the session expired. Please sign in with your email and password.'
              ),
            origin
          )
        );
      }

      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
      );
    }

    if (type === 'recovery') {
      redirectUrl = new URL('/auth/reset-password', origin);
      response = NextResponse.redirect(redirectUrl);
    }

    if (data?.user) {
      await ensureOrganization(data.user);
    }

    return response;
  }

  // No code or token_hash
  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('Invalid callback. Please try signing in again.'), origin)
  );
}

// ============================================
// Auto-create organization for new users
// ============================================
async function ensureOrganization(user) {
  try {
    const admin = getSupabaseAdminClient();

    // Check if user already has an organization
    const { data: membership } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership) return;

    // Extract user metadata from signup form
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.first_name ||
      user.email?.split('@')[0] ||
      'User';
    const businessName =
      user.user_metadata?.business_name || `${fullName}'s Business`;
    const phone = user.user_metadata?.phone || null;

    const nameParts = fullName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    // Generate unique slug from business name
    const baseSlug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const { data: existing } = await admin
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const orgInsert: Record<string, any> = {
      name: businessName,
      slug,
      business_type: 'other',
      plan_tier: 'starter',
      subscription_status: 'incomplete',
      contact_limit: 1000,
      onboarding_completed: false,
      onboarding_step: 0,
      industry: 'service_business',
      timezone: 'America/New_York',
      settings: {
        business_hours: { start: '08:00', end: '18:00' },
        conversion_settings: {
          auto_enter_pipeline: true,
          default_sequence_enabled: true,
          satisfaction_check_delay_hours: 2,
          stage_timing: {
            post_service_glow: { delay_hours: 2, duration_days: 1 },
            value_anchoring: { delay_days: 2, duration_days: 3 },
            incentive_window: { delay_days: 5, duration_days: 5 },
            social_proof: { delay_days: 10, duration_days: 8 },
            final_conversion: { delay_days: 18, duration_days: 12 },
          },
          working_hours: { start: '09:00', end: '20:00' },
          working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          max_messages_per_day_per_contact: 2,
        },
      },
    };
    if (phone) orgInsert.phone = phone;

    const { data: organization, error: orgError } = await admin
      .from('organizations')
      .insert(orgInsert)
      .select()
      .single();

    if (orgError || !organization) {
      console.error('Org creation error:', orgError);
      return;
    }

    // Create owner membership
    await admin.from('organization_members').insert({
      organization_id: organization.id,
      user_id: user.id,
      role: 'owner',
      permissions: { contacts: true, workflows: true, billing: true, settings: true },
      accepted_at: new Date().toISOString(),
    });

    // Save user profile with name and phone
    const profileUpdate: Record<string, any> = {
      first_name: firstName,
      last_name: lastName || null,
      default_organization_id: organization.id,
    };
    if (phone) profileUpdate.phone = phone;

    await admin
      .from('user_profiles')
      .update(profileUpdate)
      .eq('id', user.id);

    try {
      await seedOrganizationDefaults(organization.id);
    } catch (seedErr) {
      console.error('Seed defaults error (non-blocking):', seedErr);
    }

    console.log(`Organization "${businessName}" created for user ${user.id}`);
  } catch (err) {
    console.error('ensureOrganization error:', err);
  }
}
