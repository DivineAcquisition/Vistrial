// @ts-nocheck
// ============================================
// SETUP ORGANIZATION API
// Creates organization and membership after signup
// Also handles onboarding flow with extra business fields
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { initializeBilling } from '@/services/billing.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      business_type,
      user_id,
      first_name,
      last_name,
      phone,
      address_line1,
      city,
      state,
      zip_code,
      primary_color,
      settings,
    } = body;

    if (!name || !business_type || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // Check if user already has an organization
    const { data: existingMembership } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (existingMembership) {
      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (business_type) updateData.business_type = business_type;
      if (phone) updateData.phone = phone;
      if (address_line1) updateData.address_line1 = address_line1;
      if (city) updateData.city = city;
      if (state) updateData.state = state;
      if (zip_code) updateData.zip_code = zip_code;
      if (primary_color) updateData.primary_color = primary_color;
      if (settings) updateData.settings = settings;

      if (Object.keys(updateData).length > 0) {
        await admin.from('organizations').update(updateData).eq('id', existingMembership.organization_id);
      }

      if (first_name || last_name) {
        await admin.from('user_profiles').update({
          first_name: first_name || undefined,
          last_name: last_name || undefined,
          default_organization_id: existingMembership.organization_id,
        }).eq('id', user_id);
      }

      const { data: updatedOrg } = await admin.from('organizations').select('*').eq('id', existingMembership.organization_id).single();

      return NextResponse.json({ organization: updatedOrg, message: 'Organization updated successfully' });
    }

    // Generate slug
    let slug: string;
    try {
      const { data: slugData } = await admin.rpc('generate_org_slug', { name });
      slug = slugData || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    } catch {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    const { data: slugExists } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (slugExists) slug = `${slug}-${Date.now().toString(36)}`;

    // Build organization data (merged: extra fields from HEAD + onboarding tracking from main)
    const orgData: Record<string, unknown> = {
      name, slug, business_type,
      plan_tier: 'starter',
      subscription_status: 'incomplete',
      contact_limit: 1000,
      onboarding_completed: false,
      onboarding_step: 0,
    };
    if (phone) orgData.phone = phone;
    if (address_line1) orgData.address_line1 = address_line1;
    if (city) orgData.city = city;
    if (state) orgData.state = state;
    if (zip_code) orgData.zip_code = zip_code;
    if (primary_color) orgData.primary_color = primary_color;
    if (settings) orgData.settings = settings;

    const { data: organization, error: orgError } = await admin
      .from('organizations').insert(orgData).select().single();

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
      organization_id: organization.id, user_id, role: 'owner',
      permissions: { contacts: true, workflows: true, billing: true, settings: true },
      accepted_at: new Date().toISOString(),
    });

    if (memberError) {
      console.error('Membership creation error:', memberError);
      await admin.from('organizations').delete().eq('id', organization.id);
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 });
    }

    await admin.from('user_profiles').upsert({
      id: user_id, first_name: first_name || null,
      last_name: last_name || null, default_organization_id: organization.id,
    });

    const { data: user } = await admin.auth.admin.getUserById(user_id);

    if (user?.user?.email) {
      try {
        await initializeBilling({ organizationId: organization.id, organizationName: name, email: user.user.email });
      } catch (billingError) {
        console.error('Billing initialization error:', billingError);
      }
    }

    return NextResponse.json({ organization, message: 'Organization created successfully' });
  } catch (error) {
    console.error('Setup organization error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
