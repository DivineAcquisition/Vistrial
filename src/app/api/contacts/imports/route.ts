// @ts-nocheck
// ============================================
// CONTACT IMPORTS API
// List import jobs
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { listImports } from '@/services/contact-import.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const imports = await listImports(context.organization.id, limit);

    return NextResponse.json({ imports });
  } catch (error) {
    console.error('List imports error:', error);
    return NextResponse.json({ error: 'Failed to list imports' }, { status: 500 });
  }
}
