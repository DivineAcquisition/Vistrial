/**
 * Calendar-day gaps in an IANA timezone. Used by the ghost detector so a
 * threshold of 14 days is fourteen local dates, not a UTC wall-clock span.
 */

function ymdInZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not read a calendar date in ${timeZone}.`);
  }
  return `${year}-${month}-${day}`;
}

function utcNoon(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00.000Z`);
}

export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  const start = utcNoon(ymdInZone(from, timeZone));
  const end = utcNoon(ymdInZone(to, timeZone));
  return Math.round((end - start) / 86_400_000);
}
