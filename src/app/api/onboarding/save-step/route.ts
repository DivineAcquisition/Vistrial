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

    // If no organization yet, we can't save onboarding data to it.
    // Return success anyway so the wizard can proceed -- the org
    // was already created in the auth callback (ensureOrganization).
    const org = context.organization as Record<string, any> | null;
    if (!org?.id) {
      console.warn('No organization found for onboarding save-step. User:', context.user.id);
      return NextResponse.json({ success: true, warning: 'No organization found' });
    }

    const updateData: Record<string, any> = {
      onboarding_step: (step ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };

    // Save step-specific data
    if (data) {
      // Business info (step 0)
      if (data.businessType) {
        // Store as-is; if the DB column is an enum and the value doesn't match
        // we'll try it but won't let it block the rest of the save
        updateData.business_type = data.businessType;
      }
      if (data.phone) updateData.phone = data.phone;
      if (data.serviceArea) updateData.service_area = data.serviceArea;
      if (data.address) updateData.address_line1 = data.address;
      if (data.city) updateData.city = data.city;
      if (data.state) updateData.state = data.state;
      if (data.zip) updateData.zip_code = data.zip;

      // Branding
      if (data.primaryColor) {
        const currentSettings = (org.settings || {}) as Record<string, any>;
        updateData.settings = { ...currentSettings, primaryColor: data.primaryColor };
      }

      // Phone number (step 1)
      if (data.selectedNumber) updateData.telnyx_phone_number = data.selectedNumber;
    }

    // First try updating everything
    const { error: updateError } = await admin
      .from('organizations')
      .update(updateData)
      .eq('id', org.id);

    if (updateError) {
      console.error('Onboarding save error (full):', updateError);

      // If the error is likely an enum constraint on business_type, retry without it
      if (updateError.message?.includes('business_type') || updateError.code === '22P02') {
        console.log('Retrying without business_type...');
        delete updateData.business_type;
        const { error: retryError } = await admin
          .from('organizations')
          .update(updateData)
          .eq('id', org.id);

        if (retryError) {
          console.error('Onboarding save error (retry):', retryError);
          return NextResponse.json({ error: 'Failed to save: ' + retryError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: 'Failed to save: ' + updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, step: (step ?? 0) + 1 });
  } catch (error) {
    console.error('Save step error:', error);
    return NextResponse.json(
      { error: 'Failed to save' },
      { status: 500 }
    );
  }
}
