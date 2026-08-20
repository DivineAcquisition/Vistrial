import type { Enums } from "@/types/database";

export const LEAD_STATUSES = [
  "new",
  "working",
  "call_booked",
  "no_show",
  "follow_up",
  "objection_hold",
  "ghost",
  "closed_won",
  "closed_lost",
] as const satisfies readonly Enums<"lead_status">[];

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Manual status may be any pipeline state except closed-won, which follows payment. */
export const MANUAL_LEAD_STATUSES = LEAD_STATUSES.filter(
  (status) => status !== "closed_won"
) as Exclude<LeadStatus, "closed_won">[];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  working: "Working",
  call_booked: "Call booked",
  no_show: "No-show",
  follow_up: "Follow-up",
  objection_hold: "Objection hold",
  ghost: "Ghost",
  closed_won: "Closed won",
  closed_lost: "Closed lost",
};

export const LEAD_TRACK_LABELS: Record<Enums<"lead_type">, string> = {
  ready_track: "Ready",
  nurture_track: "Nurture",
};

export const SCORE_TRIGGER_LABELS: Record<Enums<"score_trigger">, string> = {
  intake: "Intake",
  call: "Call",
  manual: "Manual override",
  event: "Event",
};

export const CALL_TYPE_LABELS: Record<Enums<"call_type">, string> = {
  triage: "Triage",
  discovery: "Discovery",
  close: "Close",
  follow_up: "Follow-up",
};

export const CALL_OUTCOME_LABELS: Record<Enums<"call_outcome">, string> = {
  held: "Held",
  no_show: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export const OBJECTION_TYPE_LABELS: Record<Enums<"objection_type">, string> = {
  price: "Price",
  timing: "Timing",
  spouse_partner: "Spouse / partner",
  trust: "Trust",
  fit: "Fit",
  competitor: "Competitor",
  other: "Other",
};

export const PAYMENT_TYPE_LABELS: Record<Enums<"payment_type">, string> = {
  pif: "Paid in full",
  plan: "Plan",
  bnpl: "BNPL",
};

export function leadStatusTone(
  status: LeadStatus
): "brand" | "warning" | "critical" | "good" | "neutral" {
  if (status === "closed_won") return "good";
  if (status === "ghost" || status === "closed_lost" || status === "no_show") return "critical";
  if (status === "call_booked" || status === "follow_up" || status === "objection_hold") {
    return "warning";
  }
  if (status === "working") return "brand";
  return "neutral";
}
