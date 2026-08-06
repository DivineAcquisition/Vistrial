/**
 * Cycle arithmetic.
 *
 * The cycle anchors to the client's activation date rather than to the
 * calendar, so a client activated on the ninth on a fourteen day cycle closes
 * on the twenty-third and the sixth thereafter. Every date here is a plain
 * `yyyy-mm-dd` in UTC: a billing period is a run of days, not an instant, and
 * treating it as an instant is how periods end up overlapping.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type Day = string;

export type CyclePeriod = { start: Day; end: Day };

export function today(now: Date | number = Date.now()): Day {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(day: Day, days: number): Day {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The latest close that has already passed, or null when the cycle is not due.
 *
 * A job that has not run for a fortnight closes one period covering the whole
 * gap rather than a run of empty charges: appointments carry forward until
 * their window elapses, so the missed closes have nothing of their own to bill.
 */
export function dueClose(
  nextClose: Day | null,
  cycleDays: number,
  on: Day
): Day | null {
  if (nextClose === null || nextClose > on) return null;

  let close = nextClose;
  while (addDays(close, cycleDays) <= on) {
    close = addDays(close, cycleDays);
  }

  return close;
}

/** The next close strictly after the one just completed. */
export function advanceClose(close: Day, cycleDays: number, on: Day): Day {
  let next = addDays(close, cycleDays);
  while (next <= on) next = addDays(next, cycleDays);
  return next;
}

/**
 * The period a close covers: everything since the previous close, so no day
 * belongs to two charges and no day belongs to none.
 */
export function periodFor(input: {
  lastClose: Day | null;
  activatedOn: Day;
  close: Day;
}): CyclePeriod {
  const start = input.lastClose === null ? input.activatedOn : addDays(input.lastClose, 1);

  return { start: start > input.close ? input.close : start, end: input.close };
}

export function describePeriod(period: CyclePeriod): string {
  return `${period.start} to ${period.end}`;
}
