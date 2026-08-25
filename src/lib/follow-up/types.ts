import type { Enums } from "@/types/database";

export type FollowUpBranch = Enums<"follow_up_branch">;
export type FollowUpDraftStatus = Enums<"follow_up_draft_status">;
export type FollowUpChannel = "sms" | "email";
export type FollowUpQualityFailure = Enums<"follow_up_quality_failure">;
export type VoiceFormality = Enums<"voice_formality">;
export type VoiceEmoji = Enums<"voice_emoji">;

export type RoutingPredicate = {
  field:
    | "call_outcome"
    | "next_step_state"
    | "next_step_text"
    | "stated_objection_state"
    | "lead_status"
    | "no_show_count";
  op: "eq" | "neq" | "in" | "matches" | "gte";
  value: string | string[] | number;
};

export type RoutingMatch = {
  all: RoutingPredicate[];
};

export type SequenceStep = {
  delayHours: number;
  channel?: FollowUpChannel;
};

export type RoutingRule = {
  id?: string;
  priority: number;
  branch: FollowUpBranch;
  enabled: boolean;
  match: RoutingMatch;
  channel: FollowUpChannel;
  sequenceSteps: SequenceStep[];
};

export type RoutingContext = {
  callOutcome: Enums<"call_outcome"> | null;
  nextStepState: Enums<"extraction_signal_state">;
  nextStepText: string | null;
  statedObjectionState: Enums<"extraction_signal_state">;
  leadStatus: Enums<"lead_status">;
  noShowCount: number;
};

export type VoiceExample = {
  body: string;
  channel: FollowUpChannel;
  addedAt: string;
  sourceDraftId?: string | null;
};

export type VoiceProfile = {
  formality: VoiceFormality;
  useContractions: boolean;
  useGreeting: boolean;
  useSignoff: boolean;
  greetingText: string | null;
  signoffText: string | null;
  smsMaxChars: number;
  emailMaxChars: number;
  emojiUsage: VoiceEmoji;
  bannedWords: string[];
  examples: VoiceExample[];
};

export type FollowUpSettings = {
  sequencesHalted: boolean;
  maxSequenceLength: number;
  maxSequenceDurationDays: number;
  draftStaleDays: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultChannel: FollowUpChannel;
};

export type QualityFailure = {
  type: FollowUpQualityFailure;
  detail: string;
};

export type QualityResult =
  | { ok: true }
  | { ok: false; failures: QualityFailure[] };

export type PendingFollowUpItem = {
  id: string;
  leadId: string;
  leadName: string;
  callId: string;
  branch: FollowUpBranch;
  channel: FollowUpChannel;
  status: FollowUpDraftStatus;
  lowConfidence: boolean;
  lowConfidenceReason: string | null;
  expiresAt: string;
  createdAt: string;
  sequencePosition: number;
  sequenceRunId: string | null;
  stale: boolean;
  failureReason: string | null;
};

export type ActiveSequenceItem = {
  id: string;
  branch: FollowUpBranch;
  status: Enums<"follow_up_sequence_status">;
  haltReason: Enums<"follow_up_halt_reason"> | null;
  nextPosition: number;
  maxSteps: number;
  maxUntil: string;
  startedAt: string;
};

export type FollowUpReviewPayload = {
  draft: {
    id: string;
    orgId: string;
    leadId: string;
    callId: string;
    extractionId: string | null;
    branch: FollowUpBranch;
    channel: FollowUpChannel;
    status: FollowUpDraftStatus;
    generatedBody: string;
    generatedSubject: string | null;
    editedBody: string;
    editedSubject: string | null;
    sentBody: string | null;
    modelVersion: string;
    lowConfidence: boolean;
    lowConfidenceReason: string | null;
    expiresAt: string;
    stale: boolean;
    sequencePosition: number;
    sequenceRunId: string | null;
    approvedAt: string | null;
    failureReason: string | null;
    quotesUsed: string[];
    verificationStatus: "unchecked" | "passed" | "needs_review";
    verificationFaults: Array<{ code: string; where: string; what: string }>;
  };
  lead: {
    id: string;
    name: string;
    firstName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    offerName: string | null;
    timezone: string | null;
  };
  canApprove: boolean;
  call: {
    id: string;
    outcome: Enums<"call_outcome"> | null;
    occurredAt: string | null;
    scheduledAt: string | null;
  };
  extraction: {
    summary: string | null;
    statedObjection: string | null;
    quotes: Array<{ text: string; topic: string }>;
    nextStepAgreed: string | null;
    nextStepState: Enums<"extraction_signal_state">;
    budgetSignalState: Enums<"extraction_signal_state">;
  };
  settings: FollowUpSettings;
  orgTimezone: string;
  proposedSendAt: string;
};
