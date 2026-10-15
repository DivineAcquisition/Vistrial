const DAY_MS = 24 * 60 * 60 * 1000;

const CLOSED = new Set(["completed", "declined", "cancelled", "canceled"]);

/** Whole days since the request was opened. */
export function requestAgeDays(createdAt: string, now = new Date()): number {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/** Open requests at or past the policy response window. */
export function requestNeedsAttention(
  status: string,
  createdAt: string,
  now = new Date(),
  limitDays = 30,
): boolean {
  if (CLOSED.has(status)) return false;
  return requestAgeDays(createdAt, now) >= limitDays;
}
