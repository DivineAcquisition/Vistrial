// @ts-nocheck
// ============================================
// USER PROFILE API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { first_name, last_name } = body;

    const admin = getSupabaseAdminClient();

    // Update user metadata
    const { error: authError } = await admin.auth.admin.updateUserById(
      context.user.id,
      {
        user_metadata: {
          first_name,
          last_name,
        },
      }
    );

    if (authError) {
      throw authError;
    }

    // Update user profile
    await admin
      .from('user_profiles')
      .update({
        first_name,
        last_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
