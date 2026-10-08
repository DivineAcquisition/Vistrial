import { zonedStartOfDay } from "@/lib/home/periods";

type Interval = { start: string; end: string };

export type BusinessHours = {
  days: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Interval[]>>;
  closures?: Array<{ date: string }>;
};

export type AfterHoursMode = "pause" | "keep_running" | "separate_window";

type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

function minutesOf(hm: string): number {
  const [hour, minute] = hm.split(":").map(Number);
  return hour * 60 + minute;
}

function localDay(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: read("weekday").toLowerCase().slice(0, 3) as WeekdayKey,
  };
}

/** The open intervals of one local calendar day, as instants. */
function openIntervals(hours: BusinessHours, timeZone: string, year: number, month: number, day: number): Array<[number, number]> {
  const midnight = zonedStartOfDay(timeZone, year, month, day);
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (hours.closures?.some((closure) => closure.date === iso)) return [];
  const weekday = localDay(new Date(midnight.getTime() + 12 * 3_600_000), timeZone).weekday;
  return (hours.days[weekday] ?? []).map((interval) => [
    midnight.getTime() + minutesOf(interval.start) * 60_000,
    midnight.getTime() + minutesOf(interval.end) * 60_000,
  ]);
}

/** Minutes the business was open between two instants. Looks at most 60 days ahead. */
export function businessMinutesBetween(from: Date, to: Date, hours: BusinessHours, timeZone: string): number {
  if (to.getTime() <= from.getTime()) return 0;
  const first = localDay(from, timeZone);
  let total = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const civil = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
    const dayStart = zonedStartOfDay(timeZone, civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate());
    if (dayStart.getTime() >= to.getTime()) break;
    for (const [open, close] of openIntervals(hours, timeZone, civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate())) {
      const start = Math.max(open, from.getTime());
      const end = Math.min(close, to.getTime());
      if (end > start) total += (end - start) / 60_000;
    }
  }
  return Math.floor(total);
}

/** Whether the business is open at an instant. */
export function isOpenAt(at: Date, hours: BusinessHours, timeZone: string): boolean {
  const today = localDay(at, timeZone);
  return openIntervals(hours, timeZone, today.year, today.month, today.day).some(
    ([open, close]) => at.getTime() >= open && at.getTime() < close
  );
}

/**
 * How far through its first-touch window a lead is, in windows (1 = the
 * window has just run out). The clock either keeps running, counts only open
 * hours, or gives leads that arrive after hours a longer window.
 */
export function windowsElapsed(args: {
  arrivedAt: Date;
  now: Date;
  mode: AfterHoursMode;
  windowMinutes: number;
  afterHoursWindowMinutes: number;
  hours: BusinessHours;
  timeZone: string;
}): { windows: number; minutes: number } {
  const wall = (args.now.getTime() - args.arrivedAt.getTime()) / 60_000;
  if (args.mode === "pause") {
    const open = businessMinutesBetween(args.arrivedAt, args.now, args.hours, args.timeZone);
    return { windows: open / args.windowMinutes, minutes: open };
  }
  if (args.mode === "separate_window" && !isOpenAt(args.arrivedAt, args.hours, args.timeZone)) {
    return { windows: wall / args.afterHoursWindowMinutes, minutes: Math.round(wall) };
  }
  return { windows: wall / args.windowMinutes, minutes: Math.round(wall) };
}
