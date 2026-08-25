/**
 * Every measure this prompt computes. If a key is not in this list, it must
 * not be computed. If it is in this list, it must appear on the rep's view.
 */
export const CALL_QUALITY_MEASURES = [
  {
    key: "speakers_attributed",
    label: "Whether speakers could be attributed",
    where: "call",
    kind: "structural",
  },
  {
    key: "talk_ratio_rep",
    label: "Talk ratio (rep share of attributed words)",
    where: "call",
    kind: "structural",
  },
  {
    key: "talk_ratio_prospect",
    label: "Talk ratio (prospect share of attributed words)",
    where: "call",
    kind: "structural",
  },
  {
    key: "question_count",
    label: "Question count",
    where: "call",
    kind: "structural",
  },
  {
    key: "open_question_count",
    label: "Open questions",
    where: "call",
    kind: "structural",
  },
  {
    key: "closed_question_count",
    label: "Closed questions",
    where: "call",
    kind: "structural",
  },
  {
    key: "longest_rep_monologue_words",
    label: "Longest uninterrupted rep monologue (words)",
    where: "call",
    kind: "structural",
  },
  {
    key: "duration_seconds",
    label: "Call duration",
    where: "call",
    kind: "structural",
  },
  {
    key: "typical_duration_seconds",
    label: "Org typical duration for this call type",
    where: "call",
    kind: "structural",
  },
  {
    key: "next_step_stated",
    label: "Whether a next step was stated",
    where: "call",
    kind: "outcome",
  },
  {
    key: "next_step_agreed",
    label: "Whether a next step was agreed",
    where: "call",
    kind: "outcome",
  },
  {
    key: "commitment_clarity",
    label: "Whether the next step was specific with a time, or vague",
    where: "call",
    kind: "outcome",
  },
  {
    key: "discovery_pain",
    label: "Whether pain was explored",
    where: "call",
    kind: "substantive",
  },
  {
    key: "discovery_timeline",
    label: "Whether timeline was explored",
    where: "call",
    kind: "substantive",
  },
  {
    key: "discovery_budget",
    label: "Whether investment capacity was explored",
    where: "call",
    kind: "substantive",
  },
  {
    key: "discovery_authority",
    label: "Whether decision authority was explored",
    where: "call",
    kind: "substantive",
  },
  {
    key: "objection_handling",
    label: "For each objection: addressed, deflected, or ignored",
    where: "call",
    kind: "outcome",
  },
  {
    key: "open_objections_addressed",
    label: "Whether open objections from the brief were addressed",
    where: "call",
    kind: "outcome",
  },
  {
    key: "brief_opened_before_call",
    label: "Whether the brief was opened before the call",
    where: "call",
    kind: "outcome",
  },
  {
    key: "discovery_skip_counts",
    label: "Which readiness factors were not explored, as counts",
    where: "pattern",
    kind: "substantive",
  },
  {
    key: "objection_lost_most",
    label: "Which objection this rep loses to most often",
    where: "pattern",
    kind: "outcome",
  },
  {
    key: "close_rate_by_band",
    label: "Close rate within score bands (never raw across unequal queues)",
    where: "pattern",
    kind: "outcome",
  },
  {
    key: "closed_vs_lost_structure",
    label: "How this rep's closed calls differed structurally from lost ones",
    where: "pattern",
    kind: "substantive",
  },
  {
    key: "best_calls",
    label: "Own calls that closed, so they can be listened to again",
    where: "pattern",
    kind: "outcome",
  },
  {
    key: "work_on",
    label: "One or two things to work on, with examples from their own calls",
    where: "pattern",
    kind: "outcome",
  },
  {
    key: "what_works",
    label: "What differed on closed vs lost calls in this business",
    where: "org",
    kind: "substantive",
  },
  {
    key: "gaming_signal",
    label: "A structural shift without a corresponding outcome change",
    where: "pattern",
    kind: "outcome",
  },
  {
    key: "team_comparison",
    label: "Team patterns (available, not forced, never a rank)",
    where: "pattern",
    kind: "substantive",
  },
] as const;

export type CallQualityMeasureKey = (typeof CALL_QUALITY_MEASURES)[number]["key"];

/** Where each catalog key is actually rendered on the rep's coaching view or call page. */
export const CALL_QUALITY_MEASURE_SURFACES: Record<CallQualityMeasureKey, string> = {
  speakers_attributed: "Your calls table and the call page",
  talk_ratio_rep: "Your calls table and the call page",
  talk_ratio_prospect: "Your calls table and the call page",
  question_count: "Your calls table and the call page",
  open_question_count: "Your calls table and the call page",
  closed_question_count: "Your calls table and the call page",
  longest_rep_monologue_words: "Your calls table and the call page",
  duration_seconds: "Your calls table and the call page",
  typical_duration_seconds: "Your calls table and the call page",
  next_step_stated: "Your calls table and the call page",
  next_step_agreed: "Your calls table and the call page",
  commitment_clarity: "Your calls table and the call page",
  discovery_pain: "Your calls table and the call page",
  discovery_timeline: "Your calls table and the call page",
  discovery_budget: "Your calls table and the call page",
  discovery_authority: "Your calls table and the call page",
  objection_handling: "Your calls table and the call page",
  open_objections_addressed: "Your calls table and the call page",
  brief_opened_before_call: "Your calls table and the call page",
  discovery_skip_counts: "Your patterns",
  objection_lost_most: "Your patterns",
  close_rate_by_band: "Your patterns",
  closed_vs_lost_structure: "Your patterns",
  best_calls: "Calls of yours that closed",
  work_on: "Things to work on",
  what_works: "What closed calls looked like here",
  gaming_signal: "A structural number moved without the outcome",
  team_comparison: "Compare with team patterns",
};

export const FORBIDDEN_MEASURE_PATTERNS = [
  /personality/i,
  /enthusiasm/i,
  /confidence_rating/i,
  /confidence_score/i,
  /leaderboard/i,
  /rank_position/i,
  /performance_rating/i,
  /grade/i,
] as const;
