/**
 * Billing decisions that the database also enforces. Keep the two in step.
 * Prices are cents. The floor is Private Access at $97.
 */

export const PRIVATE_ACCESS_FLOOR_CENTS = 9700;
export const LIMIT_REVIEW_ON = "2026-11-14";
export const BILLING_TIMEZONE = "America/New_York";

export const RESTRICTION_DEFAULTS = {
  graceThroughDay: 7,
  restrictOnDay: 8,
  suspendOnDay: 30,
  closeOnDay: 60,
  reminderDays: [1, 3, 6],
} as const;

export type BillingState =
  | "not_billed"
  | "pending_payment"
  | "active"
  | "past_due"
  | "restricted"
  | "suspended"
  | "canceling"
  | "canceled"
  | "paused";

/** Days since the failure, in the billing time zone. Day 0 is the failure date. */
export function daysSinceFailure(failedOn: string, today: string): number {
  const start = Date.parse(`${failedOn.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function restrictionState(days: number, extraGrace = 0): BillingState {
  const grace = RESTRICTION_DEFAULTS.graceThroughDay + extraGrace;
  const restrict = RESTRICTION_DEFAULTS.restrictOnDay + extraGrace;
  const suspend = RESTRICTION_DEFAULTS.suspendOnDay + extraGrace;
  const close = RESTRICTION_DEFAULTS.closeOnDay + extraGrace;
  if (days >= close) return "canceled";
  if (days >= suspend) return "suspended";
  if (days >= restrict) return "restricted";
  if (days > grace) return "restricted";
  return "past_due";
}

export function quoteNeedsSecondAdmin(cents: number, activePlatformAdmins: number): boolean {
  return cents < PRIVATE_ACCESS_FLOOR_CENTS && activePlatformAdmins >= 2;
}

export function quoteIsSingleAdmin(cents: number, activePlatformAdmins: number): boolean {
  return cents < PRIVATE_ACCESS_FLOOR_CENTS && activePlatformAdmins < 2;
}

export function creditNeedsSecondAdmin(cents: number, monthPriceCents: number, activePlatformAdmins: number): boolean {
  return cents > monthPriceCents && activePlatformAdmins >= 2;
}

/** Hard caps never refuse the lead itself. AI waits. */
export function leadCaptureContinues(check: { allowed: boolean; capture?: boolean }): boolean {
  return check.capture !== false || check.allowed;
}

export function meterLabel(key: string): string {
  switch (key) {
    case "team_members":
      return "People on the team";
    case "leads_processed":
      return "Leads with a full case file";
    case "transcript_minutes":
      return "Call transcription";
    case "compass_questions":
      return "Compass questions";
    default:
      return key.replace(/_/g, " ");
  }
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}
