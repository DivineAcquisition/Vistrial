/**
 * The appointment lifecycle, as the interface understands it.
 *
 * The database enforces all of this in a trigger; this module exists so screens
 * can offer only the moves that will actually be permitted rather than offering
 * a button that fails. The two must agree — the transitions here are the same
 * ones written into `guard_appointment` in migration 006.
 */

import type { Tone } from "@/components/ui/tone";
import type { AppointmentStatus } from "@/types/database";

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "rejected",
  "disputed",
  "billed",
];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
  disputed: "Disputed",
  billed: "Billed",
};

export const STATUS_TONES: Record<AppointmentStatus, Tone> = {
  pending: "warning",
  confirmed: "good",
  rejected: "neutral",
  disputed: "critical",
  billed: "brand",
};

export const STATUS_MEANINGS: Record<AppointmentStatus, string> = {
  pending: "Awaiting review against the client's definition. Not billable.",
  confirmed: "Meets the definition. Billable once the review window closes.",
  rejected: "Does not meet the definition. Never billable.",
  disputed: "The client flagged it inside the window. Billing is held.",
  billed: "Included in a processed charge. Immutable.",
};

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "rejected"],
  confirmed: ["disputed", "billed"],
  disputed: ["confirmed", "rejected"],
  rejected: [],
  billed: [],
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The statuses an appointment can still move out of. */
export function isTerminal(status: AppointmentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * A rejection the client can see is worth more than a deletion they cannot, so
 * the reason is picked from a short list rather than typed fresh every time.
 * Free text is available, and required, when nothing on the list fits.
 */
export type RejectionReason = {
  code: string;
  label: string;
  /** Reasons that mean nothing without the specifics. */
  requiresNote: boolean;
};

export const REJECTION_REASONS: RejectionReason[] = [
  { code: "outside_service_area", label: "Outside the service area", requiresNote: false },
  { code: "job_type_not_accepted", label: "Job type not accepted", requiresNote: false },
  {
    code: "existing_customer",
    label: "Existing customer or already in the pipeline",
    requiresNote: false,
  },
  { code: "duplicate", label: "Duplicate of another appointment", requiresNote: false },
  { code: "invalid_contact", label: "Invalid contact details", requiresNote: false },
  { code: "no_show", label: "Did not show", requiresNote: false },
  { code: "other", label: "Other", requiresNote: true },
];

const REASON_LABELS = new Map(
  REJECTION_REASONS.map((reason) => [reason.code, reason.label])
);

export function rejectionLabel(code: string | null): string | null {
  if (code === null) return null;
  return REASON_LABELS.get(code) ?? code;
}

export function requiresNote(code: string): boolean {
  return REJECTION_REASONS.find((reason) => reason.code === code)?.requiresNote ?? true;
}

/**
 * The stored reason text. The list entry carries the classification and the
 * note carries the specifics; a client asking "why" gets both.
 */
export function composeReason(code: string, note: string): string {
  const trimmed = note.trim();
  const label = rejectionLabel(code) ?? code;

  if (code === "other") return trimmed;
  return trimmed === "" ? label : `${label} — ${trimmed}`;
}

export const NO_SHOW_REASON =
  "Did not show — recorded as a no-show, so it is never billable.";
