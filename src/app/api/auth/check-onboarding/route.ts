// ============================================
// CHECK ONBOARDING STATUS
// ============================================

import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ completed: false, step: 0 });
    }

    const org = context.organization as Record<string, any>;

    return NextResponse.json({
      completed: org.onboarding_completed === true,
      step: org.onboarding_step || 0,
    });
  } catch {
    return NextResponse.json({ completed: false, step: 0 });
  }
}
