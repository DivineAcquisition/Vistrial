import type { Enums, Json } from "@/types/database";
import type { ProfileStage } from "@/lib/profile/stages";

/** Where a pre-filled value came from, so the client can judge it. */
export type DefaultSource = "saved" | "derived" | "prior" | "fallback";

export type ProfileDefault = {
  value: unknown;
  source: DefaultSource;
  basis: string;
  /** Only on lead_channels: the raw source strings the CRM has already sent. */
  crmSources?: string[];
};

export type ProfileDefaults = Record<string, ProfileDefault>;

export type RegistryField = {
  field: string;
  stage: ProfileStage;
  label: string;
  consumer: string;
  required: boolean;
};

export type CompletenessGap = {
  field: string;
  stage: ProfileStage;
  label: string;
  consumer: string;
};

export type Completeness = {
  score: number;
  answered: number;
  total: number;
  gaps: CompletenessGap[];
  usableMin: number;
};

export type StageProgress = {
  stage: ProfileStage;
  completedAt: string | null;
  completedByMemberId: string | null;
};

export type ProfileVersion = {
  version: number;
  changedFields: string[];
  createdAt: string;
  actorName: string | null;
};

export type ReviewPrompt = {
  id: string;
  reason: Enums<"profile_review_reason">;
  detail: string;
  detectedAt: string;
};

export type Contradiction = {
  id: string;
  kind: Enums<"profile_contradiction_kind">;
  stated: string;
  observed: string;
  sampleN: number;
  detectedAt: string;
};

export type BenchmarkRow = {
  metric: Enums<"benchmark_metric">;
  cohortMedian: number;
  orgCount: number;
  ownValue: number | null;
  ownSampleN: number | null;
  ownSource: string | null;
};

export type Benchmark = {
  shown: boolean;
  orgCount: number;
  minCohort: number;
  rows: BenchmarkRow[];
  basis: string | null;
  plain: string | null;
};

export type PatternSuggestion = {
  key: string;
  plain: string;
  basis: string | null;
};

export type ActivationRequirement = {
  key: Enums<"activation_requirement">;
  ok: boolean;
  label: string;
  detail: string;
};

export type ActivationWarning = {
  key: Enums<"activation_warning">;
  label: string;
  detail: string;
  affects: string[];
};

export type ActivationRecord = {
  activatedAt: string;
  warningsAcknowledged: Enums<"activation_warning">[];
  requirements: ActivationRequirement[];
};

export type ActivationReadiness = {
  activatedAt: string | null;
  hard: ActivationRequirement[];
  blocked: boolean;
  warnings: ActivationWarning[];
  completeness: Completeness;
  record: ActivationRecord | null;
};

export type ActivationChange = {
  previousAt: string;
  newAt: string;
  reason: string;
  createdAt: string;
  actorName: string | null;
};

export type ProfileRow = {
  orgId: string;
  version: number;
  offerName: string | null;
  offerType: Enums<"profile_offer_type"> | null;
  offerTypeOther: string | null;
  pricePointCents: number | null;
  paymentStructure: Enums<"profile_payment_structure"> | null;
  paymentStructureOther: string | null;
  salesCycleDays: number | null;
  touchesToClose: number | null;
  closeMotion: Enums<"profile_close_motion"> | null;
  teamStructure: Enums<"profile_team_structure"> | null;
  monthlyLeadVolume: number | null;
  monthlyLeadTarget: number | null;
  statedCloseRatePct: number | null;
  leadChannels: Enums<"profile_lead_channel">[];
  leadChannelsOther: string | null;
  channelSpendCents: Record<string, number>;
  applicationFields: ApplicationField[];
  qualificationSignals: Enums<"profile_qualification_signal">[];
  qualificationSignalsOther: string | null;
  disqualifiers: Enums<"profile_disqualifier">[];
  disqualifiersOther: string | null;
  priceBands: ScoreBand[];
  timelineBands: ScoreBand[];
  speedToLeadIntentMinutes: number | null;
  setterEstablishes: Enums<"profile_setter_fact">[];
  setterEstablishesOther: string | null;
  pipelineStageMeanings: StageMeaning[];
  afterNoShow: Enums<"profile_existing_followup"> | null;
  afterCall: Enums<"profile_existing_followup"> | null;
  afterSilence: Enums<"profile_existing_followup"> | null;
  topObjections: ProfileObjection[];
  neverSay: string[];
  voiceFormality: Enums<"voice_formality"> | null;
  channelPreference: "sms" | "email" | null;
  goalMetric: Enums<"profile_goal_metric"> | null;
  goalValue: number | null;
  aggregateOptOut: boolean;
  completenessScore: number;
  lastReviewedAt: string | null;
};

export type ApplicationField = {
  answerKey: string;
  question: string | null;
  factor: Enums<"score_factor"> | null;
};

export type ScoreBand = {
  answer: string;
  score: number;
  label?: string | null;
};

export type StageMeaning = {
  crmStage: string;
  means: Enums<"lead_status"> | null;
};

export type ProfileObjection = {
  type: Enums<"objection_type">;
  phrasing: string;
  response: string | null;
};

export type BusinessProfileState = {
  profile: ProfileRow;
  completeness: Completeness;
  registry: RegistryField[];
  stages: StageProgress[];
  versions: ProfileVersion[];
  reviewPrompts: ReviewPrompt[];
  contradictions: Contradiction[];
  benchmark: Benchmark;
  patternFeedback: PatternSuggestion[];
  activation: ActivationReadiness;
  activationChanges: ActivationChange[];
  activatedByName: string | null;
  latestLeakReport: { id: string; basis: Enums<"leak_report_basis">; generatedAt: string } | null;
};

export type ProfilePatch = Record<string, Json>;
