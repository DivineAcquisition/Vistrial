/**
 * Which week a day belongs to, according to the base rather than the calendar.
 *
 * The DA base's Weekly Summary rows start on a Tuesday. Whether that is a
 * deliberate reporting week or an accident of when the first row was typed,
 * imposing Monday on it would create a second, competing set of week rows
 * beside the ones a person already maintains. So the cadence is read from the
 * rows that exist: whatever day they start on, that is the week start, and new
 * rows continue the sequence.
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

/** Monday of the week containing `date`. Only used when the base has no rows. */
export function mondayOf(date: string): string {
  const day = toDayNumber(date);
  // Day 0 of the epoch was a Thursday, so Monday is 4 days later mod 7.
  const weekday = (((day - 4) % 7) + 7) % 7;
  return fromDayNumber(day - weekday);
}

export type WeekCadence = {
  /** The date every week boundary is measured from. */
  anchor: string;
  /** The week start for the week containing this date. */
  weekStartFor: (date: string) => string;
};

/**
 * Anchors on the earliest week already recorded, so a sync never invents a
 * week boundary that disagrees with the rows underneath it.
 */
export function weekCadence(existingStarts: string[], today: string): WeekCadence {
  const valid = existingStarts.filter((start) => /^\d{4}-\d{2}-\d{2}$/.test(start)).sort();
  const anchor = valid[0] ?? mondayOf(today);
  const anchorDay = toDayNumber(anchor);

  return {
    anchor,
    weekStartFor(date: string) {
      const offset = toDayNumber(date) - anchorDay;
      return fromDayNumber(anchorDay + Math.floor(offset / 7) * 7);
    },
  };
}

/** Every week start from the week containing `from` up to the one containing `to`. */
export function weekStartsBetween(
  cadence: WeekCadence,
  from: string,
  to: string,
  maxWeeks: number
): string[] {
  const first = toDayNumber(cadence.weekStartFor(from));
  const last = toDayNumber(cadence.weekStartFor(to));
  const all: string[] = [];
  for (let day = first; day <= last; day += 7) all.push(fromDayNumber(day));
  // A sync that has been down for months catches up on the most recent weeks
  // rather than grinding through the oldest and timing out before today.
  return all.length <= maxWeeks ? all : all.slice(all.length - maxWeeks);
}

/** Matches the `Week of 8/25` convention the base's own field description gives. */
export function weekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split("-");
  return `Week of ${Number(month)}/${Number(day)}`;
}

export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}
