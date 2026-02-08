// ============================================
// COMPLETE ONBOARDING
// ============================================

import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    await admin.from('organizations').update({
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', org.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
