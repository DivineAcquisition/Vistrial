import "server-only";

import type { ForsightDb } from "@/lib/forsight/sources";
import type { ForsightReport, ReportOmission, StoredReport } from "@/lib/forsight/report/types";
import type { Tables } from "@/types/database";

export type ForsightReportRow = Tables<"forsight_reports">;
export type ForsightReportSendRow = Tables<"forsight_report_sends">;

/**
 * Viewing a report reads this and never re-queries a source. The payload was
 * frozen at generation; if the live numbers have moved since, that is the
 * report doing its job.
 */

export function rowToStored(row: ForsightReportRow): StoredReport {
  const report = row.payload as unknown as ForsightReport;
  const omissions = (row.omissions as unknown as ReportOmission[]) ?? report.omissions ?? [];
  return {
    id: row.id,
    orgId: row.org_id,
    version: row.version,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name,
    sourceType: row.source_type,
    report,
    omissions,
  };
}

export async function listReportPeriods(
  db: ForsightDb,
  orgId: string
): Promise<
  Array<{
    periodStart: string;
    periodEnd: string;
    label: string;
    latestVersion: number;
    generatedAt: string;
    generatedBy: string;
    generatedByName: string | null;
  }>
> {
  const { data, error } = await db
    .from("forsight_reports")
    .select(
      "period_start, period_end, version, generated_at, generated_by, generated_by_name, payload"
    )
    .eq("org_id", orgId)
    .order("period_start", { ascending: false })
    .order("version", { ascending: false });
  if (error) throw error;

  const seen = new Set<string>();
  const periods: Array<{
    periodStart: string;
    periodEnd: string;
    label: string;
    latestVersion: number;
    generatedAt: string;
    generatedBy: string;
    generatedByName: string | null;
  }> = [];

  for (const row of data ?? []) {
    if (seen.has(row.period_start)) continue;
    seen.add(row.period_start);
    const payload = row.payload as unknown as ForsightReport;
    periods.push({
      periodStart: row.period_start,
      periodEnd: row.period_end,
      label: payload?.period?.label ?? row.period_start,
      latestVersion: row.version,
      generatedAt: row.generated_at,
      generatedBy: row.generated_by,
      generatedByName: row.generated_by_name,
    });
  }
  return periods;
}

export async function loadStoredReport(
  db: ForsightDb,
  args: { orgId: string; periodStart: string; version?: number | null }
): Promise<StoredReport | null> {
  let query = db
    .from("forsight_reports")
    .select("*")
    .eq("org_id", args.orgId)
    .eq("period_start", args.periodStart)
    .order("version", { ascending: false })
    .limit(1);

  if (args.version && args.version > 0) {
    query = db
      .from("forsight_reports")
      .select("*")
      .eq("org_id", args.orgId)
      .eq("period_start", args.periodStart)
      .eq("version", args.version)
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToStored(data);
}

export async function listReportVersions(
  db: ForsightDb,
  orgId: string,
  periodStart: string
): Promise<Array<{ version: number; generatedAt: string; generatedBy: string; generatedByName: string | null }>> {
  const { data, error } = await db
    .from("forsight_reports")
    .select("version, generated_at, generated_by, generated_by_name")
    .eq("org_id", orgId)
    .eq("period_start", periodStart)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    version: row.version,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name,
  }));
}

export async function loadSendsForReport(db: ForsightDb, reportId: string) {
  const { data, error } = await db
    .from("forsight_report_sends")
    .select("*")
    .eq("report_id", reportId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type PeriodReportStatus = {
  orgId: string;
  version: number | null;
  generatedAt: string | null;
  sentAt: string | null;
};

/** Latest version per workspace for one period, plus whether that version was sent. */
export async function loadPeriodReportStatus(
  db: ForsightDb,
  periodStart: string
): Promise<Map<string, PeriodReportStatus>> {
  const { data: reports, error } = await db
    .from("forsight_reports")
    .select("id, org_id, version, generated_at")
    .eq("period_start", periodStart)
    .order("version", { ascending: false });
  if (error) throw error;

  const latest = new Map<string, { id: string; version: number; generatedAt: string }>();
  for (const row of reports ?? []) {
    if (latest.has(row.org_id)) continue;
    latest.set(row.org_id, { id: row.id, version: row.version, generatedAt: row.generated_at });
  }

  const reportIds = [...latest.values()].map((row) => row.id);
  const sentAt = new Map<string, string>();
  if (reportIds.length > 0) {
    const { data: sends } = await db
      .from("forsight_report_sends")
      .select("report_id, sent_at")
      .in("report_id", reportIds)
      .is("error", null)
      .order("sent_at", { ascending: false });
    for (const send of sends ?? []) {
      if (!sentAt.has(send.report_id)) sentAt.set(send.report_id, send.sent_at);
    }
  }

  const out = new Map<string, PeriodReportStatus>();
  for (const [orgId, row] of latest) {
    out.set(orgId, {
      orgId,
      version: row.version,
      generatedAt: row.generatedAt,
      sentAt: sentAt.get(row.id) ?? null,
    });
  }
  return out;
}

export function periodStartFromParam(param: string): string | null {
  const match = param.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

export function periodPath(periodStart: string): string {
  return periodStart.slice(0, 7);
}
