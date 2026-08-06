/**
 * Response time is the number Divine Acquisition sells, so none of it is stored.
 * Every figure here is computed from touch records at the moment they are read.
 *
 * Time is raw clock time. There is no business-hours adjustment: a lead arriving
 * at nine at night and answered at nine the next morning took twelve hours, and
 * that is precisely the fact the offer exists to fix.
 */

import type { Tone } from "@/components/ui/tone";
import type { TouchType } from "@/types/database";

export type FirstTouchInput = {
  touch_type: TouchType;
  occurred_at: string;
  is_first_of_type: boolean;
};

export type ResponseTimes = {
  /** Arrival to first system touch, in milliseconds, or null when awaiting. */
  systemMs: number | null;
  /** Arrival to first human touch, in milliseconds, or null when awaiting. */
  humanMs: number | null;
  /** How long after the automated response a person engaged. */
  gapMs: number | null;
};

export const AWAITING = "Awaiting";

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export function firstTouch<T extends FirstTouchInput>(
  touches: readonly T[],
  type: TouchType
): T | null {
  return touches.find((touch) => touch.is_first_of_type && touch.touch_type === type) ?? null;
}

function elapsed(from: string, to: string | null): number | null {
  if (to === null) return null;

  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  // A touch stamped before arrival means clock skew between systems, not a
  // negative response time.
  return Math.max(0, end - start);
}

export function computeResponseTimes(
  arrivedAt: string,
  touches: readonly FirstTouchInput[]
): ResponseTimes {
  const systemMs = elapsed(arrivedAt, firstTouch(touches, "system")?.occurred_at ?? null);
  const humanMs = elapsed(arrivedAt, firstTouch(touches, "human")?.occurred_at ?? null);

  return {
    systemMs,
    humanMs,
    gapMs: systemMs === null || humanMs === null ? null : humanMs - systemMs,
  };
}

export function formatDuration(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const total = Math.round(Math.abs(ms) / 1000);

  if (total < 60) return `${sign}${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const seconds = total % 60;
    return seconds === 0 ? `${sign}${minutes}m` : `${sign}${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rest}m`;
  }

  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${sign}${days}d` : `${sign}${days}d ${rest}h`;
}

/**
 * Zero and unanswered mean opposite things, and confusing them would
 * misrepresent the exact number the business is judged on.
 */
export function formatResponse(ms: number | null): string {
  return ms === null ? AWAITING : formatDuration(ms);
}

export function responseTone(ms: number | null): Tone {
  if (ms === null) return "critical";
  if (ms < FIVE_MINUTES) return "good";
  if (ms <= ONE_HOUR) return "warning";
  return "critical";
}

/** Averages skip leads that are still awaiting rather than counting them as zero. */
export function averageMs(values: readonly (number | null)[]): number | null {
  const measured = values.filter((value): value is number => value !== null);
  if (measured.length === 0) return null;

  const total = measured.reduce((sum, value) => sum + value, 0);
  return Math.round(total / measured.length);
}
