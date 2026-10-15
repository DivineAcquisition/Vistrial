import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { builtInReport } from "@/lib/reports/builtin";
import { metricDefinition } from "@/lib/metrics/definitions";
import { formatMetricValue, metricNumber } from "@/lib/metrics/format";
import type { Aggregate } from "@/lib/metrics/load";
import { API_LIMITS } from "@/lib/api/v1/limits";
import type { SupabaseClient } from "@supabase/supabase-js";

function loose(db: GhlDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

type Schedule = {
  id: string;
  org_id: string;
  report_key: string;
  cadence: "weekly" | "monthly";
  recipient_user_ids: string[];
  include_pdf: boolean;
  enabled: boolean;
};

export async function runScheduledReports(db: GhlDb): Promise<{ sent: number; paused: number }> {
  const client = loose(db);
  const { data: due } = await client
    .from("report_schedules")
    .select("id, org_id, report_key, cadence, recipient_user_ids, include_pdf, enabled")
    .eq("enabled", true)
    .lte("next_send_at", new Date().toISOString())
    .limit(20);
  let sent = 0;
  let paused = 0;
  for (const row of (due ?? []) as Schedule[]) {
    const { data: blocked } = await client.rpc("billing_blocks_cost", { p_org_id: row.org_id });
    if (blocked === true) {
      await client.from("report_schedules").update({ paused_reason: "Paused while billing is restricted.", enabled: false }).eq("id", row.id);
      paused += 1;
      continue;
    }
    const report = builtInReport(row.report_key);
    if (!report) continue;
    const to = new Date();
    const from = new Date(to.getTime() - (row.cadence === "weekly" ? 7 : 30) * 24 * 60 * 60 * 1000);
    const { data: summary } = await client.rpc("portal_metric_summary", {
      p_org_id: row.org_id,
      p_metrics: report.metrics,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_prev_from: null,
      p_prev_to: null,
      p_filters: {},
    });
    const lines = headline(summary, report.metrics.filter((metric) => !report.people || true));
    const { data: members } = await client
      .from("org_members")
      .select("id, user_id, role, active")
      .eq("org_id", row.org_id)
      .eq("active", true)
      .in("user_id", row.recipient_user_ids);
    const allowed = ((members ?? []) as Array<{ id: string; user_id: string; role: string }>).filter((member) =>
      report.people ? member.role === "owner" : true
    );
    for (const member of allowed) {
      await enqueueNotification(db, {
        orgId: row.org_id,
        eventType: "report_ready",
        channel: "email",
        recipientUserId: member.user_id,
        recipientMemberId: member.id,
        subjectIds: [row.id],
        title: report.title,
        body: lines || "Open the report for the latest counts.",
        href: `/app/reports/${row.report_key}`,
        dedupeKey: `report:${row.id}:${to.toISOString().slice(0, 10)}:${member.user_id}`,
      });
    }
    const next = new Date(to.getTime() + (row.cadence === "weekly" ? 7 : 30) * 24 * 60 * 60 * 1000);
    await client.from("report_schedules").update({ last_sent_at: to.toISOString(), next_send_at: next.toISOString(), paused_reason: null }).eq("id", row.id);
    sent += 1;
  }
  return { sent, paused };
}

function headline(summary: unknown, metrics: string[]): string {
  const rows = (summary ?? {}) as Record<string, { hidden?: boolean; current?: Aggregate }>;
  return metrics
    .map((metric) => {
      const entry = rows[metric];
      if (!entry || entry.hidden || !entry.current) return null;
      const def = metricDefinition(metric);
      return `${def.label}: ${formatMetricValue(def, metricNumber(def, entry.current))}`;
    })
    .filter(Boolean)
    .join(". ");
}

export async function scheduledReportCount(db: SupabaseClient, orgId: string): Promise<number> {
  const { count } = await db.from("report_schedules").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("enabled", true);
  return count ?? 0;
}

export { API_LIMITS };
