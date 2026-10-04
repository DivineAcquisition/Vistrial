/**
 * Every number the Sales OS states goes through here, so the sample behind it
 * travels with it and a thin sample is refused rather than caveated.
 */

/** Rates (conversion, show, coverage) need this many in the denominator. Matches the leak report. */
export const MIN_SAMPLE_RATE = 20;
/** A pattern across calls or objections needs at least this many. Six calls is a pattern; it says so. */
export const MIN_SAMPLE_PATTERN = 5;
/** Comparing two groups needs this many in each. */
export const MIN_SAMPLE_PER_GROUP = 20;

export type Rate = {
  k: number;
  n: number;
  /** Null when n is under the minimum. Never a number from a thin sample. */
  pct: number | null;
  enough: boolean;
  sample: string;
};

export function sampleLabel(n: number, noun: string, plural = `${noun}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? noun : plural}`;
}

export function rate(k: number, n: number, noun: string, min = MIN_SAMPLE_RATE, plural?: string): Rate {
  const enough = n >= min;
  return {
    k,
    n,
    pct: enough && n > 0 ? Math.round((k / n) * 1000) / 10 : null,
    enough,
    sample: sampleLabel(n, noun, plural),
  };
}

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "unknown";
  if (seconds < 90) return `${Math.round(seconds)} sec`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 36) return `${Math.round(hours * 10) / 10} hr`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

export function describeRate(r: Rate, what: string): string {
  if (!r.enough) {
    return `Not enough data to give a rate for ${what}: ${r.sample}, and a rate needs at least ${MIN_SAMPLE_RATE}.`;
  }
  return `${r.pct}% ${what} (${r.k} of ${r.sample}).`;
}

export type Insufficient = {
  enough: false;
  have: number;
  need: number;
  what: string;
  message: string;
};

export function insufficient(have: number, need: number, what: string): Insufficient {
  return {
    enough: false,
    have,
    need,
    what,
    message: `Not enough ${what} yet to see a pattern: ${have} so far, and Vistrial needs at least ${need} before it says anything.`,
  };
}

/** Change between two counts, with the counts kept next to it. Percent only when the base is big enough. */
export function change(current: number, previous: number, noun: string, plural?: string) {
  const delta = current - previous;
  const pct = previous >= MIN_SAMPLE_RATE ? Math.round((delta / previous) * 1000) / 10 : null;
  return {
    current,
    previous,
    delta,
    pct,
    sentence:
      pct === null
        ? `${sampleLabel(current, noun, plural)} this period against ${sampleLabel(previous, noun, plural)} the period before.`
        : `${sampleLabel(current, noun, plural)} against ${sampleLabel(previous, noun, plural)} (${pct > 0 ? "+" : ""}${pct}%).`,
  };
}
