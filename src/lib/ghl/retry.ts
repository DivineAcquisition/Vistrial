import { WEBHOOK_MAX_ATTEMPTS } from "@/lib/ghl/constants";

export function nextAttemptAt(attemptCount: number, now = Date.now()): string {
  const minutes = Math.min(2 ** Math.max(attemptCount - 1, 0), 128);
  return new Date(now + minutes * 60_000).toISOString();
}

export function shouldMarkDead(attemptCount: number, max = WEBHOOK_MAX_ATTEMPTS): boolean {
  return attemptCount >= max;
}
