// @ts-nocheck
// ============================================
// A2P MESSAGING SETUP API
// Submit brand registration to Telnyx
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createBrand, createMessagingProfile } from '@/lib/telnyx/a2p-service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { legal_business_name, ein, business_phone, business_email, street, city, state, postal_code } = body;

    if (!legal_business_name || !ein || !business_phone || !business_email || !street || !city || !state || !postal_code) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const orgId = context.organization.id;

    // Check if already registered
    const { data: existing } = await admin.from('messaging_registrations').select('id, overall_status').eq('org_id', orgId).maybeSingle();
    if (existing && existing.overall_status === 'active') {
      return NextResponse.json({ error: 'Messaging is already active', registration: existing }, { status: 400 });
    }

    // Create messaging profile in Telnyx
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.io'}/api/webhooks/telnyx`;
    let messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

    if (!messagingProfileId) {
      try {
        const profile = await createMessagingProfile(`${legal_business_name} - Vistrial`, webhookUrl);
        messagingProfileId = profile.profileId;
      } catch (err) {
        console.error('Failed to create messaging profile:', err);
      }
    }

    // Submit brand to Telnyx
    const brandResult = await createBrand({
      displayName: legal_business_name,
      companyName: legal_business_name,
      ein,
      phone: business_phone,
      email: business_email,
      street, city, state, postalCode: postal_code,
    });

    // Save/update registration
    const regData = {
      org_id: orgId,
      legal_business_name, ein, business_phone, business_email,
      street, city, state, postal_code,
      telnyx_brand_id: brandResult.brandId,
      telnyx_messaging_profile_id: messagingProfileId,
      brand_status: 'pending',
      overall_status: 'pending_approval',
      brand_submitted_at: new Date().toISOString(),
    };

    let registration;
    if (existing) {
      const { data, error } = await admin.from('messaging_registrations').update(regData).eq('id', existing.id).select().single();
      if (error) throw error;
      registration = data;
    } else {
      const { data, error } = await admin.from('messaging_registrations').insert(regData).select().single();
      if (error) throw error;
      registration = data;
    }

    return NextResponse.json({ success: true, registration, brandId: brandResult.brandId });
  } catch (error) {
    console.error('A2P setup error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Setup failed' }, { status: 500 });
  }
}
