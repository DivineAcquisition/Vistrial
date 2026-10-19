import type { ConfigValues } from "@/lib/config/types";

/**
 * Assay's starting rules: the platform default and one set per industry
 * template. Approved points; staff adjust them per workspace through the
 * configuration layers. Nothing here reads age, income, family, or health.
 */

type Row = Record<string, string | number | boolean>;

function fit(id: string, input: string, op: string, points: number, reason: string, value = ""): Row {
  return { id, input, op, value, points, reason, missing: "neutral", enabled: true };
}

function engage(id: string, kind: string, points: number, reason: string, extra: { max_count?: number; minutes?: number; days?: number; min_count?: number } = {}): Row {
  return { id, kind, points, reason, max_count: extra.max_count ?? 1, minutes: extra.minutes ?? 0, days: extra.days ?? 0, min_count: extra.min_count ?? 0, enabled: true };
}

function call(id: string, signal: string, value: string, points: number, reason: string): Row {
  return { id, signal, value, points, reason, enabled: true };
}

const CONTACT = fit("contact_complete", "contact_complete", "is_true", 5, "Has a working phone or email.");
const SOURCE = fit("source_quality", "lead_source", "source_quality", 10, "Leads from {source} usually close well here.");
const IN_AREA = fit("in_service_area", "in_service_area", "is_true", 10, "Inside your service area.");
const OUT_AREA = fit("outside_service_area", "in_service_area", "is_false", -40, "Outside your service area.");

const REPLIED_FAST = engage("replied_fast", "replied_fast", 10, "Replied within {minutes} minutes {count_text}.", { max_count: 2, minutes: 15 });
const TWO_WAY = engage("two_way", "two_way", 10, "Replied {count} times in the last {days} days.", { days: 14, min_count: 2 });
const RESCHEDULED = engage("rescheduled", "rescheduled_by_lead", -5, "Rescheduled a booking.");
const CANCELED = engage("canceled", "canceled", -15, "Canceled a booking.");
const NO_SHOW = engage("no_show", "no_show", -25, "Missed a booking.");

function settings(halfLife: number, quietDays: number, weights: { fit: number; engagement: number; call: number }): ConfigValues {
  return {
    "assay.weights": weights,
    "assay.tiers": { hot: 75, warm: 50, cool: 25 },
    "assay.tier_stickiness": 5,
    "assay.decay_half_life_days": halfLife,
    "assay.negative_expiry_days": 30,
    "assay.engagement_lookback_days": 90,
    "assay.signal_confidence": "medium",
    "assay.signal_half_after_days": 60,
    "assay.signal_drop_after_days": 120,
    "assay.trigger_became_hot": true,
    "assay.trigger_big_jump": false,
    "assay.big_jump_points": 20,
    "assay.trigger_going_quiet": true,
    "assay.going_quiet_days": quietDays,
    "assay.trigger_hot_no_show": true,
    "assay.cooldown_hours": 72,
    "assay.tasks_per_person_day": 15,
    "assay.tasks_per_workspace_day": 60,
    "assay.drafts_per_workspace_day": 40,
  };
}

/** Used when a workspace has no industry template. */
export const ASSAY_PLATFORM_DEFAULTS: ConfigValues = {
  ...settings(7, 3, { fit: 35, engagement: 45, call: 20 }),
  "assay.fit_rules": [
    fit("service_offered", "service_offered", "is_true", 15, "Asked for a service you offer."),
    fit("service_not_offered", "service_offered", "is_false", -30, "Asked for a service you do not offer."),
    IN_AREA,
    OUT_AREA,
    CONTACT,
    SOURCE,
  ],
  "assay.engagement_rules": [
    engage("quote_requested", "quote_requested", 15, "Asked for a quote."),
    engage("booked", "booked", 20, "Booked a meeting."),
    engage("meeting_completed", "meeting_completed", 15, "Completed a meeting."),
    REPLIED_FAST,
    TWO_WAY,
    RESCHEDULED,
    CANCELED,
    NO_SHOW,
    engage("no_reply", "no_reply", -20, "No reply in {days} days.", { days: 14 }),
  ],
  "assay.call_rules": [
    call("timeline_now", "timeline", "ready_now", 20, "Said they are ready now."),
    call("timeline_30", "timeline", "within_30_days", 15, "Wants it done within 30 days."),
    call("timeline_later", "timeline", "later", -10, "Said it is for later."),
    call("budget_fits", "budget_fit", "fits", 15, "Stated budget fits the offer."),
    call("budget_short", "budget_fit", "does_not_fit", -20, "Stated budget does not fit the offer."),
    call("decision_maker", "decision_maker", "on_call", 10, "The decision maker was on the call."),
    call("next_step_meeting", "next_step", "meeting_booked", 15, "Agreed a next meeting."),
  ],
  "assay.field_map": [],
};

export const ASSAY_HOME_SERVICES: ConfigValues = {
  ...settings(7, 3, { fit: 35, engagement: 45, call: 20 }),
  "assay.fit_rules": [
    fit("service_offered", "service_offered", "is_true", 15, "Asked for a service you offer."),
    fit("service_not_offered", "service_offered", "is_false", -30, "Asked for a service you do not offer."),
    fit("value_above_minimum", "estimated_value", "gte", 10, "Job value is above your minimum.", "150"),
    fit("value_above_target", "estimated_value", "gte", 5, "Job value is in or above your target range.", "1500"),
    IN_AREA,
    OUT_AREA,
    fit("property_owner", "property_owner", "is_true", 10, "Owns the property."),
    CONTACT,
    SOURCE,
  ],
  "assay.engagement_rules": [
    engage("quote_requested", "quote_requested", 15, "Asked for a quote."),
    engage("booked", "booked", 25, "Booked an estimate."),
    engage("meeting_completed", "meeting_completed", 15, "Completed an estimate."),
    engage("quote_viewed", "quote_viewed", 10, "Opened the quote."),
    REPLIED_FAST,
    TWO_WAY,
    engage("reopened", "reopened", 15, "Came back after going quiet."),
    engage("stage_forward", "stage_forward", 10, "Moved forward in the pipeline."),
    engage("stage_back", "stage_back", -10, "Moved back in the pipeline."),
    RESCHEDULED,
    CANCELED,
    NO_SHOW,
    engage("no_reply", "no_reply", -20, "No reply in {days} days.", { days: 14 }),
  ],
  "assay.call_rules": [
    call("timeline_now", "timeline", "ready_now", 25, "Said they want it done now."),
    call("timeline_30", "timeline", "within_30_days", 20, "Wants the work done within 30 days."),
    call("timeline_90", "timeline", "within_90_days", 5, "Wants the work done within 90 days."),
    call("timeline_later", "timeline", "later", -10, "Said the work is for later."),
    call("decision_maker", "decision_maker", "on_call", 10, "The decision maker was on the call."),
    call("needs_someone_else", "decision_maker", "needs_someone_else", -5, "Needs someone else to decide."),
    call("budget_fits", "budget_fit", "fits", 15, "Stated budget fits the job."),
    call("budget_short", "budget_fit", "does_not_fit", -20, "Stated budget does not fit the job."),
    call("next_step_meeting", "next_step", "meeting_booked", 15, "Agreed a next step on the call."),
    call("next_step_quote", "next_step", "quote_to_send", 15, "Agreed a next step on the call."),
    call("next_step_date", "next_step", "decision_date", 15, "Agreed a next step on the call."),
    call("price_shopping", "red_flag", "price_shopping", -20, "Sounded like they are only price shopping."),
    call("outside_scope", "red_flag", "outside_scope", -30, "Asked for work outside your scope."),
  ],
  "assay.field_map": [],
};

export const ASSAY_MED_SPA: ConfigValues = {
  ...settings(10, 4, { fit: 35, engagement: 45, call: 20 }),
  "assay.fit_rules": [
    fit("high_value_service", "service_value", "gte", 15, "Interested in a higher value treatment or package.", "1000"),
    fit("in_travel_range", "in_service_area", "is_true", 10, "Inside your travel range."),
    fit("outside_travel_range", "in_service_area", "is_false", -40, "Outside your travel range."),
    CONTACT,
    SOURCE,
  ],
  "assay.engagement_rules": [
    engage("booked", "booked", 25, "Booked a consultation."),
    engage("deposit_paid", "deposit_paid", 20, "Paid a deposit."),
    engage("meeting_completed", "meeting_completed", 20, "Completed a consultation."),
    REPLIED_FAST,
    RESCHEDULED,
    engage("canceled", "canceled", -15, "Canceled a consultation."),
    engage("no_show", "no_show", -25, "Missed a consultation."),
    engage("no_reply", "no_reply", -20, "No reply in {days} days.", { days: 21 }),
  ],
  "assay.call_rules": [
    call("timeline_now", "timeline", "ready_now", 20, "Ready to start now."),
    call("timeline_30", "timeline", "within_30_days", 20, "Ready to start within 30 days."),
    call("budget_fits", "budget_fit", "fits", 15, "Stated budget fits the treatment."),
    call("concern_resolved", "objection", "resolved", 10, "Their main concern was answered on the call."),
    call("next_appointment", "next_step", "meeting_booked", 15, "Set the next appointment."),
    call("lowest_price_only", "red_flag", "lowest_price_only", -15, "Only asked about the lowest price."),
  ],
  "assay.field_map": [],
};

export const ASSAY_COACHES: ConfigValues = {
  ...settings(14, 5, { fit: 30, engagement: 40, call: 30 }),
  "assay.fit_rules": [
    fit("application_submitted", "application_submitted", "is_true", 20, "Submitted an application."),
    fit("target_client", "target_client", "is_true", 15, "Matches your target client."),
    CONTACT,
    SOURCE,
  ],
  "assay.engagement_rules": [
    engage("booked", "booked", 20, "Booked a call."),
    engage("meeting_completed", "meeting_completed", 20, "Showed up for the call."),
    REPLIED_FAST,
    engage("materials_opened", "materials_opened", 5, "Opened the materials you sent."),
    engage("no_show", "no_show", -25, "Missed a call."),
    engage("no_reply", "no_reply", -20, "No reply in {days} days.", { days: 21 }),
  ],
  "assay.call_rules": [
    call("decision_maker", "decision_maker", "on_call", 15, "The decision maker was on the call."),
    call("budget_fits", "budget_fit", "fits", 20, "Stated budget fits the program price."),
    call("budget_short", "budget_fit", "does_not_fit", -25, "Stated budget does not fit the program price."),
    call("timeline_now", "timeline", "ready_now", 15, "Wants to start now."),
    call("timeline_30", "timeline", "within_30_days", 15, "Wants to start within 30 days."),
    call("objection_resolved", "objection", "resolved", 10, "Their objection was answered on the call."),
    call("needs_approval", "red_flag", "needs_approval_no_follow_up", -15, "Needs someone else's approval and no follow-up is booked."),
  ],
  "assay.field_map": [{ source: "@answers_present", input: "application_submitted" }],
};

export const ASSAY_TEMPLATE_VALUES: Record<string, ConfigValues> = {
  "home-services": ASSAY_HOME_SERVICES,
  "med-spa": ASSAY_MED_SPA,
  "coaches-consultants": ASSAY_COACHES,
};
