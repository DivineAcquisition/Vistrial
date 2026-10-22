import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { MetricCard } from "@/components/metrics/metric-card";
import { BarChart } from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { canSeePeople, canSeeResults } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { describeRange } from "@/lib/home/periods";
import { detailLabel, metricDefinition, METRICS } from "@/lib/metrics/definitions";
import { freshnessLabel, metricView, smallSampleNote } from "@/lib/metrics/format";
import { hasComparisonData, loadBreakdown, loadFacts, loadSummary } from "@/lib/metrics/load";
import { resolveResultsRange } from "@/lib/metrics/range";
import { builtInReport, SOURCE_ATTRIBUTION_NOTE } from "@/lib/reports/builtin";
import { ScheduleForm } from "@/app/(workspace)/app/reports/schedule-form";

export const dynamic = "force-dynamic";

type Params = { key: string };
type Search = Record<string, string | string[] | undefined>;

export default async function ReportPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const ctx = await getAuthContext();
  if (!canSeeResults(ctx)) notFound();
  const { key } = await params;
  const report = builtInReport(key);
  if (!report) notFound();
  if (report.people && !canSeePeople(ctx)) notFound();
  const query = await searchParams;
  const one = (name: string) => (Array.isArray(query[name]) ? query[name]?.[0] : query[name]);
  const range = resolveResultsRange({ range: one("range"), from: one("from"), to: one("to") }, { timeZone: ctx.org.timezone });
  const facts = await loadFacts(ctx.org.id);
  if (!facts) notFound();
  const summary = report.metrics.length
    ? await loadSummary({ orgId: ctx.org.id, metrics: report.metrics, range, previous: range.previous })
    : {};
  const loadedAt = new Date();
  const compare = hasComparisonData(facts, range.previous.from);
  return (
    <PageFrame title={report.title} description={report.howToRead}>
      <p className="text-xs text-muted-foreground">
        {range.label}, {describeRange(range)}. {freshnessLabel(loadedAt, ctx.org.timezone, loadedAt)}. Times use {ctx.org.timezone}.
      </p>
      {report.note ? <p className="text-sm text-muted-foreground">{report.note}</p> : null}
      {key === "playbooks" ? (
        <p className="text-sm">
          <Link href="/app/workflows" className="text-brand-300">Open Workflows</Link> to see the path and where leads leave it.
        </p>
      ) : null}
      {key === "sources" ? <p className="text-sm">{SOURCE_ATTRIBUTION_NOTE}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {report.metrics.map((metric) => {
          const view = metricView({ metric, summary, comparisonLabel: "from the previous period", hasPreviousData: compare });
          if (!view) return null;
          const noun = metricDefinition(metric).rowsAreEvents ? "records" : "leads";
          return (
            <MetricCard
              key={metric}
              label={view.label}
              value={view.display}
              sub={`${view.rows} ${noun}`}
              note={view.smallSample ? smallSampleNote(view.rows, noun) : compare && !view.comparison && !metricDefinition(metric).now ? "Comparison hidden below 20 records." : undefined}
              comparison={view.comparison}
              explain={view.explain}
              href={`/app/results/leads?metric=${metric}&range=${range.params.range ?? "last_30_days"}`}
            />
          );
        })}
      </div>
      {await Promise.all(
        report.breakdowns
          .filter((breakdown) => !breakdown.people || canSeePeople(ctx))
          .map(async (breakdown) => {
            const rows = await loadBreakdown({
              orgId: ctx.org.id,
              metric: breakdown.metric,
              range,
              dimension: breakdown.dimension,
            });
            if (!rows?.length) return null;
            const points = rows.slice(0, 8).map((row) => ({
              label: breakdown.dimension === "detail" ? (detailLabel(breakdown.metric, row.key) ?? row.label) : row.label,
              value: row.count,
            }));
            return (
              <Card key={`${breakdown.metric}-${breakdown.dimension}`} className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">{breakdown.title}</h2>
                <BarChart points={points} label={breakdown.title} />
                <ul className="text-sm text-muted-foreground">
                  {points.map((point) => (
                    <li key={point.label}>
                      {point.label}: {point.value}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })
      )}
      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Definitions</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {report.metrics.map((metric) => (
            <li key={metric}>
              <span className="font-medium text-foreground">{METRICS[metric].label}.</span> {METRICS[metric].explain}
            </li>
          ))}
        </ul>
      </Card>
      {ctx.workspaceRole === "owner" ? <ScheduleForm reportKey={report.key} /> : null}
      <p className="text-sm">
        <Link href="/app/reports" className="text-brand-300 underline-offset-4 hover:underline">
          All reports
        </Link>
      </p>
    </PageFrame>
  );
}
