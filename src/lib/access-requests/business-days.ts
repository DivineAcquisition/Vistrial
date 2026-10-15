/** Weekdays from the day after `from` through `now`, in the given time zone. */
export function businessDaysSince(fromIso: string, now: Date, timeZone: string): number {
  const start = zoneDay(new Date(fromIso), timeZone);
  const end = zoneDay(now, timeZone);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  let days = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= end.getTime() && days < 400) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function zoneDay(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isStale(fromIso: string, now: Date, businessDays: number, timeZone: string): boolean {
  return businessDaysSince(fromIso, now, timeZone) >= businessDays;
}
