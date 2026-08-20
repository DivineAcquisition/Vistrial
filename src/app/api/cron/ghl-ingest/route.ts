import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runGhlJobs } from "@/lib/ghl/jobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runGhlJobs(getSupabaseAdmin());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "GHL ingest job failed." }, { status: 500 });
  }
}
