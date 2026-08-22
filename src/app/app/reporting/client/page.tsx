import { PageFrame } from "@/components/app/page-frame";
import { requireReportingAccess } from "@/lib/reporting/access";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import {
  parseReportingRange,
  reportingRangeQuery,
  reportingViewHref,
} from "@/lib/reporting/range";
import { ReportingRangeForm } from "@/app/app/reporting/range-form";
import { ReportingExports, ReportingPanels, ReportingTabs } from "@/app/app/reporting/panels";
import { buildClientSummary } from "@/lib/reporting/summary";
import { ClientSummaryForm } from "@/app/app/reporting/client-summary-form";
import { Panel } from "@/components/ui/panel";
import { helperClass } from "@/lib/ui";

export default async function ReportingClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireReportingAccess();
  const params = await searchParams;
  const meta = await loadReportingState(ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const range = parseReportingRange(params, activatedAt);

  if (!activatedAt) {
    return (
      <PageFrame title="Client report" description="Nothing to show until the workspace is activated.">
        <p className={helperClass}>Finish or skip the baseline backfill in integrations.</p>
      </PageFrame>
    );
  }

  const [outcome, coverage, sources, terminal, speed] = await Promise.all([
    loadReportingPanel(ctx.org.id, "outcome", range),
    loadReportingPanel(ctx.org.id, "coverage", range),
    loadReportingPanel(ctx.org.id, "sources", range),
    loadReportingPanel(ctx.org.id, "terminal", range),
    loadReportingPanel(ctx.org.id, "speed", range),
  ]);

  const summary = buildClientSummary({
    outcome: outcome as never,
    coverage: coverage as never,
    sources: sources as never,
    terminal: terminal as never,
    speed: speed as never,
  });
  const query = reportingRangeQuery(range);

  return (
    <PageFrame
      title="Client report"
      description="The view for a renewal conversation. Per-operator detail is omitted on purpose."
      actions={<ReportingExports range={range} client />}
      toolbar={<ReportingTabs range={range} activeHref={reportingViewHref("/app/reporting/client", range)} />}
    >
      <ReportingRangeForm range={range} action="/app/reporting/client" />
      <Panel className="mb-8 p-6">
        <ClientSummaryForm summary={summary} query={query} />
      </Panel>
      <ReportingPanels orgId={ctx.org.id} range={range} includeTeam={false} />
    </PageFrame>
  );
}
