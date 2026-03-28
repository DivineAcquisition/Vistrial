// @ts-nocheck
// 7:00am — Queue one scan per active org
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: orgs } = await admin.from('organizations').select('id');
  if (!orgs || orgs.length === 0) return NextResponse.json({ queued: 0 });
  const entries = orgs.map(o => ({ organization_id: o.id, scan_type: 'daily_scan', status: 'queued' }));
  await admin.from('agent_scan_queue').insert(entries);
  return NextResponse.json({ queued: orgs.length });
}

export async function POST(req: NextRequest) { return GET(req); }
