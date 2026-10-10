import { localDate, zonedStartOfDay, type PeriodRange } from "@/lib/home/periods";

/**
 * Results ranges, resolved in the workspace's time zone. The comparison is
 * always the stretch of the same length just before, so a 7-day range is
 * never measured against a month.
 */

export const RESULTS_RANGE_KEYS = ["last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "custom"] as const;
export type ResultsRangeKey = (typeof RESULTS_RANGE_KEYS)[number];

export const RESULTS_RANGE_LABELS: Record<ResultsRangeKey, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom dates",
};

/** A range longer than this is refused, so one page never scans years of rows. */
export const MAX_RANGE_DAYS = 400;

export type ResultsRange = PeriodRange & {
  key: ResultsRangeKey;
  label: string;
  previous: PeriodRange;
  /** Search params that reproduce this range. */
  params: Record<string, string>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 1970, month ?? 1, day ?? 1];
}

function build(from: Date, to: Date, timeZone: string): PeriodRange {
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    fromDate: localDate(from, timeZone),
    toDate: localDate(new Date(to.getTime() - 1), timeZone),
  };
}

function before(range: { from: Date; to: Date }, timeZone: string): PeriodRange {
  const length = range.to.getTime() - range.from.getTime();
  return build(new Date(range.from.getTime() - length), range.from, timeZone);
}

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function isValidDateInput(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = parts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function resolveResultsRange(
  input: { range?: string | null; from?: string | null; to?: string | null },
  args: { now?: Date; timeZone?: string | null } = {}
): ResultsRange {
  const now = args.now ?? new Date();
  const timeZone = safeZone(args.timeZone);
  const today = parts(localDate(now, timeZone));
  const key = (RESULTS_RANGE_KEYS as readonly string[]).includes(input.range ?? "")
    ? (input.range as ResultsRangeKey)
    : "last_30_days";

  const startOf = (year: number, month: number, day: number) => zonedStartOfDay(timeZone, year, month, day);
  const tomorrow = startOf(today[0], today[1], today[2] + 1);

  let from: Date;
  let to: Date = now;
  let previous: PeriodRange;

  if (key === "custom" && isValidDateInput(input.from) && isValidDateInput(input.to)) {
    let [a, b] = [input.from, input.to].sort();
    const [fy, fm, fd] = parts(a!);
    from = startOf(fy, fm, fd);
    const [ty, tm, td] = parts(b!);
    to = startOf(ty, tm, td + 1);
    if (to.getTime() > tomorrow.getTime()) to = tomorrow;
    if (to.getTime() <= from.getTime()) to = startOf(fy, fm, fd + 1);
    const maxTo = startOf(fy, fm, fd + MAX_RANGE_DAYS);
    if (to.getTime() > maxTo.getTime()) to = maxTo;
    a = localDate(from, timeZone);
    b = localDate(new Date(to.getTime() - 1), timeZone);
    return {
      key,
      label: `${a} to ${b}`,
      ...build(from, to, timeZone),
      previous: before({ from, to }, timeZone),
      params: { range: "custom", from: a, to: b },
    };
  }

  const resolvedKey: ResultsRangeKey = key === "custom" ? "last_30_days" : key;
  if (resolvedKey === "last_7_days" || resolvedKey === "last_30_days" || resolvedKey === "last_90_days") {
    const days = resolvedKey === "last_7_days" ? 7 : resolvedKey === "last_30_days" ? 30 : 90;
    from = startOf(today[0], today[1], today[2] - (days - 1));
    previous = before({ from, to }, timeZone);
  } else if (resolvedKey === "this_month") {
    from = startOf(today[0], today[1], 1);
    const lastMonthStart = startOf(today[0], today[1] - 1, 1);
    const lastMonthTo = new Date(Math.min(lastMonthStart.getTime() + (now.getTime() - from.getTime()), from.getTime()));
    previous = build(lastMonthStart, lastMonthTo, timeZone);
  } else {
    from = startOf(today[0], today[1] - 1, 1);
    to = startOf(today[0], today[1], 1);
    previous = build(startOf(today[0], today[1] - 2, 1), from, timeZone);
  }

  return {
    key: resolvedKey,
    label: RESULTS_RANGE_LABELS[resolvedKey],
    ...build(from, to, timeZone),
    previous,
    params: { range: resolvedKey },
  };
}

export type ResultsFilters = {
  source?: string;
  stage?: string;
  person?: string;
  field?: string;
  fieldValue?: string;
};

const FILTER_KEY = /^[\w .:@()&/+-]{1,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && FILTER_KEY.test(trimmed) ? trimmed : undefined;
}

export function parseResultsFilters(input: Record<string, string | string[] | undefined>): ResultsFilters {
  const one = (key: string) => {
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const person = clean(one("person"));
  const field = clean(one("field"));
  const fieldValue = field ? clean(one("value")) : undefined;
  return {
    source: clean(one("source")),
    stage: clean(one("stage")),
    person: person && (person === "unassigned" || UUID.test(person)) ? person : undefined,
    field: field && fieldValue ? field : undefined,
    fieldValue: field && fieldValue ? fieldValue : undefined,
  };
}

/** The jsonb the SQL functions take. */
export function filtersToJson(filters: ResultsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.source) out.source = filters.source;
  if (filters.stage) out.stage = filters.stage;
  if (filters.person) out.person = filters.person;
  if (filters.field && filters.fieldValue) {
    out.field = filters.field;
    out.field_value = filters.fieldValue;
  }
  return out;
}

export function filtersToParams(filters: ResultsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.source) out.source = filters.source;
  if (filters.stage) out.stage = filters.stage;
  if (filters.person) out.person = filters.person;
  if (filters.field && filters.fieldValue) {
    out.field = filters.field;
    out.value = filters.fieldValue;
  }
  return out;
}

export function hasFilters(filters: ResultsFilters): boolean {
  return Object.keys(filtersToJson(filters)).length > 0;
}

export function queryString(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
