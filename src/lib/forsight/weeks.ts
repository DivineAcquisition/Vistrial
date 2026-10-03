/**
 * Which week a day belongs to.
 *
 * Weeks run Monday to Sunday. Every date here is an ISO day string in UTC, so
 * a week boundary never moves because the reader is in another timezone.
 */

const DAY_MS = 86_400_000;

export function toDayNumber(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`Not a date: ${date}`);
  return Math.floor(parsed / DAY_MS);
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Monday of the week containing `date`. */
export function weekStartFor(date: string): string {
  const day = toDayNumber(date);
  // Day 0 of the epoch was a Thursday, so Monday is 4 days later mod 7.
  const weekday = (((day - 4) % 7) + 7) % 7;
  return fromDayNumber(day - weekday);
}

export function weekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split("-");
  return `Week of ${Number(month)}/${Number(day)}`;
}

export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}
