import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runBaselineBackfill } from "@/lib/ghl/backfill";
import { ensureBaselineQueuedForConnectedOrgs } from "@/lib/reporting/jobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getSupabaseAdmin();
    const queued = await ensureBaselineQueuedForConnectedOrgs(db);
    const result = await runBaselineBackfill(db);
    return NextResponse.json({ queued, ...result });
  } catch {
    return NextResponse.json({ error: "Baseline backfill failed." }, { status: 500 });
  }
}
