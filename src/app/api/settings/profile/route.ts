// ============================================
// PROFILE SETTINGS API - Saves to DB
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: user } = await admin.from('users').select('*').eq('id', context.user.id).maybeSingle();
    return NextResponse.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { firstName, lastName, phone, timezone, avatarUrl } = body;
    const admin = getSupabaseAdminClient();

    // Update auth user metadata
    await admin.auth.admin.updateUserById(context.user.id, {
      user_metadata: {
        ...context.user.user_metadata,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName || ''} ${lastName || ''}`.trim(),
      },
    });

    // Update users table (upsert since it may not exist yet)
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (firstName !== undefined) updateData.first_name = firstName;
    if (lastName !== undefined) updateData.last_name = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;

    await admin.from('users').update(updateData).eq('id', context.user.id);

    return NextResponse.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
