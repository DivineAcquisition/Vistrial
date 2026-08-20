import { NextResponse } from "next/server";

import { runGhlJobs } from "@/lib/ghl/jobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  try {
    const result = await runGhlJobs(getSupabaseAdmin());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "GHL ingest job failed." }, { status: 500 });
  }
}
