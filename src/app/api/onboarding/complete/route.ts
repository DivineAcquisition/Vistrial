// ============================================
// COMPLETE ONBOARDING
// ============================================

import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const org = context.organization as Record<string, any> | null;
    if (!org?.id) {
      // No org to mark complete, but don't block the user
      return NextResponse.json({ success: true, warning: 'No organization found' });
    }

    const admin = getSupabaseAdminClient();

    const { error } = await admin
      .from('organizations')
      .update({
        onboarding_completed: true,
        onboarding_step: 4,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);

    if (error) {
      console.error('Complete onboarding error:', error);
      // Try without onboarding_step in case column doesn't exist
      await admin
        .from('organizations')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq('id', org.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
