// ============================================
// SAVE ONBOARDING STEP
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { step, data } = body;
    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    const updateData: Record<string, any> = {
      onboarding_step: (step || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    // Save step-specific data
    if (data) {
      if (data.businessType) updateData.business_type = data.businessType;
      if (data.phone) updateData.phone = data.phone;
      if (data.serviceArea) updateData.service_area = data.serviceArea;
      if (data.address) updateData.address = data.address;
      if (data.city) updateData.city = data.city;
      if (data.state) updateData.state = data.state;
      if (data.zip) updateData.zip = data.zip;
      if (data.primaryColor) {
        const currentSettings = (org.settings || {}) as Record<string, any>;
        updateData.settings = { ...currentSettings, primaryColor: data.primaryColor };
      }
    }

    await admin.from('organizations').update(updateData).eq('id', org.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save step error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
