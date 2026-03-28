// @ts-nocheck
// Manual scan trigger (owner only)
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { runDailyScan } from '@/lib/agent/daily-scan';

export async function POST(request: NextRequest) {
  const context = await getAuthenticatedContext();
  if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = (context.organization as any).id;
  const result = await runDailyScan(orgId);
  return NextResponse.json(result);
}
