import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import { EXTRACTION_AUDIT_SAMPLE } from "@/lib/calibration/constants";

export async function runCalibrationJobs(db: GhlDb): Promise<{
  suggestions: { processed: number; failed: number };
  audits: { processed: number; failed: number };
  benchmarks: { rows: number };
}> {
  const suggestions = { processed: 0, failed: 0 };
  const audits = { processed: 0, failed: 0 };

  const { data: orgs, error } = await db
    .from("organizations")
    .select("id")
    .is("offboarded_at", null);
  if (error) throw error;

  for (const org of orgs ?? []) {
    const { error: sugError } = await db.rpc("refresh_calibration_suggestions", {
      p_org_id: org.id,
    });
    if (sugError) {
      suggestions.failed += 1;
      ghlError("calibration.suggestions.failed", { orgId: org.id, error: sugError.message });
    } else {
      suggestions.processed += 1;
    }

    const { error: auditError } = await db.rpc("run_extraction_sample_audit", {
      p_org_id: org.id,
      p_limit: EXTRACTION_AUDIT_SAMPLE,
    });
    if (auditError) {
      audits.failed += 1;
      ghlError("calibration.audit.failed", { orgId: org.id, error: auditError.message });
    } else {
      audits.processed += 1;
    }
  }

  const { data: bench, error: benchError } = await db.rpc("refresh_calibration_benchmarks");
  if (benchError) {
    ghlError("calibration.benchmarks.failed", { error: benchError.message });
    throw benchError;
  }

  ghlLog("calibration.jobs.ran", {
    suggestions: suggestions.processed,
    audits: audits.processed,
    benchmarks: bench ?? 0,
  });

  if (suggestions.failed > 0 || audits.failed > 0) {
    throw new Error(
      `calibration job incomplete: ${suggestions.failed} suggestion refresh failures, ${audits.failed} audit failures`
    );
  }

  return {
    suggestions,
    audits,
    benchmarks: { rows: typeof bench === "number" ? bench : 0 },
  };
}
