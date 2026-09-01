/**
 * Forsight displays what Airtable computes. It never divides.
 *
 * Every computed cost and ratio field in the base is a formula whose result
 * type is single-line text, and each one has three possible states:
 *
 *   "175"            a number, as text, already rounded by the formula
 *   "No audits yet"  a true statement about a young funnel, worth showing
 *   omitted          the formula returned "", and Airtable drops empty fields
 *                    from the API payload entirely
 *
 * The third state is not the second. "No closes yet" means money went out and
 * nothing came back; an absent value means there is nothing to say at all.
 * Collapsing them would turn a real signal into a shrug.
 */

export type MetricValue =
  | { kind: "number"; value: number; raw: string }
  | { kind: "text"; text: string }
  | { kind: "absent" };

export const ABSENT: MetricValue = { kind: "absent" };

/**
 * Airtable hands back numbers for number and currency fields and strings for
 * formula fields, so both arrive here. Currency symbols and thousands
 * separators are tolerated because a formula could be rewritten to include
 * them without that being anyone's idea of a breaking change.
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
  return absent;
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
  const rank = (value: MetricValue) => (value.kind === "number" ? 0 : value.kind === "text" ? 1 : 2);
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
