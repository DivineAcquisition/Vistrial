// ============================================
// USAGE CHECK API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { checkUsageLimit, type ResourceType } from '@/lib/middleware/usage-enforcement';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const resourceType = searchParams.get('type') as ResourceType;
    const quantity = parseInt(searchParams.get('quantity') || '1');

    if (!resourceType) {
      return NextResponse.json({ error: 'Resource type is required' }, { status: 400 });
    }

    const org = context.organization as Record<string, any>;
    const check = await checkUsageLimit(org.id, resourceType, quantity);
    return NextResponse.json({ check });
  } catch (error) {
    console.error('Usage check error:', error);
    return NextResponse.json({ error: 'Failed to check usage' }, { status: 500 });
  }
}
