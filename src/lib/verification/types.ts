import type {
  VerificationFinalState,
  VerificationStage,
  VerificationSubjectType,
  VerificationTask,
} from "@/lib/verification/constants";

export type VerificationFault = {
  code: string;
  where: string;
  what: string;
};

export type DeterministicCheckResult = {
  ok: boolean;
  faults: VerificationFault[];
  /** Sanitized output when the check drops invalid pieces instead of failing. */
  sanitized?: unknown;
};

export type ModelVerifyResult = {
  invoked: boolean;
  faults: VerificationFault[];
  wouldEmbarrass: boolean | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  skippedReason: "disabled" | "deterministic_failed" | "reporting" | null;
};

export type VerificationRecordInput = {
  orgId: string;
  task: VerificationTask;
  subjectType: VerificationSubjectType;
  subjectId: string;
  attempt: number;
  retryHappened: boolean;
  stageCaught: VerificationStage;
  finalState: VerificationFinalState;
  faults: VerificationFault[];
  modelInvoked: boolean;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  skippedReason?: string | null;
};

export type BoundedAttemptResult<T> = {
  output: T;
  attempt: number;
  retryHappened: boolean;
  finalState: VerificationFinalState;
  stageCaught: VerificationStage;
  faults: VerificationFault[];
  modelInvoked: boolean;
  verificationModel: string | null;
  inputTokens: number;
  outputTokens: number;
  skippedReason: ModelVerifyResult["skippedReason"];
};
