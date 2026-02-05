// @ts-nocheck
// ============================================
// ORGANIZATION SETTINGS API
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

    if (context.membership?.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only organization owner can update settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { review_link, booking_link } = body;

    const admin = getSupabaseAdminClient();

    // Get current settings
    const { data: org } = await admin
      .from('organizations')
      .select('settings')
      .eq('id', context.organization.id)
      .single();

    const currentSettings = (org?.settings as Record<string, any>) || {};

    // Merge new settings
    const newSettings = {
      ...currentSettings,
      review_link,
      booking_link,
    };

    const { error } = await admin
      .from('organizations')
      .update({
        settings: newSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.organization.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
