import { AWAITING_LINK_MAX_BACKOFF_MINUTES, WEBHOOK_MAX_ATTEMPTS } from "@/lib/ghl/constants";
import { WEBHOOK_PAYLOAD_RETENTION_DAYS } from "@/lib/ops/constants";

export function nextAttemptAt(attemptCount: number, now = Date.now(), capMinutes = 128): string {
  const minutes = Math.min(2 ** Math.max(attemptCount - 1, 0), capMinutes);
  return new Date(now + minutes * 60_000).toISOString();
}

export function shouldMarkDead(attemptCount: number, max = WEBHOOK_MAX_ATTEMPTS): boolean {
  return attemptCount >= max;
}

/**
 * An event whose location belongs to no workspace yet is waiting, not failing.
 * The agency OAuth flow can leave a location unclaimed for days while its
 * funnel keeps firing, so this must not consume the failure budget.
 */
export const AWAITING_LINK_ERROR = "awaiting_location_link";

export function awaitingLinkNextAttemptAt(attemptCount: number, now = Date.now()): string {
  return nextAttemptAt(attemptCount, now, AWAITING_LINK_MAX_BACKOFF_MINUTES);
}

/**
 * Waiting still ends. Past the payload retention window the body is purged and
 * the event is unreplayable, so that is the honest point to give up.
 */
export function awaitingLinkExpired(receivedAt: string, now = Date.now()): boolean {
  const received = Date.parse(receivedAt);
  if (Number.isNaN(received)) return false;
  return now - received >= WEBHOOK_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60_000;
}

export type FailureDisposition = {
  waiting: boolean;
  dead: boolean;
  nextAttemptAt: string;
};

/**
 * What a failed pass costs an event. Waiting on a location link is the one
 * reason that must not spend the failure budget: the attempts would run out in
 * about four hours, and a null-org event that goes dead is invisible to every
 * per-org health query and unreachable from the manual retry.
 */
export function failureDisposition(args: {
  reason: string;
  attemptCount: number;
  receivedAt: string;
  now?: number;
}): FailureDisposition {
  const now = args.now ?? Date.now();
  const waiting = args.reason === AWAITING_LINK_ERROR;
  const dead = waiting
    ? awaitingLinkExpired(args.receivedAt, now)
    : shouldMarkDead(args.attemptCount, WEBHOOK_MAX_ATTEMPTS);
  if (dead) return { waiting, dead, nextAttemptAt: new Date(now).toISOString() };
  return {
    waiting,
    dead,
    nextAttemptAt: waiting
      ? awaitingLinkNextAttemptAt(args.attemptCount, now)
      : nextAttemptAt(args.attemptCount, now),
  };
}
