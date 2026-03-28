// @ts-nocheck
// Every 2 min (7-8am) — Process ONE queued org scan
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { runDailyScan } from '@/lib/agent/daily-scan';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const { data: next } = await admin.from('agent_scan_queue').select('*').eq('status', 'queued').order('queued_at').limit(1).maybeSingle();
  if (!next) return NextResponse.json({ message: 'Queue empty' });

  await admin.from('agent_scan_queue').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', next.id);

  try {
    const result = await runDailyScan(next.organization_id);
    await admin.from('agent_scan_queue').update({ status: 'completed', completed_at: new Date().toISOString(), results: { digests: result.clientDigests.length, notificationsSent: result.notificationsSent } }).eq('id', next.id);
    return NextResponse.json({ orgId: next.organization_id, status: 'completed' });
  } catch (error: any) {
    await admin.from('agent_scan_queue').update({ status: 'failed', completed_at: new Date().toISOString(), error: error.message }).eq('id', next.id);
    return NextResponse.json({ status: 'failed', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return GET(req); }
