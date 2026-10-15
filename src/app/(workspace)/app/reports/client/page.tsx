import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Card } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";
import { draftFromFigures, figureHash, summaryMatchesFigures } from "@/lib/reports/sentences";
import { loadSummary } from "@/lib/metrics/load";
import { resolveResultsRange } from "@/lib/metrics/range";
import { metricNumber } from "@/lib/metrics/format";
import { metricDefinition } from "@/lib/metrics/definitions";
import { createClient } from "@/lib/supabase/server";
import { releaseClientReport } from "@/app/(workspace)/app/reports/client-actions";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client report" };

const METRICS = ["new_leads", "bookings", "response_within", "response_late"] as const;

export default async function ClientReportPage() {
  const ctx = await getAuthContext();
  if (!["service_team", "platform_admin", "owner"].includes(ctx.workspaceRole)) notFound();
  const range = resolveResultsRange({ range: "last_30_days" }, { timeZone: ctx.org.timezone });
  const summary = await loadSummary({ orgId: ctx.org.id, metrics: [...METRICS], range, previous: range.previous });
  const figures = METRICS.map((metric) => {
    const entry = summary[metric];
    const value = entry && !("hidden" in entry && entry.hidden) ? metricNumber(metricDefinition(metric), entry.current) : null;
    return { metric, value };
  });
  const draft = draftFromFigures(figures);
  const hash = figureHash(figures);
  const staff = ctx.workspaceRole === "service_team" || ctx.workspaceRole === "platform_admin";
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: released } = await db
    .from("client_reports")
    .select("id, summary, released_at, status")
    .eq("org_id", ctx.org.id)
    .eq("status", "released")
    .order("released_at", { ascending: false })
    .limit(6);
  return (
    <PageFrame
      title="Monthly client report"
      description="Prepared by the customer's Vistrial team. Nothing is released until a person reviews the figures and the wording."
    >
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Draft from the figures</h2>
        <pre className="whitespace-pre-wrap text-sm">{draft}</pre>
        {staff ? (
          <form action={releaseClientReport} className="space-y-3">
            <input type="hidden" name="hash" value={hash} />
            <input type="hidden" name="from" value={range.from} />
            <input type="hidden" name="to" value={range.to} />
            <input type="hidden" name="figures" value={JSON.stringify(figures)} />
            <label className="block text-sm">
              Summary
              <textarea name="summary" defaultValue={draft} rows={8} className="mt-1 w-full rounded-md border bg-background p-2" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="figures_checked" required /> Figures checked against Results
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="summary_checked" required /> Summary reviewed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sensitive_checked" required /> Nothing sensitive is included
            </label>
            <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              Release to the owner
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Released reports appear here. A team member prepares them.</p>
        )}
      </Card>
      <ul className="space-y-3">
        {((released ?? []) as Array<{ id: string; summary: string; released_at: string }>).map((report) => (
          <li key={report.id}>
            <Card className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Released {new Date(report.released_at).toLocaleString()}</p>
              <pre className="whitespace-pre-wrap text-sm">{report.summary}</pre>
            </Card>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}

export { summaryMatchesFigures };
