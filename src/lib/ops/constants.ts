/** Product numbers Prompt 14 did not name. Stated here, not guessed ad hoc. */

export const TRANSCRIPT_RETENTION_DEFAULT_DAYS = 365;
export const TRANSCRIPT_RETENTION_MIN_DAYS = 30;
export const TRANSCRIPT_RETENTION_MAX_DAYS = 1095;
export const WEBHOOK_PAYLOAD_RETENTION_DAYS = 14;
export const NOTIFICATION_RETENTION_DAYS = 90;
export const OFFBOARD_GRACE_DAYS = 30;

/** Lead quiet window when a CRM location is connected. */
export const LEAD_QUIET_MS = 6 * 60 * 60 * 1000;
/** Transcript quiet window when a recorder is connected. */
export const TRANSCRIPT_QUIET_MS = 48 * 60 * 60 * 1000;

export const EXTRACTION_FAILURE_WINDOW_HOURS = 24;
export const EXTRACTION_FAILURE_MIN_N = 10;
export const EXTRACTION_FAILURE_RATE = 0.2;

export const DRAFT_REJECTION_WINDOW_DAYS = 7;
export const DRAFT_REJECTION_MIN_N = 10;
export const DRAFT_REJECTION_RATE = 0.3;

export const AUTH_WINDOW_SECONDS = 15 * 60;
export const AUTH_MAX_ATTEMPTS = 8;
export const WEBHOOK_WINDOW_SECONDS = 60;
export const WEBHOOK_MAX_PER_WINDOW = 120;
export const MARKETING_WINDOW_SECONDS = 60;
export const MARKETING_MAX_PER_WINDOW = 60;

/**
 * Anthropic list prices used to attribute spend from token logs.
 * Invoice rates can differ; the ops view labels these as estimated.
 * Sonnet 4.6 input/output per million tokens; Opus 4.6 for drafting.
 */
export const MODEL_RATES_USD_PER_MTIME = {
  defaultInput: 3,
  defaultOutput: 15,
  opusInput: 15,
  opusOutput: 75,
} as const;

export const OPS_JOB_NAMES = [
  "ghost-detector",
  "ghl-ingest",
  "transcripts",
  "baseline-backfill",
  "reporting",
  "profile",
  "notifications",
  "ops-health",
  "retention",
  "calibration",
  "call-quality",
  "verification-audit",
  "portal-email",
  "source-sync",
  "agent-runtime",
  "forsight-meta-sync",
] as const;

export type OpsJobName = (typeof OPS_JOB_NAMES)[number];
