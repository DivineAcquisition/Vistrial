import { NextResponse } from "next/server";

import { loadGlobalIngestionHealth } from "@/lib/ghl/health";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (secret) {
    return header === `Bearer ${secret}`;
  }
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: Request) {
  if (!authorized(request)) {
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
