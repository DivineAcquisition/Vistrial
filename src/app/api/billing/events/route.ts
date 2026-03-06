// ============================================
// BILLING EVENTS API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getBillingEvents } from '@/lib/stripe/invoices';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = context.organization as Record<string, any>;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const events = await getBillingEvents(org.id, limit);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Get billing events error:', error);
    return NextResponse.json({ error: 'Failed to fetch billing events' }, { status: 500 });
  }
}
