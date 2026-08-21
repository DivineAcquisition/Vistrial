import type { HardRequirementId, SetupStepId, WarningId } from "@/lib/onboarding/constants";

export type { SetupStepId, HardRequirementId, WarningId };

export type SetupStepState = {
  id: SetupStepId;
  complete: boolean;
  locked: boolean;
};

export type GateRequirement = {
  id: HardRequirementId;
  ok: boolean;
  label: string;
  fixStep: SetupStepId;
  detail: string | null;
};

export type GateWarning = {
  id: WarningId;
  applies: boolean;
  label: string;
  consequence: string;
};

export type ActivationGate = {
  orgId: string;
  activatedAt: string | null;
  canActivate: boolean;
  hard: GateRequirement[];
  warnings: GateWarning[];
  memberCount: number;
  voiceExampleCount: number;
  transcriptChoice: "connected" | "manual" | null;
  baselineFallback: "self_reported" | "declined" | null;
  lastVisitedStep: SetupStepId;
};

export type OrgSetupState = {
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    activatedAt: string | null;
  };
  lastVisitedStep: SetupStepId;
  steps: SetupStepState[];
  gate: ActivationGate;
  backfill: {
    status: string;
    grade: string | null;
    gradeReasons: string[];
  } | null;
};

export type FirstWeekHealth = {
  activatedAt: string | null;
  hoursSinceActivation: number | null;
  zeroIngestWarning: boolean;
  leadsIngested: number;
  touchCoverage: { k: number; n: number };
  outcomeLoggingRate: { k: number; n: number };
  drafts: { approved: number; rejected: number };
  unmatchedTranscripts: { count: number; oldestReceivedAt: string | null };
  bypass: string | null;
};

export type GoliveStepId =
  | "ingest"
  | "score"
  | "queue"
  | "alarm"
  | "touch"
  | "brief"
  | "draft"
  | "cleanup";

export type GoliveStepResult = {
  id: GoliveStepId;
  ok: boolean;
  label: string;
  detail: string;
  fixStep: SetupStepId | null;
};

export type GoliveRunResult = {
  ok: boolean;
  runId: string;
  steps: GoliveStepResult[];
};

export type StaffOrgRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  activatedAt: string | null;
  createdAt: string;
  crmStatus: string | null;
  lastVerifiedAt: string | null;
  locationName: string | null;
  backfillGrade: string | null;
  backfillStatus: string | null;
  lastEventAt: string | null;
  unprocessedEvents: number;
  leadsSinceActivation: number;
  activeMembers: number;
  voiceExamples: number | null;
  transcriptChoice: string | null;
  fieldMapsSaved: boolean;
  ingestionBroken: boolean;
  ingestionPriority: number;
  outcomePerHundred: number | null;
  outcomeTooSmall: boolean | null;
  outcomeMature: boolean;
};
