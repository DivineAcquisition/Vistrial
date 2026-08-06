/**
 * The review window.
 *
 * Confirming an appointment opens a window of the length stored on the client.
 * It is measured in raw clock time from the moment of confirmation, with no
 * adjustment for weekends or holidays: a shorter effective window over a
 * weekend is acceptable, but silently extending one would make the billing date
 * drift unpredictably.
 *
 * The window itself is opened by the database, which is the only place that can
 * guarantee its length. Everything here reads it back and decides what an
 * appointment is allowed to become.
 */

import type { Tone } from "@/components/ui/tone";
import { formatDuration } from "@/lib/response-time";
import type { AppointmentStatus, NotificationStatus } from "@/types/database";

export type WindowInput = {
  status: AppointmentStatus;
  review_window_ends_at: string | null;
};

export type ReviewWindow =
  /** Not yet confirmed, so no window has been opened. */
  | { state: "not_opened" }
  | { state: "open"; endsAt: string; remainingMs: number }
  /** Elapsed without a dispute: the appointment is locked for billing. */
  | { state: "closed"; endsAt: string }
  /** Disputed inside the window, so billing is held while it is discussed. */
  | { state: "held" }
  | { state: "billed" };

export function reviewWindow(
  appointment: WindowInput,
  now: string | number = Date.now()
): ReviewWindow {
  if (appointment.status === "billed") return { state: "billed" };
  if (appointment.status === "disputed") return { state: "held" };

  if (appointment.status !== "confirmed" || appointment.review_window_ends_at === null) {
    return { state: "not_opened" };
  }

  const endsAt = appointment.review_window_ends_at;
  const remainingMs = Date.parse(endsAt) - (typeof now === "number" ? now : Date.parse(now));

  return remainingMs > 0
    ? { state: "open", endsAt, remainingMs }
    : { state: "closed", endsAt };
}

export function describeWindow(window: ReviewWindow): string {
  switch (window.state) {
    case "not_opened":
      return "Not opened";
    case "open":
      return `${formatDuration(window.remainingMs)} left`;
    case "closed":
      return "Closed — locked for billing";
    case "held":
      return "Held while disputed";
    case "billed":
      return "Billed";
  }
}

export function windowTone(window: ReviewWindow): Tone {
  switch (window.state) {
    case "not_opened":
      return "neutral";
    case "open":
      return "warning";
    case "closed":
      return "good";
    case "held":
      return "critical";
    case "billed":
      return "brand";
  }
}

export type Billability = { billable: true } | { billable: false; reason: string };

/**
 * Whether an appointment may be assembled into a charge. Prompt 5 does the
 * assembling; this is the gate it has to pass, and the database enforces the
 * same two conditions independently.
 */
export function billability(
  appointment: WindowInput & { notificationStatus: NotificationStatus | null },
  now: string | number = Date.now()
): Billability {
  if (appointment.status === "billed") {
    return { billable: false, reason: "Already billed." };
  }

  if (appointment.status !== "confirmed") {
    return {
      billable: false,
      reason: `Only a confirmed appointment is billable. This one is ${appointment.status}.`,
    };
  }

  const window = reviewWindow(appointment, now);
  if (window.state !== "closed") {
    return {
      billable: false,
      reason:
        window.state === "open"
          ? `The client still has ${formatDuration(window.remainingMs)} to dispute.`
          : "The review window has not closed.",
    };
  }

  if (appointment.notificationStatus !== "sent") {
    return {
      billable: false,
      reason:
        "The client was never told this appointment entered their review window.",
    };
  }

  return { billable: true };
}
