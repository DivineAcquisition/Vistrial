import { loadOrgIngestionHealth, loadGlobalIngestionHealth } from "@/lib/ghl/health";
import type { GhlDb } from "@/lib/ghl/tokens";
import { loadOpsNotificationState } from "@/lib/notifications/ops";
import { vistrialEnv } from "@/lib/ops/env";
import { DEFAULT_ROUTES } from "@/lib/agents/model-config";
import { loadAgentSpend, loadEscalationRates, loadModelSpend } from "@/lib/ops/spend";
import { isJobOverdue } from "@/lib/ops/job-overdue";
import { loadVerificationOpsState } from "@/lib/verification/ops-state";
import type { Json } from "@/types/database";

function numberField(value: Json | undefined, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const inner = value[key];
  return typeof inner === "number" ? inner : null;
}

function runtimeFromHealthDetail(detail: Json | null): {
  connectionsActive: number | null;
  connectionsTotal: number | null;
  slowQueries: number | null;
} {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return { connectionsActive: null, connectionsTotal: null, slowQueries: null };
  }
  const runtime = detail.runtime;
  return {
    connectionsActive: numberField(runtime, "connectionsActive"),
    connectionsTotal: numberField(runtime, "connectionsTotal"),
    slowQueries: numberField(runtime, "slowQueries"),
  };
}

export async function loadOpsSystemState(db: GhlDb) {
  const env = vistrialEnv();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    jobs,
    catalog,
    openAlerts,
    incidents,
    lastRestore,
    lastRetention,
    httpErrors,
    healthSamples,
    ingest,
    notifications,
    spend,
    agentSpend,
    escalationRates,
    orgs,
    extractTotal,
    extractDead,
    notifyTotal,
    notifyDead,
    calibration,
    verification,
    modelRouteRows,
  ] = await Promise.all([
    db.from("ops_job_runs").select("*"),
    db.from("ops_job_catalog").select("*"),
    db.from("ops_alerts").select("*").is("resolved_at", null).order("fired_at", { ascending: false }).limit(50),
    db.from("ops_incidents").select("*").neq("status", "resolved").order("detected_at", { ascending: false }).limit(20),
    db.from("ops_restore_drills").select("*").order("recorded_at", { ascending: false }).limit(1),
    db.from("retention_runs").select("*").order("started_at", { ascending: false }).limit(1),
    db
      .from("ops_http_errors")
      .select("*")
      .gte("window_started_at", since24h),
    db
      .from("ops_health_samples")
      .select("*")
      .order("sampled_at", { ascending: false })
      .limit(24),
    loadGlobalIngestionHealth(db),
    loadOpsNotificationState(db),
    loadModelSpend(db, 30),
    loadAgentSpend(db, 30),
    loadEscalationRates(db, 30),
    db.from("organizations").select("id, name, slug, inactive_at, offboarded_at, delete_after, ghl_location_id, holdout_percent"),
    db.from("extraction_jobs").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    db
      .from("extraction_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead")
      .gte("created_at", since24h),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_test", false)
      .gte("queued_at", since24h),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_test", false)
      .eq("status", "dead")
      .gte("queued_at", since24h),
    db.rpc("load_ops_calibration"),
    loadVerificationOpsState(db),
    (db as unknown as { from: (t: string) => { select: (c: string) => Promise<{ data: Array<{ work_kind: string; tier: string; model_id: string }> | null }> } })
      .from("agent_model_routes")
      .select("work_kind, tier, model_id"),
  ]);

  const catalogByName = new Map((catalog.data ?? []).map((row) => [row.job_name, row]));
  const jobRows = (jobs.data ?? []).map((row) => {
    const meta = catalogByName.get(row.job_name);
    const overdue = meta
      ? isJobOverdue({
          lastSuccessAt: row.last_success_at,
          intervalSeconds: meta.interval_seconds,
          graceSeconds: meta.grace_seconds,
        })
      : false;
    return {
      ...row,
      cronExpr: meta?.cron_expr ?? "",
      checkFirst: meta?.check_first ?? "",
      overdue,
    };
  });

  const errorSamples = httpErrors.data ?? [];
  const sampleTotal = errorSamples.reduce((sum, row) => sum + row.sample_count, 0);
  const errorTotal = errorSamples.reduce((sum, row) => sum + row.error_count, 0);
  const errorRate = sampleTotal > 0 ? errorTotal / sampleTotal : 0;
  const latestHealth = healthSamples.data?.[0] ?? null;
  const runtime = runtimeFromHealthDetail(latestHealth?.detail ?? null);
  const extractionN = extractTotal.count ?? 0;
  const extractionDead = extractDead.count ?? 0;
  const extractionFailRate = extractionN > 0 ? extractionDead / extractionN : 0;
  const notificationN = notifyTotal.count ?? 0;
  const notificationDead = notifyDead.count ?? 0;
  const notificationFailRate = notificationN > 0 ? notificationDead / notificationN : 0;

  const restore = lastRestore.data?.[0] ?? null;
  const hoursSinceRestore = restore
    ? (Date.now() - new Date(restore.finished_at).getTime()) / (60 * 60 * 1000)
    : null;

  const anythingWrong =
    jobRows.some((row) => row.overdue) ||
    (openAlerts.data ?? []).length > 0 ||
    (incidents.data ?? []).length > 0 ||
    ingest.unprocessed > 0 && (ingest.oldestUnprocessedAgeSeconds ?? 0) >= 30 * 60 ||
    latestHealth?.app_ok === false ||
    latestHealth?.db_ok === false;

  const orgHealth = await Promise.all(
    (orgs.data ?? []).map(async (org) => {
      const ingestOrg = await loadOrgIngestionHealth(db, org.id);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        inactive: Boolean(org.inactive_at),
        deleteAfter: org.delete_after,
        unprocessed: ingestOrg.unprocessed,
        stale: ingestOrg.stale,
        staleReason: ingestOrg.staleReason,
      };
    })
  );

  return {
    env,
    anythingWrong,
    errorRate,
    errorTotal,
    sampleTotal,
    latestHealth,
    runtime,
    extractionN,
    extractionFailRate,
    notificationN,
    notificationFailRate,
    jobs: jobRows,
    alerts: openAlerts.data ?? [],
    incidents: incidents.data ?? [],
    restore,
    hoursSinceRestore,
    lastRetention: lastRetention.data?.[0] ?? null,
    ingest,
    orgHealth,
    notifications,
    spend,
    agentSpend,
    escalationRates,
    modelRoutes: (modelRouteRows.data ?? DEFAULT_ROUTES.map((row) => ({
      work_kind: row.workKind,
      tier: row.tier,
      model_id: row.modelId,
    }))).map((row) => ({
      workKind: row.work_kind,
      tier: row.tier,
      modelId: row.model_id,
    })),
    orgs: orgs.data ?? [],
    calibration: (calibration.data ?? {}) as Record<string, unknown>,
    verification,
  };
}
