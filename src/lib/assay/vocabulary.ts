/**
 * What Assay can see happen to a lead, and what Scribe can report from a call.
 * Engagement uses activity metadata only: that something happened, when, and
 * on which channel. Never message text.
 */

/** Things the lead did, or that happened to their booking or stage. */
export const ENGAGEMENT_EVENTS = [
  "replied",
  "called_back",
  "form_submitted",
  "quote_requested",
  "pricing_asked",
  "application_submitted",
  "deposit_paid",
  "quote_viewed",
  "materials_opened",
  "booked",
  "rescheduled_by_lead",
  "canceled",
  "no_show",
  "meeting_completed",
  "stage_forward",
  "stage_back",
  "reopened",
] as const;
export type EngagementEvent = (typeof ENGAGEMENT_EVENTS)[number];

/**
 * Events that count as the lead doing something, for the silence clock.
 * Stage moves are often made by the team, so they never reset it.
 */
export const LEAD_ACTION_EVENTS: ReadonlySet<EngagementEvent> = new Set([
  "replied",
  "called_back",
  "form_submitted",
  "quote_requested",
  "pricing_asked",
  "application_submitted",
  "deposit_paid",
  "quote_viewed",
  "materials_opened",
  "booked",
  "rescheduled_by_lead",
  "canceled",
  "meeting_completed",
  "reopened",
]);

/**
 * Engagement rule kinds. Most count events; a few read a pattern:
 * a fast reply to the team, several exchanges, or silence after outreach.
 */
export const ENGAGEMENT_RULE_KINDS = [...ENGAGEMENT_EVENTS, "replied_fast", "two_way", "no_reply"] as const;
export type EngagementRuleKind = (typeof ENGAGEMENT_RULE_KINDS)[number];

export const CALL_SIGNALS = {
  timeline: ["ready_now", "within_30_days", "within_90_days", "later"],
  budget_fit: ["fits", "does_not_fit"],
  decision_maker: ["on_call", "needs_someone_else"],
  objection: ["resolved", "unresolved"],
  buying_intent: ["stated"],
  next_step: ["meeting_booked", "quote_to_send", "decision_date", "none"],
  red_flag: ["price_shopping", "outside_scope", "lowest_price_only", "needs_approval_no_follow_up"],
} as const;
export type CallSignal = keyof typeof CALL_SIGNALS;
export const CALL_SIGNAL_KEYS = Object.keys(CALL_SIGNALS) as CallSignal[];

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function isCallSignal(value: string): value is CallSignal {
  return Object.prototype.hasOwnProperty.call(CALL_SIGNALS, value);
}

export function isSignalValue(signal: CallSignal, value: string): boolean {
  return (CALL_SIGNALS[signal] as readonly string[]).includes(value);
}

export const TIERS = ["hot", "warm", "cool", "cold"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = { hot: "Hot", warm: "Warm", cool: "Cool", cold: "Cold" };

export const TIER_RANK: Record<Tier, number> = { cold: 0, cool: 1, warm: 2, hot: 3 };

export type Part = "fit" | "engagement" | "call";

export const PART_LABEL: Record<Part, string> = { fit: "Fit", engagement: "Engagement", call: "Call signals" };
