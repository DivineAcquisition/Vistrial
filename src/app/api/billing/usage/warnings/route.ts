// ============================================
// USAGE WARNINGS API
// ============================================

import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getUsageWarnings } from '@/lib/middleware/usage-enforcement';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = context.organization as Record<string, any>;
    const warnings = await getUsageWarnings(org.id);
    return NextResponse.json({ warnings });
  } catch (error) {
    console.error('Usage warnings error:', error);
    return NextResponse.json({ error: 'Failed to fetch warnings' }, { status: 500 });
  }
}
