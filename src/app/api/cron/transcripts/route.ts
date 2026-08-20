import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runTranscriptJobs } from "@/lib/transcripts/jobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTranscriptJobs(getSupabaseAdmin());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Transcript job failed." }, { status: 500 });
  }
}
