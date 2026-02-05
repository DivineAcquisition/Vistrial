// @ts-nocheck
// ============================================
// AUTH CALLBACK HANDLER
// Handles OAuth and email verification callbacks
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { initializeBilling } from '@/services/billing.service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const next = searchParams.get('next') || '/dashboard';
  const origin = new URL(request.url).origin;

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    // Handle password recovery
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/auth/reset-password', request.url));
    }

    // Check if user has an organization (for OAuth users)
    if (data.user) {
      const admin = getSupabaseAdminClient();
      
      const { data: membership } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      // If no organization, create one for OAuth users
      if (!membership) {
        const fullName =
          data.user.user_metadata?.full_name ||
          data.user.email?.split('@')[0] ||
          'User';

        const nameParts = fullName.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ');

        const baseSlug = fullName
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

        // Create organization
        const { data: organization, error: orgError } = await admin
          .from('organizations')
          .insert({
            name: `${fullName}'s Business`,
            slug,
            business_type: 'other',
            plan_tier: 'starter',
            subscription_status: 'incomplete',
            contact_limit: 1000,
          })
          .select()
          .single();

        if (orgError) {
          console.error('Organization creation error:', orgError);
        } else if (organization) {
          // Create membership
          await admin.from('organization_members').insert({
            organization_id: organization.id,
            user_id: data.user.id,
            role: 'owner',
            permissions: {
              contacts: true,
              workflows: true,
              billing: true,
              settings: true,
            },
            accepted_at: new Date().toISOString(),
          });

          // Update user profile
          await admin
            .from('user_profiles')
            .update({
              first_name: firstName,
              last_name: lastName || null,
              default_organization_id: organization.id,
            })
            .eq('id', data.user.id);

          // Initialize billing
          if (data.user.email) {
            try {
              await initializeBilling({
                organizationId: organization.id,
                organizationName: organization.name,
                email: data.user.email,
              });
            } catch (billingError) {
              console.error('Billing initialization error:', billingError);
            }
          }
        }
      }

      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/login?error=auth_callback_error', origin));
}
