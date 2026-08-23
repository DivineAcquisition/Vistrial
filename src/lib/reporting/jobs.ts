import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { Json } from "@/types/database";

export async function runReportingJobs(db: GhlDb): Promise<{
  aggregate: { processed: number; failed: number; runId: string | null };
  cohorts: { processed: number; failed: number; runId: string | null };
}> {
  const aggregate = await runNamedJob(db, "aggregate", async (runId) => {
    const { data: orgs, error } = await db
      .from("organizations")
      .select("id")
      .not("activated_at", "is", null);
    if (error) throw error;
    let processed = 0;
    let failed = 0;
    const log: Json[] = [];
    for (const org of orgs ?? []) {
      try {
        const { error: snapError } = await db.rpc("reporting_refresh_org_snapshot", {
          p_org_id: org.id,
          p_job_run_id: runId,
        });
        if (snapError) throw snapError;
        processed += 1;
        log.push({ orgId: org.id, ok: true });
      } catch (caught) {
        failed += 1;
        const message = caught instanceof Error ? caught.message : "snapshot_failed";
        log.push({ orgId: org.id, error: message });
        ghlError("reporting.job.org_failed", { kind: "aggregate", orgId: org.id, error: message });
      }
    }
    return { processed, failed, log };
  });

  const cohorts = await runNamedJob(db, "cohort_mature", async () => {
    const { data: orgs, error } = await db
      .from("organizations")
      .select("id")
      .not("activated_at", "is", null);
    if (error) throw error;
    let processed = 0;
    let failed = 0;
    const log: Json[] = [];
    for (const org of orgs ?? []) {
      try {
        const { data, error: matureError } = await db.rpc("reporting_mature_cohorts", {
          p_org_id: org.id,
        });
        if (matureError) throw matureError;
        processed += 1;
        log.push({ orgId: org.id, cohorts: data });
      } catch (caught) {
        failed += 1;
        const message = caught instanceof Error ? caught.message : "mature_failed";
        log.push({ orgId: org.id, error: message });
        ghlError("reporting.job.org_failed", { kind: "cohort_mature", orgId: org.id, error: message });
      }
    }
    return { processed, failed, log };
  });

  ghlLog("reporting.jobs.ran", {
    aggregate: aggregate.processed,
    aggregateFailed: aggregate.failed,
    cohorts: cohorts.processed,
    cohortsFailed: cohorts.failed,
  });
  return { aggregate, cohorts };
}

async function runNamedJob(
  db: GhlDb,
  kind: "aggregate" | "cohort_mature",
  work: (runId: string) => Promise<{ processed: number; failed: number; log: Json[] }>
): Promise<{ processed: number; failed: number; runId: string | null }> {
  const { data: inserted, error } = await db
    .from("reporting_job_runs")
    .insert({ job_kind: kind, status: "running" })
    .select("id")
    .single();
  if (error || !inserted) {
    ghlError("reporting.job.start_failed", { kind, error: error?.message });
    return { processed: 0, failed: 1, runId: null };
  }
  try {
    const result = await work(inserted.id);
    await db
      .from("reporting_job_runs")
      .update({
        status: result.failed > 0 ? "failed" : "completed",
        finished_at: new Date().toISOString(),
        processed_count: result.processed,
        log: result.log as Json,
        error_text: result.failed > 0 ? `${result.failed} org(s) failed` : null,
      })
      .eq("id", inserted.id);
    if (result.failed > 0) {
      ghlError("reporting.job.partial_failed", {
        kind,
        processed: result.processed,
        failed: result.failed,
      });
    }
    return { processed: result.processed, failed: result.failed, runId: inserted.id };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "job_failed";
    await db
      .from("reporting_job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_text: message,
      })
      .eq("id", inserted.id);
    ghlError("reporting.job.failed", { kind, error: message });
    return { processed: 0, failed: 1, runId: inserted.id };
  }
}

export async function ensureBaselineQueuedForConnectedOrgs(db: GhlDb): Promise<number> {
  const { data: connections } = await db
    .from("ghl_connections")
    .select("org_id")
    .eq("status", "active");
  let queued = 0;
  for (const row of connections ?? []) {
    const { data: existing } = await db
      .from("baseline_runs")
      .select("id")
      .eq("org_id", row.org_id)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const { error } = await db.rpc("enqueue_baseline_backfill", {
      p_org_id: row.org_id,
      p_member_id: null,
      p_replace: false,
    });
    if (!error) queued += 1;
  }
  return queued;
}
