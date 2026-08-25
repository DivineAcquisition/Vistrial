import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { OpsJobName } from "@/lib/ops/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export { isJobOverdue } from "@/lib/ops/job-overdue";

export async function runAuthorizedCron(
  request: Request,
  jobName: OpsJobName,
  fn: (db: GhlDb) => Promise<unknown>
): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const db = getSupabaseAdmin();
  try {
    const result = await fn(db);
    await db.rpc("record_ops_job_run", {
      p_job_name: jobName,
      p_ok: true,
      p_error: null,
      p_duration_ms: Date.now() - started,
      p_result: (result ?? {}) as Json,
    });
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${jobName} failed.`;
    console.error(`[vistrial] ${jobName} failed`, message);
    await db.rpc("record_ops_job_run", {
      p_job_name: jobName,
      p_ok: false,
      p_error: message,
      p_duration_ms: Date.now() - started,
      p_result: null,
    });
    return NextResponse.json({ error: `${jobName} failed.` }, { status: 500 });
  }
}
