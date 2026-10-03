/** The UTC instants that bound one calendar day in a workspace's time zone. */

export type DayRange = { from: string; to: string; label: string; timeZone: string } | { label: "Most recent" };

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. Positive when the zone is ahead of UTC. */
export function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  let hour = read("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), hour, read("minute"), read("second"));
  return asUtc - instant.getTime();
}

function startOfZonedDay(day: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  const utcMidnight = new Date(Date.UTC(year, month - 1, date));
  if (utcMidnight.getUTCMonth() !== month - 1) return null;
  try {
    const first = new Date(utcMidnight.getTime() - timeZoneOffsetMs(timeZone, utcMidnight));
    return new Date(utcMidnight.getTime() - timeZoneOffsetMs(timeZone, first));
  } catch {
    return null;
  }
}

export function dayRange(day: string | undefined, timeZone: string): DayRange {
  if (!day) return { label: "Most recent" };
  const start = startOfZonedDay(day, timeZone);
  if (!start) return { label: "Most recent" };
  const end = new Date(start.getTime() + 86_400_000);
  const [year, month, date] = day.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return { from: start.toISOString(), to: end.toISOString(), label, timeZone };
}

export function happenedDuring(iso: string | null, range: DayRange): boolean {
  if (!("from" in range)) return true;
  if (!iso) return false;
  return iso >= range.from && iso < range.to;
}

export function formatZoned(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}
