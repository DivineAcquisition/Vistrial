export const RECONNECT_REMINDER_HOURS = [0, 24, 72] as const;

/** Test-mode calendars get the first notice only. Google testing sign-ins expire often. */
export function reconnectReminderHours(testMode: boolean): number[] {
  if (testMode) return [0];
  return [...RECONNECT_REMINDER_HOURS];
}

export function attentionDigestAllowed(lastSentAt: number | null, now: number): boolean {
  if (lastSentAt === null) return true;
  return now - lastSentAt >= 24 * 60 * 60 * 1000;
}
