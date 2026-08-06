import { NextResponse } from "next/server";

import { runCycleJob } from "@/lib/billing/job";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The scheduled job. Point a daily scheduler at this with the shared secret in
 * `x-cron-secret`; running it more often is harmless and running it twice in
 * the same minute is harmless, which is the property that lets a scheduler be
 * naive about retries.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured, so the job endpoint is closed." },
      { status: 503 }
    );
  }

  const presented = request.headers.get("x-cron-secret")?.trim();

  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unrecognised secret." }, { status: 401 });
  }

  const summary = await runCycleJob(createServiceClient(), { trigger: "schedule" });

  return NextResponse.json(
    {
      ok: summary.error === null,
      run_id: summary.runId,
      assembled: summary.assembled,
      notified: summary.notified,
      processed: summary.processed,
      failed: summary.failed,
      skipped: summary.skipped,
      error: summary.error,
    },
    { status: summary.error === null ? 200 : 500 }
  );
}
