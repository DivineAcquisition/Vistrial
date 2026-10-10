import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ExportButton } from "@/app/(workspace)/app/results/export-button";
import { ExportsList, type ExportRow } from "@/app/(workspace)/app/results/exports-list";
import { ResultsFiltersForm } from "@/app/(workspace)/app/results/filters-form";
import { buildDrillHref, filterChoices } from "@/app/(workspace)/app/results/shared";
import { PageFrame } from "@/components/app/page-frame";
import { BarList, MetricCard } from "@/components/metrics/metric-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyWorkspace } from "@/app/(workspace)/app/home/sections";
import { canViewPortal } from "@/lib/auth/permissions";
import { canExport, canSeePeople, canSeeResults } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { describeRange } from "@/lib/home/periods";
import { detailLabel, metricDefinition, stageLabel } from "@/lib/metrics/definitions";
import {
  formatMetricValue,
  freshnessLabel,
  metricView,
  shareView,
  smallSampleNote,
} from "@/lib/metrics/format";
import { hasComparisonData, loadBreakdown, loadFacts, loadSummary, portalDb, type Summary, type WorkspaceFacts } from "@/lib/metrics/load";
import {
  filtersToParams,
  hasFilters,
  parseResultsFilters,
  resolveResultsRange,
  type ResultsFilters,
  type ResultsRange,
} from "@/lib/metrics/range";
import {
  breakdownsFor,
  breakdownValue,
  mergeObjectionRows,
  rangeDays,
  sectionMetrics,
  sectionsFor,
  type ResultsSection,
  type SectionBreakdown,
} from "@/lib/metrics/sections";

export const dynamic = "force-dynamic";

export const metadata = { title: "Results" };

type Params = Record<string, string | string[] | undefined>;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getAuthContext();
  if (!canSeeResults(ctx)) notFound();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]) as string | undefined;
  const range = resolveResultsRange({ range: one("range"), from: one("from"), to: one("to") }, { timeZone: ctx.org.timezone });
  const filters = parseResultsFilters(params);
  if (filters.person && !canSeePeople(ctx)) delete filters.person;
  const facts = await loadFacts(ctx.org.id);
  if (!facts) notFound();

  const filterParams = filtersToParams(filters);
  const allParams = { ...range.params, ...filterParams };
  const exportable = canExport(ctx) && facts.can_export;
  const loadedAt = new Date();

  return (
    <PageFrame
      title="Results"
      description="Whether this workspace is turning leads into booked calls and clients, and where it is slipping."
      actions={exportable && facts.has_leads ? <ExportButton params={allParams} /> : undefined}
    >
      {!facts.has_leads ? (
        <EmptyWorkspace name={ctx.org.name} canConnect={canSeePeople(ctx)} />
      ) : (
        <>
          <ResultsFiltersForm current={allParams} choices={filterChoices(facts)} />
          <p className="text-xs text-muted-foreground">
            {range.label}, {describeRange(range)}
            {hasFilters(filters) ? " · filtered" : ""} · {freshnessLabel(loadedAt, ctx.org.timezone, loadedAt)}
          </p>
          <Suspense key={JSON.stringify(allParams)} fallback={<SectionsSkeleton />}>
            <Sections ctx={ctx} facts={facts} range={range} filters={filters} />
          </Suspense>
        </>
      )}
      {exportable ? (
        <Suspense fallback={null}>
          <RecentExports ctx={ctx} />
        </Suspense>
      ) : null}
      {canViewPortal(ctx.role, ctx.isStaff) ? (
        <p className="text-sm text-muted-foreground">
          Looking for the client report and its email schedule?{" "}
          <Link href="/portal" className="font-medium text-brand-300 underline-offset-4 hover:underline">
            Open the report
          </Link>
        </p>
      ) : null}
    </PageFrame>
  );
}

async function RecentExports({ ctx }: { ctx: AuthContext }) {
  const db = await portalDb();
  const { data } = await db
    .from("results_exports")
    .select("id, params, status, created_at, expires_at, error")
    .eq("org_id", ctx.org.id)
    .eq("requested_by_user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows: ExportRow[] = ((data ?? []) as Array<ExportRow & { params: { label?: string } | null }>).map((row) => ({
    id: row.id,
    label: row.params?.label ?? "Results",
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    error: row.error,
  }));
  return <ExportsList rows={rows} timeZone={ctx.org.timezone} />;
}

function SectionsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading results">
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((card) => (
              <Card key={card} className="p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-16" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function Sections({
  ctx,
  facts,
  range,
  filters,
}: {
  ctx: AuthContext;
  facts: WorkspaceFacts;
  range: ResultsRange;
  filters: ResultsFilters;
}) {
  const sections = sectionsFor(facts);
  const db = await portalDb();
  const summary = await loadSummary({
    orgId: ctx.org.id,
    metrics: sectionMetrics(sections),
    range,
    previous: range.previous,
    filters,
    db,
  });
  const hasPreviousData = hasComparisonData(facts, range.previous.from);
  const days = rangeDays(range);
  const rendered = sections.map((section) => (
      <ResultsSectionView
        key={section.id}
        ctx={ctx}
        section={section}
        breakdowns={breakdownsFor(section, facts, days)}
        summary={summary}
        range={range}
        filters={filters}
        hasPreviousData={hasPreviousData}
        topBand={facts.top_band}
      />
    ));
  return <div className="flex flex-col gap-8">{rendered}</div>;
}

async function ResultsSectionView({
  ctx,
  section,
  breakdowns,
  summary,
  range,
  filters,
  hasPreviousData,
  topBand,
}: {
  ctx: AuthContext;
  section: ResultsSection;
  breakdowns: SectionBreakdown[];
  summary: Summary;
  range: ResultsRange;
  filters: ResultsFilters;
  hasPreviousData: boolean;
  topBand: string | null;
}) {
  const db = await portalDb();
  const base = { summary, comparisonLabel: "from the range before", hasPreviousData };
  const drill = (metric: string, extra: Record<string, string> = {}) => buildDrillHref(metric, range, filters, extra);

  const cards = section.cards.flatMap((card) => {
    if ("share" in card) {
      const share = shareView({ ...base, id: card.share });
      if (!share || share.denominator === 0) return [];
      return [
        <MetricCard
          key={card.share}
          label={share.label}
          value={share.display}
          sub={`${share.numerator} of ${share.denominator}`}
          comparison={share.comparison}
          explain={share.explain}
          note={share.smallSample ? smallSampleNote(share.denominator) : null}
          href={drill(share.drill)}
        />,
      ];
    }
    const label = card.metric === "hot_open" && topBand ? `Ready now (${topBand})` : undefined;
    const view = metricView({ ...base, metric: card.metric, label });
    if (!view) return [];
    if (metricDefinition(card.metric).unit === "duration" && view.value === null) return [];
    return [
      <MetricCard
        key={card.metric}
        label={view.label}
        value={view.display}
        sub={metricDefinition(card.metric).now ? "Right now" : null}
        comparison={view.comparison}
        explain={view.explain}
        note={view.smallSample ? smallSampleNote(view.rows) : null}
        href={drill(card.metric)}
      />,
    ];
  });

  const charts = await Promise.all(
    breakdowns.map(async (breakdown) => {
      let rows = await loadBreakdown({
        orgId: ctx.org.id,
        metric: breakdown.metric,
        range,
        dimension: breakdown.dimension,
        filters,
        db,
      });
      if (!rows?.length) return null;
      if (breakdown.metric === "objections") rows = mergeObjectionRows(rows);
      if (breakdown.dimension === "day") rows = [...rows].sort((a, b) => a.key.localeCompare(b.key));
      if (breakdown.dimension === "detail" && breakdown.metric === "stage_moves") rows = rows.slice(0, 10);
      const def = metricDefinition(breakdown.metric);
      const bars = rows.map((row) => {
        const value = breakdownValue(breakdown.metric, row);
        return {
          key: row.key,
          label:
            breakdown.dimension === "detail"
              ? (detailLabel(breakdown.metric, row.key) ?? row.label)
              : breakdown.dimension === "stage"
                ? stageLabel(row.key)
                : breakdown.dimension === "band" && row.key === "none"
                  ? "No case file yet"
                  : row.label,
          value,
          display: formatMetricValue(def, value),
          href: breakdownHref(breakdown, row.key, drill),
        };
      });
      return (
        <Card key={`${breakdown.metric}:${breakdown.dimension}`} className="gap-2 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-card-foreground">{breakdown.title}</h3>
          <BarList rows={bars} label={breakdown.title} />
        </Card>
      );
    })
  );

  if (!cards.length && !charts.some(Boolean)) return null;
  return (
    <section aria-labelledby={`results-${section.id}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`results-${section.id}`} className="font-heading text-base text-card-foreground">
          {section.title}
        </h2>
        <p className="text-sm text-muted-foreground">{section.hint}</p>
      </div>
      {cards.length ? <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{cards}</div> : null}
      {charts.some(Boolean) ? <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">{charts}</div> : null}
    </section>
  );
}

const PARAM_METRICS = new Set(["open_leads", "stage_moves", "band_moves", "objections", "revenue"]);

function breakdownHref(
  breakdown: SectionBreakdown,
  key: string,
  drill: (metric: string, extra?: Record<string, string>) => string
): string | null {
  switch (breakdown.dimension) {
    case "source":
      return drill(breakdown.metric, { source: key });
    case "person":
      return drill(breakdown.metric, { person: key });
    case "stage":
      return drill(breakdown.metric, { stage: key });
    case "band":
      return key === "none" || breakdown.metric !== "open_leads" ? null : drill(`open_band:${key}`);
    case "day":
      return drill(breakdown.metric, { range: "custom", from: key, to: key });
    case "detail":
      return PARAM_METRICS.has(breakdown.metric) && key !== "none" ? drill(`${breakdown.metric}:${key}`) : null;
  }
}
