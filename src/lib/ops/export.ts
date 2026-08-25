import type { GhlDb } from "@/lib/ghl/tokens";

export type OrgExportBundle = {
  exportedAt: string;
  org: Record<string, unknown>;
  tables: Record<string, unknown[]>;
};

export async function buildOrgExport(db: GhlDb, orgId: string): Promise<OrgExportBundle> {
  const { data: org, error } = await db.from("organizations").select("*").eq("id", orgId).maybeSingle();
  if (error || !org) throw new Error("org_missing");

  const [
    leads,
    touches,
    calls,
    extractions,
    objections,
    scores,
    revenue,
    businessProfile,
    reportingSnapshots,
    reportingCohorts,
    baselineRuns,
    baselineLeads,
    baselineTouches,
    baselineCalls,
    baselineRevenue,
    selfReportedBaselines,
  ] = await Promise.all([
    db.from("leads").select("*").eq("org_id", orgId),
    db.from("touches").select("*").eq("org_id", orgId),
    db.from("calls").select("*").eq("org_id", orgId),
    db.from("call_extractions").select("*").eq("org_id", orgId),
    db.from("objections").select("*").eq("org_id", orgId),
    db.from("readiness_scores").select("*").eq("org_id", orgId),
    db.from("revenue_log").select("*").eq("org_id", orgId),
    db.from("business_profiles").select("*").eq("org_id", orgId),
    db.from("reporting_snapshots").select("*").eq("org_id", orgId),
    db.from("reporting_cohorts").select("*").eq("org_id", orgId),
    db.from("baseline_runs").select("*").eq("org_id", orgId),
    db.from("baseline_leads").select("*").eq("org_id", orgId),
    db.from("baseline_touches").select("*").eq("org_id", orgId),
    db.from("baseline_calls").select("*").eq("org_id", orgId),
    db.from("baseline_revenue").select("*").eq("org_id", orgId),
    db.from("self_reported_baselines").select("*").eq("org_id", orgId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    org: org as unknown as Record<string, unknown>,
    tables: {
      leads: leads.data ?? [],
      touches: touches.data ?? [],
      calls: calls.data ?? [],
      extractions: extractions.data ?? [],
      objections: objections.data ?? [],
      scores: scores.data ?? [],
      revenue: revenue.data ?? [],
      businessProfile: businessProfile.data ?? [],
      reportingSnapshots: reportingSnapshots.data ?? [],
      reportingCohorts: reportingCohorts.data ?? [],
      baselineRuns: baselineRuns.data ?? [],
      baselineLeads: baselineLeads.data ?? [],
      baselineTouches: baselineTouches.data ?? [],
      baselineCalls: baselineCalls.data ?? [],
      baselineRevenue: baselineRevenue.data ?? [],
      selfReportedBaselines: selfReportedBaselines.data ?? [],
    },
  };
}

export function exportFilename(org: { slug?: string; name?: string }): string {
  const slug = org.slug || org.name || "org";
  const stamp = new Date().toISOString().slice(0, 10);
  return `vistrial-${slug}-${stamp}.json`;
}

export function exportJson(bundle: OrgExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}
