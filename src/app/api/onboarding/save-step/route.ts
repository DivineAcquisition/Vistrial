// ============================================
// SAVE ONBOARDING STEP
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { step, data } = body;
    const admin = getSupabaseAdminClient();

    // Get org from context, or find it via admin client if RLS blocks
    let org = context.organization as Record<string, any> | null;

    if (!org?.id) {
      console.log('save-step: no org in context, looking up via admin for user', context.user.id);
      const { data: membership } = await admin
        .from('organization_members')
        .select('organization_id, organizations (*)')
        .eq('user_id', context.user.id)
        .single();

      if (membership) {
        org = (membership as any).organizations;
      }
    }

    if (!org?.id) {
      console.warn('save-step: still no org found for user', context.user.id);
      return NextResponse.json({ success: true, warning: 'No organization found' });
    }

    const updateData: Record<string, any> = {
      onboarding_step: (step ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };

    // Save step-specific data
    if (data) {
      if (data.businessType) updateData.business_type = data.businessType;
      if (data.phone) updateData.phone = data.phone;
      if (data.serviceArea) updateData.service_area = data.serviceArea;
      if (data.address) updateData.address_line1 = data.address;
      if (data.city) updateData.city = data.city;
      if (data.state) updateData.state = data.state;
      if (data.zip) updateData.zip_code = data.zip;
      if (data.primaryColor) {
        const currentSettings = (org.settings || {}) as Record<string, any>;
        updateData.settings = { ...currentSettings, primaryColor: data.primaryColor };
      }
      if (data.selectedNumber) updateData.telnyx_phone_number = data.selectedNumber;
    }

    // Try updating — if business_type enum fails, retry without it
    const { error: updateError } = await admin
      .from('organizations')
      .update(updateData)
      .eq('id', org.id);

    if (updateError) {
      console.error('Onboarding save error:', updateError);

      if (updateError.message?.includes('business_type') || updateError.code === '22P02') {
        delete updateData.business_type;
        const { error: retryError } = await admin
          .from('organizations')
          .update(updateData)
          .eq('id', org.id);

        if (retryError) {
          console.error('Onboarding save retry error:', retryError);
          return NextResponse.json({ error: 'Failed to save: ' + retryError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: 'Failed to save: ' + updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, step: (step ?? 0) + 1 });
  } catch (error) {
    console.error('Save step error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
