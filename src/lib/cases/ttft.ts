export function isTtftBreached(input: {
  optedInAt: string;
  firstHumanTouchAt: string | null;
  speedToLeadMinutes: number;
  now: string;
}): boolean {
  if (input.firstHumanTouchAt) return false;
  const start = Date.parse(input.optedInAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return false;
  const windowMs = Math.max(input.speedToLeadMinutes, 1) * 60_000;
  return now - start >= windowMs;
}
