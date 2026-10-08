import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { loadGlobalIngestionHealth } from "@/lib/ghl/health";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadGlobalUnmatchedHealth } from "@/lib/transcripts/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const [health, unmatched] = await Promise.all([
    loadGlobalIngestionHealth(db),
    loadGlobalUnmatchedHealth(db),
  ]);
  return NextResponse.json({
    unprocessed: health.unprocessed,
    oldestUnprocessedAgeSeconds: health.oldestUnprocessedAgeSeconds,
    dead: health.dead,
    lastProcessedAt: health.lastProcessedAt,
    awaitingLocationLink: health.awaitingLocationLink,
    orgs: health.orgs,
    unmatchedTranscripts: unmatched.count,
    oldestUnmatchedTranscriptAgeSeconds:
      unmatched.oldestAgeMs === null ? null : Math.round(unmatched.oldestAgeMs / 1000),
  });
}
