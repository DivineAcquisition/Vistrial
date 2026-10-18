import { assertRulesFair } from "@/lib/assay/fairness";
import type {
  CapSettings,
  PartWeights,
  Ruleset,
  ScoreRule,
  TemplateSlug,
  TierThresholds,
  TriggerSettings,
} from "@/lib/assay/types";

export const DEFAULT_WEIGHTS: PartWeights = { fit: 35, engagement: 45, call: 20 };

export const DEFAULT_TIERS: TierThresholds = { hot: 75, warm: 50, cool: 25, stickiness: 5 };

export const DEFAULT_CAPS: CapSettings = {
  tasksPerPersonPerDay: 15,
  tasksPerWorkspacePerDay: 60,
  draftsPerWorkspacePerDay: 40,
  triggerCooldownHours: 72,
};

const DECAY: Record<TemplateSlug, number> = {
  "home-services": 7,
  "med-spa": 10,
  "coaches-consultants": 14,
};

const QUIET_DAYS: Record<TemplateSlug, number> = {
  "home-services": 3,
  "med-spa": 4,
  "coaches-consultants": 5,
};

function triggers(days: number): TriggerSettings {
  return {
    becameHot: true,
    bigJump: true,
    bigJumpPoints: 20,
    goingQuiet: true,
    goingQuietDays: days,
    hotNoShow: true,
  };
}

function rule(partial: Omit<ScoreRule, "enabled" | "missing"> & { missing?: ScoreRule["missing"] }): ScoreRule {
  return { enabled: true, missing: partial.missing ?? "neutral", ...partial };
}

function fitCommon(): ScoreRule[] {
  return [
    rule({
      id: "contact_complete",
      part: "fit",
      name: "Contact details",
      points: 8,
      reason: "Phone or email is on file and looks usable.",
      when: { key: "contactComplete", op: "true" },
      callBased: false,
      evidence: "field",
    }),
  ];
}

function engagementCommon(): ScoreRule[] {
  return [
    rule({
      id: "replied_fast",
      part: "engagement",
      name: "Replied quickly",
      points: 14,
      reason: "Replied within 10 minutes.",
      when: { key: "replyMinutes", op: "lte", value: 10 },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "replied_hour",
      part: "engagement",
      name: "Replied within an hour",
      points: 8,
      reason: "Replied within an hour.",
      when: { key: "replyHourOnly", op: "true" },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "two_way",
      part: "engagement",
      name: "Two-way activity",
      points: 10,
      reason: "They have replied more than once in the last two weeks.",
      when: { key: "twoWayCount14d", op: "gte", value: 2 },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "no_show",
      part: "engagement",
      name: "No-show",
      points: -18,
      reason: "Missed a booked visit.",
      when: { key: "noShow", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "canceled",
      part: "engagement",
      name: "Canceled",
      points: -10,
      reason: "Canceled a booking.",
      when: { key: "canceled", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "rescheduled",
      part: "engagement",
      name: "Rescheduled",
      points: -4,
      reason: "They rescheduled.",
      when: { key: "rescheduledByLead", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "completed",
      part: "engagement",
      name: "Completed meeting",
      points: 12,
      reason: "Completed a meeting.",
      when: { key: "completedMeeting", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "stage_forward",
      part: "engagement",
      name: "Stage forward",
      points: 8,
      reason: "Moved forward in your pipeline.",
      when: { key: "stageMove", op: "eq", value: "forward" },
      callBased: false,
      evidence: "stage",
    }),
    rule({
      id: "stage_back",
      part: "engagement",
      name: "Stage back",
      points: -8,
      reason: "Moved backward in your pipeline.",
      when: { key: "stageMove", op: "eq", value: "back" },
      callBased: false,
      evidence: "stage",
    }),
    rule({
      id: "reopened",
      part: "engagement",
      name: "Reopened",
      points: 10,
      reason: "Came back after going quiet.",
      when: { key: "reopened", op: "true" },
      callBased: false,
      evidence: "stage",
    }),
    rule({
      id: "source_strong",
      part: "fit",
      name: "Source quality",
      points: 8,
      reason: "This lead source has been converting well here.",
      when: { key: "sourceQuality", op: "eq", value: "strong" },
      callBased: false,
      evidence: "source",
    }),
    rule({
      id: "source_weak",
      part: "fit",
      name: "Source quality low",
      points: -8,
      reason: "This lead source has been converting below the rest.",
      when: { key: "sourceQuality", op: "eq", value: "weak" },
      callBased: false,
      evidence: "source",
    }),
  ];
}

function callCommon(): ScoreRule[] {
  return [
    rule({
      id: "timeline_now",
      part: "call",
      name: "Ready now",
      points: 28,
      reason: "Said they want it done now.",
      when: { key: "timeline", op: "eq", value: "ready_now" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "timeline_30",
      part: "call",
      name: "Within 30 days",
      points: 22,
      reason: "Said they want it done within 30 days.",
      when: { key: "timeline", op: "eq", value: "within_30" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "timeline_90",
      part: "call",
      name: "Within 90 days",
      points: 10,
      reason: "Said they want it done within 90 days.",
      when: { key: "timeline", op: "eq", value: "within_90" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "timeline_later",
      part: "call",
      name: "Later",
      points: -8,
      reason: "Said this is for later.",
      when: { key: "timeline", op: "eq", value: "later" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "decision_on_call",
      part: "call",
      name: "Decision maker on the call",
      points: 16,
      reason: "The decision maker was on the call.",
      when: { key: "decisionOnCall", op: "eq", value: "on_call" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "decision_else",
      part: "call",
      name: "Needs someone else",
      points: -10,
      reason: "They need someone else to decide.",
      when: { key: "decisionOnCall", op: "eq", value: "needs_someone_else" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "budget_fits",
      part: "call",
      name: "Budget fits",
      points: 16,
      reason: "Their stated budget fits the offer.",
      when: { key: "budgetFit", op: "eq", value: "fits" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "budget_miss",
      part: "call",
      name: "Budget does not fit",
      points: -14,
      reason: "Their stated budget does not fit the offer.",
      when: { key: "budgetFit", op: "eq", value: "does_not_fit" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "objection_resolved",
      part: "call",
      name: "Concern resolved",
      points: 8,
      reason: "The main concern was resolved on the call.",
      when: { key: "objectionResolved", op: "eq", value: "yes" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "objection_open",
      part: "call",
      name: "Concern open",
      points: -8,
      reason: "A concern came up and was not resolved.",
      when: { key: "objectionResolved", op: "eq", value: "no" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "buying_intent",
      part: "call",
      name: "Buying intent",
      points: 14,
      reason: "Said they want to move ahead.",
      when: { key: "buyingIntent", op: "eq", value: "yes" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "next_step",
      part: "call",
      name: "Next step agreed",
      points: 12,
      reason: "A next step was agreed.",
      when: { key: "nextStep", op: "eq", value: "booked" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "next_step_quote",
      part: "call",
      name: "Quote agreed",
      points: 8,
      reason: "A quote was agreed as the next step.",
      when: { key: "nextStep", op: "eq", value: "quote" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "price_shopping",
      part: "call",
      name: "Price shopping",
      points: -18,
      reason: "They were only comparing prices.",
      when: { key: "redFlag", op: "eq", value: "price_shopping" },
      callBased: true,
      evidence: "case_file",
    }),
    rule({
      id: "outside_scope",
      part: "call",
      name: "Outside scope",
      points: -16,
      reason: "The work is outside what you do.",
      when: { key: "redFlag", op: "eq", value: "outside_scope" },
      callBased: true,
      evidence: "case_file",
    }),
  ];
}

function homeServicesRules(): ScoreRule[] {
  return [
    ...fitCommon(),
    rule({
      id: "service_match",
      part: "fit",
      name: "Service offered",
      points: 18,
      reason: "Asked for a service you offer.",
      when: { key: "serviceMatch", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "service_value",
      part: "fit",
      name: "Higher value service",
      points: 8,
      reason: "The service they asked for is one of your higher value jobs.",
      when: { key: "serviceHighValue", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "deal_value",
      part: "fit",
      name: "Job value",
      points: 12,
      reason: "The job value is in your target range.",
      when: { key: "dealValueFit", op: "eq", value: "within" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "deal_value_above",
      part: "fit",
      name: "Job value above target",
      points: 12,
      reason: "The job value is above your target range.",
      when: { key: "dealValueFit", op: "eq", value: "above" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "inside_area",
      part: "fit",
      name: "Inside service area",
      points: 10,
      reason: "Inside your service area.",
      when: { key: "insideServiceArea", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "outside_area",
      part: "fit",
      name: "Outside service area",
      points: -25,
      reason: "Outside your service area.",
      when: { key: "insideServiceArea", op: "false" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "owner_occupied",
      part: "fit",
      name: "Property owner",
      points: 8,
      reason: "They own the property.",
      when: { key: "custom_owner_occupied", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "decision_known",
      part: "fit",
      name: "Decision maker known",
      points: 10,
      reason: "A decision maker is identified.",
      when: { key: "decisionMakerKnown", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    ...engagementCommon(),
    rule({
      id: "requested_quote",
      part: "engagement",
      name: "Requested a quote",
      points: 16,
      reason: "Requested a quote.",
      when: { key: "requestedQuote", op: "true" },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "booked_estimate",
      part: "engagement",
      name: "Booked an estimate",
      points: 22,
      reason: "Booked an estimate.",
      when: { key: "booked", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "opened_quote",
      part: "engagement",
      name: "Opened a quote",
      points: 6,
      reason: "Opened the quote.",
      when: { key: "openedQuote", op: "true" },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "quiet_14",
      part: "engagement",
      name: "No reply in 14 days",
      points: -16,
      reason: "No reply in 14 days.",
      when: { key: "leadSilenceDays", op: "gte", value: 14 },
      callBased: false,
      evidence: "activity",
    }),
    ...callCommon(),
  ];
}

function medSpaRules(): ScoreRule[] {
  return [
    ...fitCommon(),
    rule({
      id: "high_value_treatment",
      part: "fit",
      name: "Higher value treatment",
      points: 18,
      reason: "Interested in a higher value treatment or package.",
      when: { key: "serviceHighValue", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "service_match",
      part: "fit",
      name: "Treatment offered",
      points: 12,
      reason: "Asked about a treatment you offer.",
      when: { key: "serviceMatch", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "travel_ok",
      part: "fit",
      name: "Inside travel range",
      points: 10,
      reason: "Inside your travel range.",
      when: { key: "travelWithinLimit", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "travel_far",
      part: "fit",
      name: "Outside travel range",
      points: -18,
      reason: "Outside your travel range.",
      when: { key: "travelWithinLimit", op: "false" },
      callBased: false,
      evidence: "field",
    }),
    ...engagementCommon(),
    rule({
      id: "booked_consult",
      part: "engagement",
      name: "Booked a consultation",
      points: 22,
      reason: "Booked a consultation.",
      when: { key: "booked", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "paid_deposit",
      part: "engagement",
      name: "Paid a deposit",
      points: 18,
      reason: "Paid a deposit.",
      when: { key: "paidDeposit", op: "true" },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "quiet_21",
      part: "engagement",
      name: "No reply in 21 days",
      points: -16,
      reason: "No reply in 21 days.",
      when: { key: "leadSilenceDays", op: "gte", value: 21 },
      callBased: false,
      evidence: "activity",
    }),
    ...callCommon(),
  ];
}

function coachRules(): ScoreRule[] {
  return [
    ...fitCommon(),
    rule({
      id: "application",
      part: "fit",
      name: "Application submitted",
      points: 16,
      reason: "Submitted an application.",
      when: { key: "applicationSubmitted", op: "true" },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "program_match",
      part: "fit",
      name: "Program match",
      points: 14,
      reason: "Matches the program's target client.",
      when: { key: "programMatch", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    rule({
      id: "service_match",
      part: "fit",
      name: "Program offered",
      points: 8,
      reason: "Asked about a program you offer.",
      when: { key: "serviceMatch", op: "true" },
      callBased: false,
      evidence: "field",
    }),
    ...engagementCommon(),
    rule({
      id: "booked_call",
      part: "engagement",
      name: "Booked a call",
      points: 20,
      reason: "Booked a call.",
      when: { key: "booked", op: "true" },
      callBased: false,
      evidence: "booking",
    }),
    rule({
      id: "opened_materials",
      part: "engagement",
      name: "Opened materials",
      points: 6,
      reason: "Opened the materials you sent.",
      when: { key: "openedMaterials", op: "true" },
      callBased: false,
      evidence: "activity",
    }),
    rule({
      id: "quiet_21",
      part: "engagement",
      name: "No reply in 21 days",
      points: -16,
      reason: "No reply in 21 days.",
      when: { key: "leadSilenceDays", op: "gte", value: 21 },
      callBased: false,
      evidence: "activity",
    }),
    ...callCommon(),
    rule({
      id: "needs_approval_no_step",
      part: "call",
      name: "Needs approval with no follow-up",
      points: -12,
      reason: "Needs someone else's approval and no follow-up is booked.",
      when: { key: "decisionOnCall", op: "eq", value: "needs_someone_else" },
      callBased: true,
      evidence: "case_file",
    }),
  ];
}

const BUILDERS: Record<TemplateSlug, () => ScoreRule[]> = {
  "home-services": homeServicesRules,
  "med-spa": medSpaRules,
  "coaches-consultants": coachRules,
};

export function templateRuleset(template: TemplateSlug, id = `template:${template}`): Ruleset {
  const rules = BUILDERS[template]();
  assertRulesFair(rules);
  return {
    id,
    version: 1,
    template,
    weights: { ...DEFAULT_WEIGHTS },
    tiers: { ...DEFAULT_TIERS },
    decayDays: DECAY[template],
    confidenceMin: "medium",
    triggers: triggers(QUIET_DAYS[template]),
    caps: { ...DEFAULT_CAPS },
    rules,
    note: "Industry defaults.",
  };
}

export function templateForSlug(slug: string | null | undefined): TemplateSlug {
  if (slug === "med-spa" || slug === "coaches-consultants" || slug === "home-services") return slug;
  return "home-services";
}

export function cloneRuleset(ruleset: Ruleset, patch: Partial<Ruleset> & { id: string; version: number; note: string }): Ruleset {
  const next: Ruleset = {
    ...ruleset,
    ...patch,
    weights: patch.weights ?? { ...ruleset.weights },
    tiers: patch.tiers ?? { ...ruleset.tiers },
    triggers: patch.triggers ?? { ...ruleset.triggers },
    caps: patch.caps ?? { ...ruleset.caps },
    rules: patch.rules ?? ruleset.rules.map((rule) => ({ ...rule, when: { ...rule.when } })),
  };
  assertRulesFair(next.rules);
  const sum = next.weights.fit + next.weights.engagement + next.weights.call;
  if (Math.round(sum) !== 100) throw new Error("Weights must add up to 100.");
  for (const weight of Object.values(next.weights)) {
    if (weight < 10 || weight > 60) throw new Error("Each weight must stay between 10 and 60.");
  }
  return next;
}
