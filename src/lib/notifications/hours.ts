import {
  DEFAULT_WORKING_DAYS,
  DEFAULT_WORKING_HOURS_END,
  DEFAULT_WORKING_HOURS_START,
} from "@/lib/notifications/constants";
import type { WorkingHours } from "@/lib/notifications/types";

function zonedParts(at: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
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
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const weekdayLabel = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    weekday: weekdayMap[weekdayLabel] ?? 1,
  };
}

function parseHm(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? hour : 8,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function offsetMinutes(at: Date, timeZone: string): number {
  const parts = zonedParts(at, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - at.getTime()) / 60000);
}

function zonedDate(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = offsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}

export function resolveWorkingHours(input: {
  orgTimeZone: string;
  orgStart?: string | null;
  orgEnd?: string | null;
  orgDays?: number[] | null;
  memberTimeZone?: string | null;
  memberStart?: string | null;
  memberEnd?: string | null;
  memberDays?: number[] | null;
}): WorkingHours {
  return {
    timeZone: input.memberTimeZone || input.orgTimeZone || "UTC",
    startHm: input.memberStart || input.orgStart || DEFAULT_WORKING_HOURS_START,
    endHm: input.memberEnd || input.orgEnd || DEFAULT_WORKING_HOURS_END,
    days: (input.memberDays && input.memberDays.length > 0
      ? input.memberDays
      : input.orgDays && input.orgDays.length > 0
        ? input.orgDays
        : [...DEFAULT_WORKING_DAYS]) as number[],
  };
}

export function isWithinWorkingHours(at: Date, hours: WorkingHours): boolean {
  const parts = zonedParts(at, hours.timeZone);
  if (!hours.days.includes(parts.weekday)) return false;
  const now = minutesOfDay(parts.hour, parts.minute);
  const start = parseHm(hours.startHm);
  const end = parseHm(hours.endHm);
  const startMin = minutesOfDay(start.hour, start.minute);
  const endMin = minutesOfDay(end.hour, end.minute);
  if (startMin === endMin) return true;
  if (startMin < endMin) return now >= startMin && now < endMin;
  return now >= startMin || now < endMin;
}

/** Next local working-hours start, including later today if still before start. */
export function nextWorkingStart(at: Date, hours: WorkingHours): Date {
  if (isWithinWorkingHours(at, hours)) return at;
  const start = parseHm(hours.startHm);
  const base = zonedParts(at, hours.timeZone);
  const localNoon = zonedDate(hours.timeZone, base.year, base.month, base.day, 12, 0);
  for (let add = 0; add < 14; add += 1) {
    const shifted = new Date(localNoon.getTime() + add * 24 * 60 * 60 * 1000);
    const day = zonedParts(shifted, hours.timeZone);
    if (!hours.days.includes(day.weekday)) continue;
    const candidate = zonedDate(hours.timeZone, day.year, day.month, day.day, start.hour, start.minute);
    if (candidate.getTime() >= at.getTime()) return candidate;
  }
  return new Date(at.getTime() + 24 * 60 * 60 * 1000);
}

export function localDateKey(at: Date, timeZone: string): string {
  const parts = zonedParts(at, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function minutesIntoWorkingDay(at: Date, hours: WorkingHours): number | null {
  if (!isWithinWorkingHours(at, hours)) return null;
  const parts = zonedParts(at, hours.timeZone);
  const start = parseHm(hours.startHm);
  return minutesOfDay(parts.hour, parts.minute) - minutesOfDay(start.hour, start.minute);
}

function overlapMinutes(
  rangeStart: number,
  rangeEnd: number,
  windowStart: number,
  windowEnd: number
): number {
  const start = Math.max(rangeStart, windowStart);
  const end = Math.min(rangeEnd, windowEnd);
  return Math.max(0, end - start);
}

/**
 * Minutes that fell inside org business hours between `from` and `to`.
 * Nights and off days do not count toward response time.
 */
export function elapsedWorkingMinutes(from: Date, to: Date, hours: WorkingHours): number {
  if (to.getTime() <= from.getTime()) return 0;
  const startHm = parseHm(hours.startHm);
  const endHm = parseHm(hours.endHm);
  const windowStart = minutesOfDay(startHm.hour, startHm.minute);
  const windowEnd = minutesOfDay(endHm.hour, endHm.minute);
  const wraps = windowStart > windowEnd;
  const startParts = zonedParts(from, hours.timeZone);
  const localNoon = zonedDate(hours.timeZone, startParts.year, startParts.month, startParts.day, 12, 0);
  let total = 0;
  for (let add = 0; add < 40; add += 1) {
    const shifted = new Date(localNoon.getTime() + add * 24 * 60 * 60 * 1000);
    const day = zonedParts(shifted, hours.timeZone);
    const dayStart = zonedDate(hours.timeZone, day.year, day.month, day.day, 0, 0);
    const nextStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    if (nextStart.getTime() <= from.getTime()) continue;
    if (dayStart.getTime() >= to.getTime()) break;
    if (!hours.days.includes(day.weekday)) continue;

    const clipFrom = Math.max(from.getTime(), dayStart.getTime());
    const clipTo = Math.min(to.getTime(), nextStart.getTime());
    const fromMin = Math.floor((clipFrom - dayStart.getTime()) / 60000);
    const toMin = Math.ceil((clipTo - dayStart.getTime()) / 60000);

    if (windowStart === windowEnd) {
      total += Math.max(0, toMin - fromMin);
      continue;
    }
    if (!wraps) {
      total += overlapMinutes(fromMin, toMin, windowStart, windowEnd);
      continue;
    }
    total += overlapMinutes(fromMin, toMin, windowStart, 24 * 60);
    total += overlapMinutes(fromMin, toMin, 0, windowEnd);
  }
  return total;
}
