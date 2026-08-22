import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { ghlError, ghlLog } from "@/lib/ghl/log";

export type ProfileJobResult = {
  metricsRefreshed: number;
  cohortsWritten: number;
  signalsDetected: number;
  failed: number;
};

/**
 * The scheduled half of the compounding layer and the living profile.
 *
 * Per-org metrics are recomputed first, then the cross-client aggregate is
 * rebuilt from scratch in one statement. Rebuilding wholesale is what makes an
 * opt-out take effect immediately: an org that switches off simply stops
 * appearing in the next rebuild rather than needing its contribution unpicked.
 */
export async function runProfileJobs(db: GhlDb): Promise<ProfileJobResult> {
  const result: ProfileJobResult = {
    metricsRefreshed: 0,
    cohortsWritten: 0,
    signalsDetected: 0,
    failed: 0,
  };

  const { data: orgs, error } = await db.from("organizations").select("id");
  if (error) {
    ghlError("profile.jobs.orgs_failed", { error: error.message });
    return { ...result, failed: 1 };
  }

  for (const org of orgs ?? []) {
    const { data: written, error: metricError } = await db.rpc("benchmark_refresh_org_metrics", {
      p_org_id: org.id,
    });
    if (metricError) {
      result.failed += 1;
      ghlError("profile.metrics.failed", { orgId: org.id, error: metricError.message });
    } else {
      result.metricsRefreshed += written ?? 0;
    }

    const { data: signals, error: signalError } = await db.rpc("profile_detect_signals", {
      p_org_id: org.id,
    });
    if (signalError) {
      result.failed += 1;
      ghlError("profile.signals.failed", { orgId: org.id, error: signalError.message });
    } else {
      result.signalsDetected += signals ?? 0;
    }
  }

  const { data: cohorts, error: cohortError } = await db.rpc("benchmark_refresh_cohorts");
  if (cohortError) {
    result.failed += 1;
    ghlError("profile.cohorts.failed", { error: cohortError.message });
  } else {
    result.cohortsWritten = cohorts ?? 0;
  }

  ghlLog("profile.jobs.ran", { ...result });
  return result;
}
