// @ts-nocheck
// 8:00am — Generate morning briefs for orgs whose scans completed
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateMorningBrief } from '@/lib/agent/morning-brief';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdminClient();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const { data: completed } = await admin.from('agent_scan_queue').select('organization_id').eq('scan_type', 'daily_scan').eq('status', 'completed').gte('completed_at', todayStart);
  if (!completed || completed.length === 0) return NextResponse.json({ message: 'No completed scans' });

  let briefsSent = 0;
  for (const scan of completed) {
    try { await generateMorningBrief(scan.organization_id); briefsSent++; } catch (e: any) { console.error(`Brief failed for ${scan.organization_id}:`, e.message); }
  }

  return NextResponse.json({ briefsSent });
}

export async function POST(req: NextRequest) { return GET(req); }
