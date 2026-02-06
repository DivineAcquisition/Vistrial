// @ts-nocheck
// ============================================
// SETUP ORGANIZATION API
// Creates organization and membership after signup
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { initializeBilling } from '@/services/billing.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, business_type, user_id, first_name, last_name } = body;

    if (!name || !business_type || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // Generate slug from name
    let slug: string;
    try {
      const { data: slugData } = await admin.rpc('generate_org_slug', {
        name,
      });
      slug = slugData || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    } catch {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    // Create organization
    const { data: organization, error: orgError } = await admin
      .from('organizations')
      .insert({
        name,
        slug,
        business_type,
        plan_tier: 'starter',
        subscription_status: 'incomplete',
        contact_limit: 1000,
      })
      .select()
      .single();

    if (orgError || !organization) {
      console.error('Organization creation error:', orgError);
      return NextResponse.json({ 
        error: `Failed to create organization: ${orgError?.message || 'Unknown error'}`,
        details: orgError?.details || null,
        hint: orgError?.hint || null,
        code: orgError?.code || null,
      }, { status: 500 });
    }

    // Create membership (owner)
    const { error: memberError } = await admin.from('organization_members').insert({
      organization_id: organization.id,
      user_id,
      role: 'owner',
      permissions: {
        contacts: true,
        workflows: true,
        billing: true,
        settings: true,
      },
      accepted_at: new Date().toISOString(),
    });

    if (memberError) {
      console.error('Membership creation error:', memberError);
      // Rollback organization
      await admin.from('organizations').delete().eq('id', organization.id);
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 });
    }

    // Update user profile
    await admin
      .from('user_profiles')
      .update({
        first_name,
        last_name,
        default_organization_id: organization.id,
      })
      .eq('id', user_id);

    // Get user email for Stripe
    const { data: user } = await admin.auth.admin.getUserById(user_id);

    // Initialize billing (create Stripe customer)
    if (user?.user?.email) {
      try {
        await initializeBilling({
          organizationId: organization.id,
          organizationName: name,
          email: user.user.email,
        });
      } catch (billingError) {
        console.error('Billing initialization error:', billingError);
        // Don't fail signup if billing fails - can be set up later
      }
    }

    return NextResponse.json({
      organization,
      message: 'Organization created successfully',
    });
  } catch (error) {
    console.error('Setup organization error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
