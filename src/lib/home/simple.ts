const DAY = 24 * 60 * 60 * 1000;

/** Leads that need a first reply or a follow-up now: missed, plus close to the deadline. */
export function leadsWaitingCount(missed: number | null, atRisk: number | null): number {
  return (missed ?? 0) + (atRisk ?? 0);
}

/** The welcome line shows for seven days after the workspace goes live. */
export function showWelcomeBanner(wentLiveAt: string | null, now = Date.now()): boolean {
  if (!wentLiveAt) return false;
  const started = Date.parse(wentLiveAt);
  if (!Number.isFinite(started)) return false;
  const age = now - started;
  return age >= 0 && age < 7 * DAY;
}
