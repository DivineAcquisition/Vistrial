import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ghlError } from "@/lib/ghl/log";
import { detailLabel, metricDefinition, SHARES, stageLabel } from "@/lib/metrics/definitions";
import { formatMetricValue, metricNumber, visible } from "@/lib/metrics/format";
import {
  loadBreakdown,
  loadFacts,
  loadMetricLeads,
  loadSummary,
  type Db,
} from "@/lib/metrics/load";
import type { ResultsFilters } from "@/lib/metrics/range";
import {
  breakdownsFor,
  breakdownValue,
  mergeObjectionRows,
  rangeDays,
  sectionMetrics,
  sectionsFor,
} from "@/lib/metrics/sections";
import { queuePortalNotice } from "@/lib/portal/notices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const EXPORT_BUCKET = "portal-exports";
const LEAD_LIMIT = 5000;

export type ExportRequest = {
  exportId: string;
  orgId: string;
  memberId: string | null;
  userId: string;
  label: string;
  range: { from: string; to: string };
  previous: { from: string; to: string } | null;
  filters: ResultsFilters;
};

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Spreadsheet apps run cells that start with these as formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function line(values: unknown[]): string {
  return values.map(cell).join(",");
}

/**
 * Builds the CSV as the person who asked, so it holds exactly what they may
 * see on Results. Only storing the file and marking it ready use the service
 * role, scoped to this one export row.
 */
export async function buildResultsExport(db: Db, request: ExportRequest): Promise<void> {
  const admin = getSupabaseAdmin() as unknown as SupabaseClient;
  const mark = (patch: Record<string, unknown>) =>
    admin
      .from("results_exports")
      .update(patch)
      .eq("id", request.exportId)
      .eq("org_id", request.orgId);

  try {
    await mark({ status: "running" });
    const facts = await loadFacts(request.orgId, db);
    if (!facts) throw new Error("Results are not available to this person.");
    const sections = sectionsFor(facts);
    const summary = await loadSummary({
      orgId: request.orgId,
      metrics: sectionMetrics(sections),
      range: request.range,
      previous: request.previous,
      filters: request.filters,
      db,
    });

    const out: string[] = [line(["Results", request.label]), line(["From", request.range.from, "To", request.range.to]), ""];
    out.push(line(["Section", "Number", "Value", "Previous range", "Rows behind it"]));
    for (const section of sections) {
      for (const card of section.cards) {
        if ("share" in card) {
          const share = SHARES[card.share];
          const top = summary[share.numerator];
          const bottom = summary[share.denominator];
          if (!visible(top) || !visible(bottom)) continue;
          const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "");
          out.push(
            line([
              section.title,
              share.label,
              pct(top.current.count, bottom.current.count),
              top.previous && bottom.previous ? pct(top.previous.count, bottom.previous.count) : "",
              bottom.current.count,
            ])
          );
          continue;
        }
        const entry = summary[card.metric];
        if (!visible(entry)) continue;
        const def = metricDefinition(card.metric);
        out.push(
          line([
            section.title,
            def.label,
            formatMetricValue(def, metricNumber(def, entry.current)),
            entry.previous && !def.now ? formatMetricValue(def, metricNumber(def, entry.previous)) : "",
            entry.current.count,
          ])
        );
      }
    }

    const days = rangeDays(request.range);
    for (const section of sections) {
      for (const breakdown of breakdownsFor(section, facts, days)) {
        let rows = await loadBreakdown({
          orgId: request.orgId,
          metric: breakdown.metric,
          range: request.range,
          dimension: breakdown.dimension,
          filters: request.filters,
          db,
        });
        if (!rows?.length) continue;
        if (breakdown.metric === "objections") rows = mergeObjectionRows(rows);
        const def = metricDefinition(breakdown.metric);
        out.push("", line([breakdown.title]), line(["Group", "Value"]));
        for (const row of rows) {
          const label =
            breakdown.dimension === "detail"
              ? (detailLabel(breakdown.metric, row.key) ?? row.label)
              : breakdown.dimension === "stage"
                ? stageLabel(row.key)
                : row.label;
          out.push(line([label, formatMetricValue(def, breakdownValue(breakdown.metric, row))]));
        }
      }
    }

    const leads = await loadMetricLeads({
      orgId: request.orgId,
      metric: "new_leads",
      range: request.range,
      filters: request.filters,
      limit: LEAD_LIMIT,
      db,
    });
    if (leads?.rows.length) {
      out.push("", line(["New leads in the range"]), line(["Lead", "Arrived", "Lead id"]));
      for (const row of leads.rows) out.push(line([row.name, row.at, row.leadId]));
      if (leads.total > leads.rows.length) {
        out.push(line([`First ${leads.rows.length} of ${leads.total}. Narrow the range for the rest.`]));
      }
    }

    const path = `${request.orgId}/${request.exportId}.csv`;
    const { error: upload } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(path, new Blob([`${out.join("\n")}\n`], { type: "text/csv" }), { upsert: true, contentType: "text/csv" });
    if (upload) throw new Error(upload.message);
    await mark({
      status: "ready",
      file_path: path,
      row_count: leads?.rows.length ?? 0,
      completed_at: new Date().toISOString(),
    });

    if (request.memberId) {
      await queuePortalNotice({
        orgId: request.orgId,
        memberId: request.memberId,
        eventType: "export_ready",
        title: "Your Results export is ready",
        body: `${request.label}. The download link works for 7 days.`,
        path: "/app/results#exports",
        dedupeKey: `export-ready:${request.exportId}`,
        subjectIds: [request.exportId],
        actorUserId: request.userId,
      });
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Export failed.";
    ghlError("portal.export.failed", { orgId: request.orgId, exportId: request.exportId, error: message });
    await mark({ status: "failed", error: message.slice(0, 300), completed_at: new Date().toISOString() });
  }
}
