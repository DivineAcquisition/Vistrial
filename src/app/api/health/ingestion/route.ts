import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { loadGlobalIngestionHealth } from "@/lib/ghl/health";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await loadGlobalIngestionHealth(getSupabaseAdmin());
  return NextResponse.json({
    unprocessed: health.unprocessed,
    oldestUnprocessedAgeSeconds: health.oldestUnprocessedAgeSeconds,
    dead: health.dead,
    lastProcessedAt: health.lastProcessedAt,
    orgs: health.orgs,
  });
}
