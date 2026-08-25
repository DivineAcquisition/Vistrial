/** Two generation attempts, then a person. Never a third loop. */
export const VERIFICATION_MAX_ATTEMPTS = 2;

export const VERIFICATION_TASKS = [
  "extraction",
  "draft",
  "agent_plan",
  "agent_response",
  "reporting",
] as const;

export type VerificationTask = (typeof VERIFICATION_TASKS)[number];

export const VERIFICATION_STAGES = ["deterministic", "model", "none"] as const;
export type VerificationStage = (typeof VERIFICATION_STAGES)[number];

export const VERIFICATION_FINAL_STATES = [
  "passed",
  "flagged",
  "corrected",
  "blocked",
  "skipped",
] as const;
export type VerificationFinalState = (typeof VERIFICATION_FINAL_STATES)[number];

export const VERIFICATION_SUBJECT_TYPES = [
  "call_extraction",
  "follow_up_draft",
  "operator_confirmation",
  "operator_run",
  "reporting_panel",
] as const;

export type VerificationSubjectType = (typeof VERIFICATION_SUBJECT_TYPES)[number];

/** Smaller than the Opus draft model. Measured in the ops console, not assumed. */
export const DEFAULT_ANTHROPIC_VERIFIER_MODEL = "claude-sonnet-4-6";

/** Pass-rate alert: a verifier that almost never finds faults is not working. */
export const PASS_RATE_ALERT_MIN_N = 20;
export const PASS_RATE_ALERT_THRESHOLD = 0.98;

/** Injected-fault catch rate below this is poor accuracy; DA should turn the task off. */
export const INJECTED_CATCH_ALERT_MIN_N = 4;
export const INJECTED_CATCH_ALERT_THRESHOLD = 0.5;

export const SAMPLE_AUDIT_BATCH = 5;
export const SAMPLE_AUDIT_LOOKBACK_DAYS = 7;

export const VERIFIER_MAX_TOKENS = 1200;
export const VERIFIER_TIMEOUT_MS = 30_000;
