import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ResultsFiltersForm } from "@/app/(workspace)/app/results/filters-form";
import { filterChoices } from "@/app/(workspace)/app/results/shared";
import { PageFrame } from "@/components/app/page-frame";
import { MetricExplain } from "@/components/metrics/metric-card";
import { canSeePeople, canSeeResults } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { describeRange, isHomePeriodKey, resolveHomePeriod } from "@/lib/home/periods";
import { detailLabel, isMetricRef, metricDefinition } from "@/lib/metrics/definitions";
import { formatMetricValue } from "@/lib/metrics/format";
import { DRILL_PAGE, loadFacts, loadMetricLeads } from "@/lib/metrics/load";
import { filtersToParams, parseResultsFilters, queryString, resolveResultsRange } from "@/lib/metrics/range";

export const dynamic = "force-dynamic";

export const metadata = { title: "Leads behind a number" };

type Params = Record<string, string | string[] | undefined>;

const SHOW_VALUE = new Set(["first_touch_time", "response_decided", "response_within", "response_late", "revenue"]);

function paramLabel(metric: string): string | null {
  const at = metric.indexOf(":");
  if (at < 0) return null;
  const param = metric.slice(at + 1);
  if (!param) return null;
  return detailLabel(metric, param);
}

export default async function ResultsLeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getAuthContext();
  if (!canSeeResults(ctx)) notFound();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]) as string | undefined;
  const metric = one("metric");
  if (!isMetricRef(metric)) notFound();
  const def = metricDefinition(metric);

  const period = one("period");
  const range = isHomePeriodKey(period)
    ? { ...resolveHomePeriod(period, { timeZone: ctx.org.timezone }), params: { period } as Record<string, string> }
    : resolveResultsRange({ range: one("range"), from: one("from"), to: one("to") }, { timeZone: ctx.org.timezone });
  const filters = parseResultsFilters(params);
  const people = canSeePeople(ctx);
  if (filters.person && !people) delete filters.person;
  const page = Math.max(1, Math.min(500, Number.parseInt(one("page") ?? "1", 10) || 1));

  const [facts, result] = await Promise.all([
    loadFacts(ctx.org.id),
    loadMetricLeads({ orgId: ctx.org.id, metric, range, filters, offset: (page - 1) * DRILL_PAGE }),
  ]);
  if (!facts || !result) notFound();

  const keep = { metric, ...range.params, ...filtersToParams(filters) };
  const pageHref = (next: number) => `/app/results/leads${queryString({ ...keep, page: next > 1 ? String(next) : undefined })}`;
  const backHref = isHomePeriodKey(period) ? `/app/home?period=${period}` : `/app/results${queryString({ ...range.params, ...filtersToParams(filters) })}`;
  const sub = paramLabel(metric);
  const title = sub ? `${def.label}: ${sub}` : def.label;
  const noun = def.rowsAreEvents ? "rows" : "leads";
  const pages = Math.max(1, Math.ceil(result.total / DRILL_PAGE));

  return (
    <PageFrame
      title={title}
      breadcrumbs={[
        { label: isHomePeriodKey(period) ? "Home" : "Results", href: backHref },
        { label: title, href: pageHref(page) },
      ]}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <MetricExplain explain={def.explain} />
        {!isHomePeriodKey(period) ? (
          <ResultsFiltersForm
            current={{ ...range.params, ...filtersToParams(filters) }}
            choices={filterChoices(facts)}
            extra={{ metric }}
          />
        ) : null}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {def.now ? "Right now" : `${range.label}, ${describeRange(range)}`} ·{" "}
          <span className="font-medium text-card-foreground">
            {result.total} {result.total === 1 ? noun.replace(/s$/, "") : noun}
          </span>
          {def.rowsAreEvents ? " (a lead can appear more than once)" : ""}
        </p>
        {result.rows.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {result.rows.map((row, index) => {
              const detail = detailLabel(metric, row.detail);
              const value = SHOW_VALUE.has(def.id) && row.value !== null ? formatMetricValue(def, row.value) : null;
              const when = row.at
                ? new Date(row.at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: ctx.org.timezone,
                  })
                : null;
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{row.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[when, detail, value].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {people ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                </>
              );
              return (
                <li key={`${row.leadId}:${index}`}>
                  {people ? (
                    <Link
                      href={`/app/cases/${row.leadId}`}
                      className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Nothing behind this number for the range and filters chosen.
          </p>
        )}
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="font-medium text-brand-300 underline-offset-4 hover:underline">
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={pageHref(page + 1)} className="font-medium text-brand-300 underline-offset-4 hover:underline">
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </PageFrame>
  );
}
