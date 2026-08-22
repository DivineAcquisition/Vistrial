/**
 * The controlled vocabularies behind the business profile.
 *
 * Every list here mirrors a Postgres enum. Free text survives only where the
 * value is a proper noun, the prospect's own words, or an other-plus-specify
 * escape, which is why most lists end in "other" with a paired text field.
 */

import type { Enums } from "@/types/database";

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** Shown under the option only where the wording is not self-explanatory. */
  hint?: string;
};

export const OFFER_TYPES: Array<Choice<Enums<"profile_offer_type">>> = [
  { value: "coaching", label: "Coaching" },
  { value: "consulting", label: "Consulting" },
  { value: "agency_service", label: "Agency service" },
  { value: "course", label: "Course or programme" },
  { value: "software", label: "Software" },
  { value: "done_for_you", label: "Done-for-you delivery" },
  { value: "other", label: "Something else" },
];

export const PAYMENT_STRUCTURES: Array<Choice<Enums<"profile_payment_structure">>> = [
  { value: "pif", label: "Paid in full" },
  { value: "plan", label: "Payment plan" },
  { value: "pif_or_plan", label: "Either, the prospect picks" },
  { value: "bnpl", label: "Financed by a third party" },
  { value: "other", label: "Something else" },
];

export const CLOSE_MOTIONS: Array<Choice<Enums<"profile_close_motion">>> = [
  { value: "one_call", label: "One call", hint: "Pitch and close on the first conversation." },
  { value: "two_call", label: "Two calls", hint: "A triage or discovery call, then a close." },
  { value: "multi_call", label: "Three or more", hint: "A longer consultative process." },
];

export const TEAM_STRUCTURES: Array<Choice<Enums<"profile_team_structure">>> = [
  { value: "owner_sold", label: "The owner sells" },
  { value: "closers_only", label: "Closers, no setters" },
  { value: "setter_closer", label: "Setters hand off to closers" },
  { value: "setters_only", label: "Setters, and the owner closes" },
];

export const LEAD_CHANNELS: Array<Choice<Enums<"profile_lead_channel">>> = [
  { value: "meta_ads", label: "Facebook or Instagram ads" },
  { value: "google_ads", label: "Google ads" },
  { value: "youtube_ads", label: "YouTube ads" },
  { value: "tiktok_ads", label: "TikTok ads" },
  { value: "organic_social", label: "Organic social" },
  { value: "email_list", label: "Your email list" },
  { value: "referral", label: "Referrals" },
  { value: "affiliate", label: "Affiliates or partners" },
  { value: "webinar", label: "Webinars or masterclasses" },
  { value: "cold_outbound", label: "Cold outbound" },
  { value: "podcast", label: "Podcast" },
  { value: "seo", label: "Search and content" },
  { value: "events", label: "Live events" },
  { value: "other", label: "Something else" },
];

/**
 * Each signal raises the factor it belongs to. The mapping is the same one
 * profile_signal_factor() applies in the database.
 */
export const QUALIFICATION_SIGNALS: Array<
  Choice<Enums<"profile_qualification_signal">> & { factor: string | null }
> = [
  { value: "has_budget", label: "They can afford it", factor: "investment capacity" },
  { value: "existing_revenue", label: "They already have revenue", factor: "investment capacity" },
  { value: "urgent_timeline", label: "They want to start soon", factor: "timeline" },
  { value: "sole_decision_maker", label: "They can decide alone", factor: "decision authority" },
  { value: "has_team", label: "They have a team behind them", factor: "decision authority" },
  { value: "clear_pain", label: "The problem is costing them now", factor: "pain severity" },
  { value: "tried_alternatives", label: "They have tried other things", factor: "pain severity" },
  { value: "right_industry", label: "They are in a market you serve", factor: "pain severity" },
  { value: "other", label: "Something else", factor: null },
];

export const DISQUALIFIERS: Array<Choice<Enums<"profile_disqualifier">>> = [
  { value: "no_budget", label: "No budget at all" },
  { value: "pre_revenue", label: "Pre-revenue" },
  { value: "wrong_industry", label: "An industry you do not serve" },
  { value: "needs_partner_approval", label: "Cannot decide without a partner" },
  { value: "seeking_employment", label: "Looking for a job, not a service" },
  { value: "out_of_geography", label: "Outside the places you work" },
  { value: "competitor", label: "A competitor" },
  { value: "other", label: "Something else" },
];

export const SETTER_FACTS: Array<Choice<Enums<"profile_setter_fact">>> = [
  { value: "budget_confirmed", label: "Budget confirmed" },
  { value: "timeline_confirmed", label: "Timeline confirmed" },
  { value: "decision_maker_confirmed", label: "Decision maker confirmed" },
  { value: "pain_articulated", label: "The problem in their own words" },
  { value: "current_solution", label: "What they are doing today" },
  { value: "goal_stated", label: "What they want instead" },
  { value: "call_purpose_set", label: "Why the next call is happening" },
  { value: "other", label: "Something else" },
];

export const EXISTING_FOLLOWUPS: Array<Choice<Enums<"profile_existing_followup">>> = [
  { value: "crm_sequence", label: "My CRM already sends something" },
  { value: "manual_only", label: "Somebody does it by hand" },
  { value: "nothing", label: "Nothing happens" },
];

export const GOAL_METRICS: Array<Choice<Enums<"profile_goal_metric">>> = [
  { value: "clients_per_month", label: "Clients closed per month" },
  { value: "revenue_per_month", label: "Revenue per month" },
  { value: "close_rate", label: "Close rate" },
  { value: "speed_to_lead", label: "Minutes to first response" },
];

export const OBJECTION_TYPES: Array<Choice<Enums<"objection_type">>> = [
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing" },
  { value: "spouse_partner", label: "Needs a partner's agreement" },
  { value: "trust", label: "Trust" },
  { value: "fit", label: "Fit" },
  { value: "competitor", label: "Looking at someone else" },
  { value: "other", label: "Something else" },
];

export const VOICE_FORMALITIES: Array<Choice<Enums<"voice_formality">>> = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
];

export const CHANNEL_PREFERENCES: Array<Choice<"sms" | "email">> = [
  { value: "sms", label: "Text message" },
  { value: "email", label: "Email" },
];

export const SCORE_FACTOR_CHOICES: Array<Choice<Enums<"score_factor">>> = [
  { value: "timeline", label: "Timeline" },
  { value: "investment_capacity", label: "Investment capacity" },
  { value: "decision_authority", label: "Decision authority" },
  { value: "pain_severity", label: "Pain severity" },
];

export const BENCHMARK_METRIC_LABELS: Record<Enums<"benchmark_metric">, string> = {
  speed_to_lead_minutes: "Minutes to first response",
  show_rate: "Show rate",
  close_rate: "Close rate",
  touches_to_close: "Touches to close",
};

export const BENCHMARK_METRIC_UNITS: Record<Enums<"benchmark_metric">, string> = {
  speed_to_lead_minutes: "min",
  show_rate: "%",
  close_rate: "%",
  touches_to_close: "",
};

/** Lower is better for these, which decides which side of the median reads well. */
export const BENCHMARK_LOWER_IS_BETTER: Record<Enums<"benchmark_metric">, boolean> = {
  speed_to_lead_minutes: true,
  show_rate: false,
  close_rate: false,
  touches_to_close: true,
};

export const REVIEW_REASON_LABELS: Record<Enums<"profile_review_reason">, string> = {
  quarterly: "Quarterly review",
  price_change: "Your prices moved",
  volume_change: "Your lead volume moved",
  new_source: "A new source appeared",
};

export const CONTRADICTION_LABELS: Record<Enums<"profile_contradiction_kind">, string> = {
  close_motion: "How many calls it takes to close",
  sales_cycle: "How long a deal takes",
  top_objection: "The objection you hear most",
  speed_to_lead: "How fast you respond",
  price_point: "Your price point",
};

export const ACTIVATION_WARNING_LABELS: Record<Enums<"activation_warning">, string> = {
  no_voice_examples: "No voice examples",
  no_transcript_source: "No transcript source",
  profile_incomplete: "Business profile below the usable threshold",
  backfill_partial: "Baseline graded partial",
};

export function labelFor<T extends string>(
  choices: Array<Choice<T>>,
  value: string | null | undefined
): string {
  if (!value) return "Not answered";
  return choices.find((choice) => choice.value === value)?.label ?? value;
}

/**
 * Phrases that mark an application answer as disqualifying. Read at intake by
 * flagDisqualifiedLead, which is the flag operators see on the queue row.
 */
export const DISQUALIFIER_PHRASES: Record<Enums<"profile_disqualifier">, string[]> = {
  no_budget: ["no budget", "cannot afford", "can't afford", "nothing to invest", "broke", "under 1k"],
  pre_revenue: ["pre-revenue", "pre revenue", "no revenue", "not launched", "idea stage", "0-0"],
  wrong_industry: [],
  needs_partner_approval: ["need to ask my", "partner decides", "spouse decides", "not the decision maker"],
  seeking_employment: ["looking for a job", "seeking employment", "want to be hired", "apply for a role"],
  out_of_geography: [],
  competitor: ["competitor", "i run a similar", "same business as you"],
  other: [],
};
