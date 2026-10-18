/**
 * Assay score model. Rules fill signals and points. Nothing here calls a model.
 */

export const ASSAY_PARTS = ["fit", "engagement", "call"] as const;
export type AssayPart = (typeof ASSAY_PARTS)[number];

export const TIERS = ["hot", "warm", "cool", "cold"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
  cold: "Cold",
};

export const TEMPLATE_SLUGS = ["home-services", "med-spa", "coaches-consultants"] as const;
export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

export type QueueOrderMode = "best" | "oldest";

export type ScoreMode = "live" | "historic" | "rules_change" | "nightly";

export type TriggerId = "became_hot" | "big_jump" | "going_quiet" | "hot_no_show";

export type Confidence = "low" | "medium" | "high";

export type TimelineSignal = "ready_now" | "within_30" | "within_90" | "later" | "unknown";
export type BudgetFitSignal = "fits" | "does_not_fit" | "unknown";
export type DecisionSignal = "on_call" | "needs_someone_else" | "unknown";
export type NextStepSignal = "booked" | "quote" | "decision_date" | "none" | "unknown";
export type RedFlag = "price_shopping" | "outside_scope";

export type SignalValue<T extends string> = { value: T; confidence: Confidence };

export type CallSignals = {
  timeline: SignalValue<TimelineSignal>;
  budgetFit: SignalValue<BudgetFitSignal>;
  decisionMaker: SignalValue<DecisionSignal>;
  objectionResolved: SignalValue<"yes" | "no" | "unknown">;
  buyingIntent: SignalValue<"yes" | "no" | "unknown">;
  nextStep: SignalValue<NextStepSignal>;
  redFlags: SignalValue<RedFlag>[];
  /** Days since the call that produced these signals. */
  ageDays: number;
};

export type EvidenceKind = "activity" | "booking" | "stage" | "case_file" | "field" | "source";

export type RuleWhen = {
  key: string;
  op: "true" | "false" | "eq" | "gte" | "lte";
  value?: string | number;
};

export type ScoreRule = {
  id: string;
  part: AssayPart;
  name: string;
  points: number;
  reason: string;
  enabled: boolean;
  /** Missing input is neutral unless staff set this to negative. */
  missing: "neutral" | "negative";
  when: RuleWhen;
  callBased: boolean;
  evidence: EvidenceKind;
};

export type PartWeights = { fit: number; engagement: number; call: number };

export type TierThresholds = {
  hot: number;
  warm: number;
  cool: number;
  stickiness: number;
};

export type TriggerSettings = {
  becameHot: boolean;
  bigJump: boolean;
  bigJumpPoints: number;
  goingQuiet: boolean;
  goingQuietDays: number;
  hotNoShow: boolean;
};

export type CapSettings = {
  tasksPerPersonPerDay: number;
  tasksPerWorkspacePerDay: number;
  draftsPerWorkspacePerDay: number;
  triggerCooldownHours: number;
};

export type Ruleset = {
  id: string;
  version: number;
  template: TemplateSlug;
  weights: PartWeights;
  tiers: TierThresholds;
  decayDays: number;
  confidenceMin: Confidence;
  triggers: TriggerSettings;
  caps: CapSettings;
  rules: ScoreRule[];
  note: string;
};

export type FiredRule = {
  ruleId: string;
  part: AssayPart;
  points: number;
  reason: string;
  callBased: boolean;
  evidence: EvidenceKind;
  /** Optional record id the screen can link. Never message text. */
  evidenceId: string | null;
};

export type ScoreResult = {
  score: number;
  tier: Tier;
  rawTier: Tier;
  early: boolean;
  noCall: boolean;
  callPending: boolean;
  parts: { fit: number; engagement: number; call: number };
  weightsUsed: PartWeights;
  fired: FiredRule[];
  unclearCall: number;
  fingerprint: string;
};

export type ScoringFacts = {
  serviceMatch: boolean | null;
  serviceHighValue: boolean | null;
  dealValueFit: "within" | "above" | "below" | null;
  insideServiceArea: boolean | null;
  travelWithinLimit: boolean | null;
  /** Null until the source has enough closed history. */
  sourceQuality: "strong" | "weak" | null;
  contactComplete: boolean | null;
  decisionMakerKnown: boolean | null;
  custom: Record<string, boolean | null>;
  requestedQuote: boolean;
  booked: boolean;
  rescheduledByLead: boolean;
  canceled: boolean;
  noShow: boolean;
  completedMeeting: boolean;
  /** Fastest lead reply in minutes, or null when the lead has not replied. */
  replyMinutes: number | null;
  twoWayCount14d: number;
  openedQuote: boolean;
  openedMaterials: boolean;
  reopened: boolean;
  stageMove: "forward" | "back" | "none";
  inboundIntent: boolean;
  paidDeposit: boolean;
  applicationSubmitted: boolean;
  programMatch: boolean | null;
  /** Days since the lead last did something. Team outreach does not reset this. */
  leadSilenceDays: number;
  /** Days since anyone on the team touched the lead. */
  teamSilenceDays: number;
  call: CallSignals | null;
  callPending: boolean;
  doNotContact: boolean;
  optedOut: boolean;
  closed: boolean;
};

export function emptyFacts(): ScoringFacts {
  return {
    serviceMatch: null,
    serviceHighValue: null,
    dealValueFit: null,
    insideServiceArea: null,
    travelWithinLimit: null,
    sourceQuality: null,
    contactComplete: null,
    decisionMakerKnown: null,
    custom: {},
    requestedQuote: false,
    booked: false,
    rescheduledByLead: false,
    canceled: false,
    noShow: false,
    completedMeeting: false,
    replyMinutes: null,
    twoWayCount14d: 0,
    openedQuote: false,
    openedMaterials: false,
    reopened: false,
    stageMove: "none",
    inboundIntent: false,
    paidDeposit: false,
    applicationSubmitted: false,
    programMatch: null,
    leadSilenceDays: 0,
    teamSilenceDays: 0,
    call: null,
    callPending: false,
    doNotContact: false,
    optedOut: false,
    closed: false,
  };
}
