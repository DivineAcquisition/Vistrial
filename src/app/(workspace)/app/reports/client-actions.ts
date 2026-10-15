"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { figureHash, summaryMatchesFigures } from "@/lib/reports/sentences";
import { loadSummary } from "@/lib/metrics/load";
import { metricDefinition } from "@/lib/metrics/definitions";
import { metricNumber } from "@/lib/metrics/format";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const METRICS = ["new_leads", "bookings", "response_within", "response_late"];

export async function releaseClientReport(formData: FormData) {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "service_team" && ctx.workspaceRole !== "platform_admin") return;
  if (formData.get("figures_checked") !== "on" || formData.get("summary_checked") !== "on" || formData.get("sensitive_checked") !== "on") {
    return;
  }
  const summary = String(formData.get("summary") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const fresh = await loadSummary({
    orgId: ctx.org.id,
    metrics: METRICS,
    range: { from, to },
    previous: null,
  });
  const figures = METRICS.map((metric) => {
    const entry = fresh[metric];
    const value = entry && !("hidden" in entry && entry.hidden) ? metricNumber(metricDefinition(metric), entry.current) : null;
    return { metric, value };
  });
  if (figureHash(figures) !== String(formData.get("hash") ?? "")) return;
  const check = summaryMatchesFigures(summary, figures);
  if (!check.ok) return;
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("client_reports")
    .insert({
      org_id: ctx.org.id,
      period_from: from,
      period_to: to,
      sections: METRICS,
      draft_summary: summary,
      summary,
      figure_hash: figureHash(figures),
      figures,
      status: "released",
      checklist: { figures: true, summary: true, sensitive: true },
      prepared_by: ctx.user.id,
      released_by: ctx.user.id,
      released_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return;
  const admin = getSupabaseAdmin();
  const { data: owners } = await admin
    .from("org_members")
    .select("id, user_id")
    .eq("org_id", ctx.org.id)
    .eq("role", "owner")
    .eq("active", true)
    .limit(3);
  for (const owner of owners ?? []) {
    await enqueueNotification(admin, {
      orgId: ctx.org.id,
        eventType: "report_ready",
      channel: "email",
      recipientUserId: owner.user_id,
      recipientMemberId: owner.id,
      subjectIds: [(data as { id: string }).id],
      title: "A monthly report is ready",
      body: "Your Vistrial team released a report. Open Reports to read it.",
      href: "/app/reports/client",
      dedupeKey: `client-report:${(data as { id: string }).id}:${owner.user_id}`,
    });
  }
  revalidatePath("/app/reports/client");
}
