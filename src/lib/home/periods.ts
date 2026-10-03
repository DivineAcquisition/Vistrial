/**
 * The periods the home screen offers, resolved in the workspace's time zone.
 *
 * Every period has a previous period of the same length, which is what the
 * "up 3 from last week" line compares against. A period that is still running
 * is compared against the same stretch of the one before it: this week so far
 * against last week up to the same weekday and hour, this month so far against
 * the same days of last month. A Tuesday is never measured against a full week.
 */

export const HOME_PERIOD_KEYS = ["this_week", "last_week", "last_30_days", "this_month"] as const;
export type HomePeriodKey = (typeof HOME_PERIOD_KEYS)[number];

export const DEFAULT_HOME_PERIOD: HomePeriodKey = "this_week";

export const HOME_PERIOD_LABELS: Record<HomePeriodKey, string> = {
  this_week: "This week",
  last_week: "Last week",
  last_30_days: "Last 30 days",
  this_month: "This month",
};

export type PeriodRange = {
  /** Inclusive, ISO instant. */
  from: string;
  /** Exclusive, ISO instant. */
  to: string;
  /** Local calendar dates covered, inclusive. Ad spend is stored by day. */
  fromDate: string;
  toDate: string;
};

export type HomePeriod = PeriodRange & {
  key: HomePeriodKey;
  label: string;
  /** "from last week", for the comparison line. */
  comparisonLabel: string;
  previous: PeriodRange;
};

export function isHomePeriodKey(value: unknown): value is HomePeriodKey {
  return typeof value === "string" && (HOME_PERIOD_KEYS as readonly string[]).includes(value);
}

export function parseHomePeriodKey(value: unknown): HomePeriodKey {
  return isHomePeriodKey(value) ? value : DEFAULT_HOME_PERIOD;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    weekday: WEEKDAYS[read("weekday")] ?? 1,
  };
}

/** The instant a local calendar date starts in `timeZone`. */
export function zonedStartOfDay(timeZone: string, year: number, month: number, day: number): Date {
  // Normalise overflow (day 0, day 32) through UTC first.
  const civil = new Date(Date.UTC(year, month - 1, day));
  const guess = Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate());
  // Two passes settle the offset on DST transition days.
  let instant = guess;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = localParts(new Date(instant), timeZone);
    const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    instant = instant - (asUtc - guess);
  }
  return new Date(instant);
}

export function localDate(at: Date, timeZone: string): string {
  const parts = localParts(at, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function range(from: Date, to: Date, timeZone: string): PeriodRange {
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    fromDate: localDate(from, timeZone),
    // `to` is exclusive, so the last covered day is the one just before it.
    toDate: localDate(new Date(to.getTime() - 1), timeZone),
  };
}

function precedingRange(from: Date, to: Date, timeZone: string): PeriodRange {
  const length = to.getTime() - from.getTime();
  return range(new Date(from.getTime() - length), from, timeZone);
}

export function resolveHomePeriod(
  key: HomePeriodKey,
  args: { now?: Date; timeZone?: string | null } = {}
): HomePeriod {
  const now = args.now ?? new Date();
  const timeZone = safeTimeZone(args.timeZone);
  const today = localParts(now, timeZone);
  const mondayOffset = today.weekday - 1;
  const startOfWeek = zonedStartOfDay(timeZone, today.year, today.month, today.day - mondayOffset);
  const lastWeekStart = zonedStartOfDay(timeZone, today.year, today.month, today.day - mondayOffset - 7);

  if (key === "last_week") {
    const weekBefore = zonedStartOfDay(timeZone, today.year, today.month, today.day - mondayOffset - 14);
    return {
      key,
      label: HOME_PERIOD_LABELS[key],
      comparisonLabel: "from the week before",
      ...range(lastWeekStart, startOfWeek, timeZone),
      previous: range(weekBefore, lastWeekStart, timeZone),
    };
  }

  if (key === "last_30_days") {
    const from = zonedStartOfDay(timeZone, today.year, today.month, today.day - 29);
    return {
      key,
      label: HOME_PERIOD_LABELS[key],
      comparisonLabel: "from the 30 days before",
      ...range(from, now, timeZone),
      previous: precedingRange(from, now, timeZone),
    };
  }

  if (key === "this_month") {
    const from = zonedStartOfDay(timeZone, today.year, today.month, 1);
    const lastMonthStart = zonedStartOfDay(timeZone, today.year, today.month - 1, 1);
    const length = now.getTime() - from.getTime();
    // Never run past the start of this month when last month was shorter.
    const lastMonthTo = new Date(Math.min(lastMonthStart.getTime() + length, from.getTime()));
    return {
      key,
      label: HOME_PERIOD_LABELS[key],
      comparisonLabel: "from the same days last month",
      ...range(from, now, timeZone),
      previous: range(lastMonthStart, lastMonthTo, timeZone),
    };
  }

  return {
    key: "this_week",
    label: HOME_PERIOD_LABELS.this_week,
    comparisonLabel: "from last week",
    ...range(startOfWeek, now, timeZone),
    // The same stretch of last week: Monday to this weekday and hour.
    previous: range(lastWeekStart, new Date(lastWeekStart.getTime() + (now.getTime() - startOfWeek.getTime())), timeZone),
  };
}

export function inRange(iso: string | null | undefined, period: Pick<PeriodRange, "from" | "to">): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= Date.parse(period.from) && at < Date.parse(period.to);
}

/** "Sep 29 – Oct 2", for the hero card. */
export function describeRange(period: PeriodRange): string {
  const fmt = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return period.fromDate === period.toDate ? fmt(period.fromDate) : `${fmt(period.fromDate)} – ${fmt(period.toDate)}`;
}
