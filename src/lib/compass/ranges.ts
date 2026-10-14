import { RESULTS_RANGE_KEYS, RESULTS_RANGE_LABELS, resolveResultsRange, type ResultsRange, type ResultsRangeKey } from "@/lib/metrics/range";

/**
 * Compass uses Results' own ranges, resolved in the workspace's time zone, so
 * a figure Compass gives for "last 7 days" is the figure Results shows for
 * "Last 7 days". Custom dates go through the same resolver.
 */

export const COMPASS_RANGE_KEYS = RESULTS_RANGE_KEYS;
export type CompassRangeKey = ResultsRangeKey;

export type CompassRangeInput = { range?: string | null; from?: string | null; to?: string | null };

export function compassRange(input: CompassRangeInput, timeZone: string, now = new Date()): ResultsRange {
  return resolveResultsRange(
    { range: input.range ?? "last_7_days", from: input.from ?? null, to: input.to ?? null },
    { now, timeZone }
  );
}

/** "Last 7 days (Oct 5 to Oct 11)": the label Compass cites with every figure. */
export function rangeLabel(range: ResultsRange): string {
  const base = range.key === "custom" ? "Custom dates" : RESULTS_RANGE_LABELS[range.key];
  return range.fromDate === range.toDate ? `${base} (${range.fromDate})` : `${base} (${range.fromDate} to ${range.toDate})`;
}

/** Results with the same range, for "show more" and "check it on Results". */
export function resultsHref(range: ResultsRange, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams({ ...range.params, ...extra });
  return `/app/results?${search.toString()}`;
}

export function drillHref(metric: string, range: ResultsRange, filters: Record<string, string> = {}): string {
  const search = new URLSearchParams({ metric, ...range.params, ...filters });
  return `/app/results/leads?${search.toString()}`;
}
