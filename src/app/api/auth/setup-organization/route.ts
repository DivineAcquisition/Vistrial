// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { initializeBilling } from '@/services/billing.service';
import { seedOrganizationDefaults } from '@/lib/services/org-defaults.service';

const DEFAULT_CONVERSION_SETTINGS = {
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
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, business_type, user_id, first_name, last_name, phone } = body;

    if (!name || !business_type || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // Prevent duplicate orgs — check if user already has one
    const { data: existingMemberships } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user_id);

    if (existingMemberships && existingMemberships.length > 0) {
      const { data: existingOrg } = await admin
        .from('organizations')
        .select('*')
        .eq('id', existingMemberships[0].organization_id)
        .single();

      return NextResponse.json({
        organization: existingOrg,
        message: 'Organization already exists',
      });
    }

    let slug: string;
    try {
      const { data: slugData } = await admin.rpc('generate_org_slug', { name });
      slug = slugData || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    } catch {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    const orgInsert: Record<string, any> = {
      name,
      slug,
      business_type,
      plan_tier: 'starter',
      subscription_status: 'incomplete',
      contact_limit: 1000,
      onboarding_completed: false,
      onboarding_step: 0,
      industry: 'residential_cleaning',
      timezone: 'America/New_York',
      settings: {
        business_hours: { start: '08:00', end: '18:00' },
        conversion_settings: DEFAULT_CONVERSION_SETTINGS,
      },
    };
    if (phone) orgInsert.phone = phone;

    const { data: organization, error: orgError } = await admin
      .from('organizations')
      .insert(orgInsert)
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
      await admin.from('organizations').delete().eq('id', organization.id);
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 });
    }

    await admin
      .from('user_profiles')
      .update({
        first_name,
        last_name,
        default_organization_id: organization.id,
      })
      .eq('id', user_id);

    const { data: user } = await admin.auth.admin.getUserById(user_id);

    if (user?.user?.email) {
      try {
        await initializeBilling({
          organizationId: organization.id,
          organizationName: name,
          email: user.user.email,
        });
      } catch (billingError) {
        console.error('Billing initialization error:', billingError);
      }
    }

    try {
      await seedOrganizationDefaults(organization.id);
    } catch (seedError) {
      console.error('Seed defaults error (non-blocking):', seedError);
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
