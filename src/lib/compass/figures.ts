import { comparisonAllowed, isSmallSample, metricDefinition, SHARES, type ShareId } from "@/lib/metrics/definitions";
import { formatMetricValue, formatShare, metricNumber } from "@/lib/metrics/format";
import type { Aggregate, Summary, SummaryEntry } from "@/lib/metrics/load";

/**
 * Figures as Compass states them, computed exactly as Results computes them:
 * the same metric definitions, the same measure (count, leads, median, sum),
 * and the same share pairs. A figure Compass gives therefore equals the figure
 * on Home and Results for the same range.
 */

export type Figure = {
  metric: string;
  label: string;
  value: number | null;
  display: string;
  previous: number | null;
  previousDisplay: string | null;
  /** Set when a previous period exists but the sample is too small to compare. */
  comparisonNote: string | null;
  /** Rows behind the number. */
  rows: number;
  smallSample: boolean;
  definition: string;
};

export type ShareFigure = {
  id: ShareId;
  label: string;
  value: number | null;
  display: string;
  numerator: number;
  denominator: number;
  smallSample: boolean;
  definition: string;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function aggregate(value: unknown): Aggregate {
  const row = (value ?? {}) as Record<string, unknown>;
  return { count: num(row.count) ?? 0, leads: num(row.leads) ?? 0, sum: num(row.sum), avg: num(row.avg), median: num(row.median) };
}

/** The same parsing loadSummary applies to portal_metric_summary. */
export function parseSummary(raw: unknown): Summary {
  const out: Summary = {};
  for (const [metric, entry] of Object.entries((raw ?? {}) as Record<string, Record<string, unknown>>)) {
    out[metric] = entry?.hidden ? { hidden: true } : { current: aggregate(entry?.current), previous: entry?.previous ? aggregate(entry.previous) : null };
  }
  return out;
}

function visible(entry: SummaryEntry | undefined): entry is Exclude<SummaryEntry, { hidden: true }> {
  return Boolean(entry && !entry.hidden);
}

export function figureFor(metric: string, summary: Summary): Figure | null {
  const entry = summary[metric];
  if (!visible(entry)) return null;
  const def = metricDefinition(metric);
  const value = metricNumber(def, entry.current);
  const previous = entry.previous ? metricNumber(def, entry.previous) : null;
  const allowCompare = !def.now && comparisonAllowed(entry.current.count, entry.previous?.count);
  return {
    metric,
    label: def.label,
    value,
    display: formatMetricValue(def, value),
    previous: allowCompare ? previous : null,
    previousDisplay: allowCompare && entry.previous ? formatMetricValue(def, previous) : null,
    comparisonNote:
      entry.previous && !def.now && !allowCompare
        ? "The comparison is hidden because one period has fewer than 20 records."
        : null,
    rows: entry.current.count,
    smallSample: def.measure === "median" && isSmallSample(entry.current.count),
    definition: def.explain,
  };
}

export function shareFor(id: ShareId, summary: Summary): ShareFigure | null {
  const share = SHARES[id];
  const top = summary[share.numerator];
  const bottom = summary[share.denominator];
  if (!visible(top) || !visible(bottom)) return null;
  const numerator = top.current.count;
  const denominator = bottom.current.count;
  const value = denominator > 0 ? numerator / denominator : null;
  return {
    id,
    label: share.label,
    value,
    display: formatShare(value),
    numerator,
    denominator,
    smallSample: isSmallSample(denominator),
    definition: share.explain,
  };
}

/** Which of the asked-for metrics came back hidden: the person may not see them. */
export function hiddenMetrics(summary: Summary): string[] {
  return Object.entries(summary)
    .filter(([, entry]) => entry && "hidden" in entry && entry.hidden)
    .map(([metric]) => metric);
}
