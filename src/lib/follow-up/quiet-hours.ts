function zonedParts(at: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/** Quiet hours are locked to 8 pm to 8 am, so an unreadable time falls back to those. */
const QUIET_START = { hour: 20, minute: 0 };
const QUIET_END = { hour: 8, minute: 0 };

function parseHm(value: string, fallback: { hour: number; minute: number }): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : fallback;
}

function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function offsetMinutes(at: Date, timeZone: string): number {
  const parts = zonedParts(at, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - at.getTime()) / 60000);
}

function zonedDate(timeZone: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = offsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

export function isInQuietHours(
  at: Date,
  timeZone: string,
  startHm: string,
  endHm: string
): boolean {
  const parts = zonedParts(at, timeZone);
  const now = minutesOfDay(parts.hour, parts.minute);
  const start = parseHm(startHm, QUIET_START);
  const end = parseHm(endHm, QUIET_END);
  const startMin = minutesOfDay(start.hour, start.minute);
  const endMin = minutesOfDay(end.hour, end.minute);
  if (startMin === endMin) return false;
  if (startMin < endMin) return now >= startMin && now < endMin;
  return now >= startMin || now < endMin;
}

/** The first moment at or after `at` when the clock in `timeZone` reads `hm` (for example "09:00"). */
export function nextLocalTime(at: Date, timeZone: string, hm: string): Date {
  const parts = zonedParts(at, timeZone);
  const target = parseHm(hm, QUIET_END);
  const today = zonedDate(timeZone, parts.year, parts.month, parts.day, target.hour, target.minute);
  if (today.getTime() >= at.getTime()) return today;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return zonedDate(timeZone, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), target.hour, target.minute);
}

/** The later of the requested time and the time quiet hours allow. */
export function scheduleOutsideQuiet(desired: Date, quietUntilIso: string | null): Date {
  if (!quietUntilIso) return desired;
  const quietUntil = new Date(quietUntilIso);
  if (Number.isNaN(quietUntil.getTime())) return desired;
  return quietUntil.getTime() > desired.getTime() ? quietUntil : desired;
}

/** If `at` falls in quiet hours, return the next local end; otherwise `at`. */
export function computeSendAt(args: {
  now: Date;
  timeZone: string;
  enabled: boolean;
  startHm: string;
  endHm: string;
}): Date {
  if (!args.enabled) return args.now;
  if (!isInQuietHours(args.now, args.timeZone, args.startHm, args.endHm)) return args.now;

  const parts = zonedParts(args.now, args.timeZone);
  const end = parseHm(args.endHm, QUIET_END);
  const start = parseHm(args.startHm, QUIET_START);
  const nowMin = minutesOfDay(parts.hour, parts.minute);
  const startMin = minutesOfDay(start.hour, start.minute);
  const wraps = startMin > minutesOfDay(end.hour, end.minute);

  let year = parts.year;
  let month = parts.month;
  let day = parts.day;
  if (wraps && nowMin >= startMin) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return zonedDate(args.timeZone, year, month, day, end.hour, end.minute);
}
