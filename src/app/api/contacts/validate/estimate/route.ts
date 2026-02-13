// ============================================
// VALIDATION COST ESTIMATE ENDPOINT
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { estimateLookupCost } from '@/lib/telnyx/number-lookup';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '0', 10);

    if (count <= 0) {
      return NextResponse.json({ error: 'Valid count required' }, { status: 400 });
    }

    return NextResponse.json({
      count,
      estimatedCost: estimateLookupCost(count),
      costPerLookup: 0.015,
      currency: 'USD',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
