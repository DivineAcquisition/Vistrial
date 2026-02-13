// ============================================
// SEARCH AVAILABLE PHONE NUMBERS API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { searchAvailableNumbers } from '@/lib/telnyx/numbers';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const areaCode = searchParams.get('areaCode');

    if (!areaCode || areaCode.length !== 3) {
      return NextResponse.json({ error: 'Valid 3-digit area code required' }, { status: 400 });
    }

    const numbers = await searchAvailableNumbers(areaCode, 10);

    return NextResponse.json({ numbers });
  } catch (error) {
    console.error('Search numbers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
