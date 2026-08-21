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

function parseHm(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? hour : 21,
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
  const start = parseHm(startHm);
  const end = parseHm(endHm);
  const startMin = minutesOfDay(start.hour, start.minute);
  const endMin = minutesOfDay(end.hour, end.minute);
  if (startMin === endMin) return false;
  if (startMin < endMin) return now >= startMin && now < endMin;
  return now >= startMin || now < endMin;
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
  const end = parseHm(args.endHm);
  const start = parseHm(args.startHm);
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
