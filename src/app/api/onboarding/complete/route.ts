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

    const admin = getSupabaseAdminClient();

    // Get org from context, or find it via admin if RLS blocks
    let org = context.organization as Record<string, any> | null;

    if (!org?.id) {
      console.log('complete: no org in context, looking up via admin for user', context.user.id);
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
      return NextResponse.json({ success: true, warning: 'No organization found' });
    }

    // Mark onboarding complete
    const { error } = await admin
      .from('organizations')
      .update({
        onboarding_completed: true,
        onboarding_step: 4,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);

    if (error) {
      console.error('Complete onboarding update error:', error);
      // Try simpler update
      const { error: fallbackError } = await admin
        .from('organizations')
        .update({ onboarding_completed: true })
        .eq('id', org.id);

      if (fallbackError) {
        console.error('Complete onboarding fallback error:', fallbackError);
        return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
