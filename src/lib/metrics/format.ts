import { compare, formatCents, formatReplyTime, type Comparison } from "@/lib/home/metrics";
import {
  isSmallSample,
  metricDefinition,
  SHARES,
  type MetricDefinition,
  type ShareId,
} from "@/lib/metrics/definitions";
import type { Aggregate, Summary, SummaryEntry } from "@/lib/metrics/load";

export { formatCents };

/** The single number a metric shows, before formatting. */
export function metricNumber(def: Pick<MetricDefinition, "measure">, aggregate: Aggregate | null): number | null {
  if (!aggregate) return null;
  switch (def.measure) {
    case "count":
      return aggregate.count;
    case "leads":
      return aggregate.leads;
    case "median":
      return aggregate.count > 0 ? aggregate.median : null;
    case "sum":
      return aggregate.count > 0 ? (aggregate.sum ?? 0) : 0;
  }
}

export function formatDurationSeconds(seconds: number): string {
  return formatReplyTime(seconds / 60);
}

export function formatMetricValue(def: Pick<MetricDefinition, "unit">, value: number | null): string {
  if (value === null) return "—";
  if (def.unit === "money") return formatCents(value);
  if (def.unit === "duration") return formatDurationSeconds(value);
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatShare(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function visible(entry: SummaryEntry | undefined): entry is Exclude<SummaryEntry, { hidden: true }> {
  return Boolean(entry && !entry.hidden);
}

/** The current number for one metric, or null when the person may not see it. */
export function currentNumber(metric: string, entry: SummaryEntry | undefined): number | null {
  if (!visible(entry)) return null;
  return metricNumber(metricDefinition(metric), entry.current);
}

export type MetricView = {
  metric: string;
  label: string;
  explain: string;
  value: number | null;
  display: string;
  comparison: Comparison | null;
  /** Rows behind the number, for the small-sample note and drill-through. */
  rows: number;
  smallSample: boolean;
};

export function metricView(args: {
  metric: string;
  summary: Summary;
  comparisonLabel: string;
  hasPreviousData: boolean;
  label?: string;
}): MetricView | null {
  const entry = args.summary[args.metric];
  if (!visible(entry)) return null;
  const def = metricDefinition(args.metric);
  const value = metricNumber(def, entry.current);
  const previous = entry.previous ? metricNumber(def, entry.previous) : null;
  return {
    metric: args.metric,
    label: args.label ?? def.label,
    explain: def.explain,
    value,
    display: formatMetricValue(def, value),
    comparison:
      def.now || !entry.previous
        ? null
        : compare({
            current: value,
            previous,
            hasPreviousData: args.hasPreviousData,
            comparisonLabel: args.comparisonLabel,
            lowerIsBetter: def.lowerIsBetter,
            format: (delta) => formatMetricValue(def, delta),
          }),
    rows: entry.current.count,
    smallSample: def.measure === "median" && isSmallSample(entry.current.count),
  };
}

export type ShareView = {
  id: ShareId;
  label: string;
  explain: string;
  value: number | null;
  display: string;
  numerator: number;
  denominator: number;
  comparison: Comparison | null;
  smallSample: boolean;
  drill: string;
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function shareView(args: {
  id: ShareId;
  summary: Summary;
  comparisonLabel: string;
  hasPreviousData: boolean;
}): ShareView | null {
  const share = SHARES[args.id];
  const top = args.summary[share.numerator];
  const bottom = args.summary[share.denominator];
  if (!visible(top) || !visible(bottom)) return null;
  const numerator = top.current.count;
  const denominator = bottom.current.count;
  const value = ratio(numerator, denominator);
  const previous =
    top.previous && bottom.previous ? ratio(top.previous.count, bottom.previous.count) : null;
  return {
    id: args.id,
    label: share.label,
    explain: share.explain,
    value,
    display: formatShare(value),
    numerator,
    denominator,
    comparison: compare({
      current: value === null ? null : Math.round(value * 100),
      previous: previous === null ? null : Math.round(previous * 100),
      hasPreviousData: args.hasPreviousData,
      comparisonLabel: args.comparisonLabel,
      format: (delta) => `${Math.round(delta)} points`,
    }),
    smallSample: isSmallSample(denominator),
    drill: share.drill,
  };
}

export function smallSampleNote(count: number, noun = "leads"): string {
  return `Based on ${count} ${count === 1 ? noun.replace(/s$/, "") : noun}, too few to read much into yet.`;
}

/** "Updated 2 min ago" for figures that are computed when the page loads. */
export function freshnessLabel(at: Date, timeZone: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "Up to date as of just now";
  if (minutes < 60) return `Up to date as of ${minutes} min ago`;
  return `Up to date as of ${at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone })}`;
}
