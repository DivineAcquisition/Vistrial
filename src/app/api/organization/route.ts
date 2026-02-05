// @ts-nocheck
// ============================================
// ORGANIZATION API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is owner
    if (context.membership?.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only organization owner can update settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, phone, email, website, business_type, timezone } = body;

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from('organizations')
      .update({
        name,
        phone,
        email,
        website,
        business_type,
        timezone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.organization.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ organization: data });
  } catch (error) {
    console.error('Update organization error:', error);
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    );
  }
}
