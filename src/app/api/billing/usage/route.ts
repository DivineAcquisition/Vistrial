// ============================================
// USAGE API
// Get organization usage data and overage charges
// ============================================

import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getOrganizationUsage, calculateOverageCharges } from '@/lib/stripe/usage';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = context.organization as Record<string, any>;
    const usage = await getOrganizationUsage(org.id);
    const overageCharges = calculateOverageCharges(usage);

    return NextResponse.json({ usage, overageCharges });
  } catch (error) {
    console.error('Get usage error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
