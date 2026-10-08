import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PeriodSelect } from "@/app/(workspace)/app/home/period-select";
import { PageFrame } from "@/components/app/page-frame";
import { getAuthContext } from "@/lib/auth/session";
import { loadMetricLeads } from "@/lib/home/load";
import { HOME_METRIC_DEFINITIONS, isHomeMetricId } from "@/lib/home/metrics";
import { describeRange, parseHomePeriodKey } from "@/lib/home/periods";

export const dynamic = "force-dynamic";

/** The leads behind one home screen number, computed by the same function as the card. */
export default async function HomeMetricPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { metric } = await params;
  if (!isHomeMetricId(metric)) notFound();
  const ctx = await getAuthContext();
  const period = parseHomePeriodKey((await searchParams).period);
  const result = await loadMetricLeads(ctx, metric, period);
  if (!result) notFound();
  const definition = HOME_METRIC_DEFINITIONS[metric];

  return (
    <PageFrame
      title={definition.label}
      description={definition.definition}
      breadcrumbs={[
        { label: "Home", href: `/app/home?period=${period}` },
        { label: definition.label, href: `/app/home/${metric}?period=${period}` },
      ]}
      actions={<PeriodSelect value={period} basePath={`/app/home/${metric}`} />}
    >
      <section aria-label={`${definition.label}, ${result.period.label}`} className="mx-auto w-full max-w-3xl">
        <p className="mb-3 text-sm text-muted-foreground">
          {result.period.label}, {describeRange(result.period)} ·{" "}
          <span className="font-medium text-card-foreground">
            {result.rows.length} {result.rows.length === 1 ? "row" : "rows"}
          </span>
        </p>
        {result.rows.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {result.rows.map((row, index) => (
              <li key={`${row.leadId}:${index}`}>
                <Link
                  href={`/app/cases/${row.leadId}`}
                  className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{row.name}</p>
                    {row.detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail}</p> : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            No leads behind this number for the period.
          </p>
        )}
      </section>
    </PageFrame>
  );
}
