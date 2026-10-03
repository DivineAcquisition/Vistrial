/**
 * One cell on a Forsight page, and why it is not always a number.
 *
 * A computed cost or ratio has four states, and they mean different things:
 *
 *   175              a number, already rounded
 *   "No audits yet"  a true statement about a young funnel, worth showing
 *   absent           there is nothing to say at all
 *   unavailable      this workspace has no way to know
 *
 * "No closes yet" means money went out and nothing came back; absent means
 * nothing to say; unavailable means a workspace with no ad account does not
 * have a blank cost per audit held, it has no way to compute one. Collapsing
 * any of these into the others turns a real signal into a shrug.
 */

export type MetricValue =
  | { kind: "number"; value: number; raw: string }
  | { kind: "text"; text: string }
  | { kind: "absent" }
  | { kind: "unavailable"; reason: string };

export const ABSENT: MetricValue = { kind: "absent" };

export function unavailable(reason: string): MetricValue {
  return { kind: "unavailable", reason };
}

/**
 * Numbers and the strings that stand in for them both arrive here. Currency
 * symbols and thousands separators are tolerated, because a figure arriving
 * pre-formatted is not anyone's idea of a breaking change.
 */
export function toMetricValue(raw: unknown): MetricValue {
  if (raw === null || raw === undefined) return ABSENT;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { kind: "number", value: raw, raw: String(raw) } : ABSENT;
  }

  if (typeof raw !== "string") return ABSENT;

  const trimmed = raw.trim();
  if (!trimmed) return ABSENT;

  const numeric = Number(trimmed.replace(/[$,\s]/g, "").replace(/%$/, ""));
  if (trimmed !== "-" && Number.isFinite(numeric)) {
    return { kind: "number", value: numeric, raw: trimmed };
  }

  return { kind: "text", text: trimmed };
}

export function isNumber(
  value: MetricValue
): value is { kind: "number"; value: number; raw: string } {
  return value.kind === "number";
}

/* ---------------------------------------------------------------------------
 * Formatting. Presentation only — no value is changed, just written down.
 * ------------------------------------------------------------------------- */

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function decimals(value: number, max = 2): string {
  return trimZeros(value.toFixed(max));
}

export type MetricFormat = "currency" | "number" | "percent" | "ratio";

export function formatNumber(value: number, format: MetricFormat): string {
  switch (format) {
    case "currency": {
      // Whole dollars stay whole; anything with cents shows both of them, so
      // "17.5" out of a formula does not read as $17.5.
      const places = Number.isInteger(value) ? 0 : 2;
      return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: places,
        maximumFractionDigits: places,
      })}`;
    }
    case "percent":
      return `${decimals(value)}%`;
    case "ratio":
      return `${decimals(value)}×`;
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

/** The one place a metric turns into something a person reads. */
export function formatMetric(
  value: MetricValue,
  format: MetricFormat = "number",
  absent = "—"
): string {
  if (value.kind === "number") return formatNumber(value.value, format);
  if (value.kind === "text") return value.text;
  if (value.kind === "unavailable") return "Unavailable";
  return absent;
}

/** Why a figure is missing, when there is a reason worth reading. */
export function metricReason(value: MetricValue): string | null {
  return value.kind === "unavailable" ? value.reason : null;
}

/* ---------------------------------------------------------------------------
 * Sorting
 * ------------------------------------------------------------------------- */

/**
 * Ascending, with the states that are not numbers kept underneath. A creative
 * with no audits yet is not a creative with a cost of zero, and sorting it to
 * the top would put the worst-understood ad in the best-performer slot.
 */
export function compareMetricAscending(a: MetricValue, b: MetricValue): number {
  const rank = (value: MetricValue) =>
    value.kind === "number" ? 0 : value.kind === "text" ? 1 : value.kind === "absent" ? 2 : 3;
  const difference = rank(a) - rank(b);
  if (difference !== 0) return difference;
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  if (a.kind === "text" && b.kind === "text") return a.text.localeCompare(b.text);
  return 0;
}

/* ---------------------------------------------------------------------------
 * Week over week
 * ------------------------------------------------------------------------- */

export type MetricDirection = "up" | "down" | "flat";

/**
 * Which way is the good way. Cost falling is good and ROAS rising is good, but
 * spend has no good direction: it is the budget somebody chose, not a result.
 * Colouring a rise in spend green would congratulate the reader for it.
 */
export type MetricSense = "lower" | "higher" | "neither";

export type MetricMovement = {
  direction: MetricDirection;
  /** Already formatted, e.g. "$12" or "0.4×". */
  amount: string;
  /** Undefined when the metric has no good direction. */
  isGood: boolean | undefined;
};

/**
 * A direction is only honest when both weeks are numbers. "No closes yet"
 * against "$700" is not an improvement or a decline, so it gets no arrow.
 */
export function movement(
  current: MetricValue,
  previous: MetricValue,
  args: { format: MetricFormat; better: MetricSense }
): MetricMovement | null {
  if (!isNumber(current) || !isNumber(previous)) return null;

  const delta = current.value - previous.value;
  if (delta === 0) {
    return { direction: "flat", amount: formatNumber(0, args.format), isGood: undefined };
  }

  return {
    direction: delta > 0 ? "up" : "down",
    amount: formatNumber(Math.abs(delta), args.format),
    isGood: args.better === "neither" ? undefined : args.better === "lower" ? delta < 0 : delta > 0,
  };
}
