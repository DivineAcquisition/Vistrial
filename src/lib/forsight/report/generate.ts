import "server-only";

import { forsightProviderFor } from "@/lib/forsight/provider";
import { loadForsightSources, type ForsightDb } from "@/lib/forsight/sources";
import { buildReport, monthPeriod } from "@/lib/forsight/report/build";
import { forsightLog } from "@/lib/forsight/report/log";
import { rowToStored, type ForsightReportRow } from "@/lib/forsight/report/load";
import type { StoredReport } from "@/lib/forsight/report/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type GenerateActor = {
  kind: "scheduled" | "operator";
  memberId?: string | null;
  name?: string | null;
};

/**
 * Reads the month through the workspace's adapter, writes a frozen row, and
 * never sends it. Sending is a separate, explicit operator action.
 *
 * Scheduled generation skips a period that already has a report. Regeneration
 * is an operator action and always inserts the next version beside the old one.
 */
export async function generateReport(args: {
  db: ForsightDb;
  orgId: string;
  orgName: string;
  periodStart: string;
  actor: GenerateActor;
  /** Operator-only. Scheduled runs never pass this. */
  replace?: boolean;
}): Promise<
  | { status: "generated"; stored: StoredReport }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
> {
  const period = monthPeriod(args.periodStart);
  const admin = getSupabaseAdmin();

  if (args.actor.kind === "scheduled" && !args.replace) {
    const { data: existing } = await admin
      .from("forsight_reports")
      .select("id")
      .eq("org_id", args.orgId)
      .eq("period_start", period.start)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        status: "skipped",
        reason: `${args.orgName} already has a ${period.label} report. Regeneration is an operator action.`,
      };
    }
  }

  try {
    const provider = await forsightProviderFor(args.db, {
      orgId: args.orgId,
      orgName: args.orgName,
    });
    const metrics = await provider.monthly({ start: period.start, end: period.end });
    if (!metrics.available) {
      return { status: "failed", reason: metrics.reason };
    }

    const sources = await loadForsightSources(args.db, args.orgId);
    const omissions = [...metrics.data.omissions];
    const hasMeta = sources.some((source) => source.type === "meta_ads");
    if (!hasMeta) {
      omissions.push({
        section: "Generation",
        line: "Ad spend",
        reason: "This workspace has no Meta ad source connected.",
      });
    }

    const generatedAt = new Date().toISOString();
    const report = buildReport({
      workspace: { id: args.orgId, name: args.orgName },
      period,
      generatedAt,
      metrics: { ...metrics.data, omissions },
    });

    for (const omission of report.omissions) {
      forsightLog("forsight.report.omission", {
        orgId: args.orgId,
        period: period.start,
        section: omission.section,
        line: omission.line,
        reason: omission.reason,
      });
    }

    const { data: version, error: versionError } = await admin.rpc(
      "forsight_next_report_version",
      { p_org_id: args.orgId, p_period_start: period.start }
    );
    if (versionError) {
      return { status: "failed", reason: versionError.message };
    }

    const { data: row, error } = await admin
      .from("forsight_reports")
      .insert({
        org_id: args.orgId,
        period_start: period.start,
        period_end: period.end,
        version: version ?? 1,
        generated_at: generatedAt,
        generated_by: args.actor.kind,
        generated_by_member_id: args.actor.memberId ?? null,
        generated_by_name: args.actor.name ?? (args.actor.kind === "scheduled" ? "scheduled" : null),
        source_type: provider.sourceType,
        payload: report as unknown as Json,
        omissions: report.omissions as unknown as Json,
      })
      .select("*")
      .single();

    if (error || !row) {
      return { status: "failed", reason: error?.message ?? "Insert returned no row." };
    }

    forsightLog("forsight.report.generated", {
      orgId: args.orgId,
      period: period.start,
      version: row.version,
      actor: args.actor.kind,
      omissions: report.omissions.length,
    });

    return { status: "generated", stored: rowToStored(row as ForsightReportRow) };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Generation failed.",
    };
  }
}

export async function generatePreviousMonthForAll(
  db: ForsightDb,
  today: string
): Promise<{ generated: number; skipped: number; failed: number }> {
  const { previousMonthStart } = await import("@/lib/forsight/report/build");
  const periodStart = previousMonthStart(today);

  const { data: orgs, error } = await db
    .from("organizations")
    .select("id, name")
    .is("offboarded_at", null)
    .order("name", { ascending: true });
  if (error) throw error;

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of orgs ?? []) {
    const result = await generateReport({
      db,
      orgId: org.id,
      orgName: org.name,
      periodStart,
      actor: { kind: "scheduled", name: "scheduled" },
    });
    if (result.status === "generated") generated += 1;
    else if (result.status === "skipped") skipped += 1;
    else {
      failed += 1;
      forsightLog("forsight.report.failed", {
        orgId: org.id,
        period: periodStart,
        reason: result.reason,
      });
    }
  }

  return { generated, skipped, failed };
}
