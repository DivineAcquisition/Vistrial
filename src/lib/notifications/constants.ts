/** Prompt 13 constants. Numbers the prompt did not name are listed here. */

export const NOTIFICATION_HOURLY_CAP = 8;
export const NOTIFICATION_BATCH_WINDOW_MS = 10 * 60 * 1000;
export const NOTIFICATION_MUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_PRESENCE_TTL_MS = 45 * 1000;
export const NOTIFICATION_CLAIM_LEASE_MS = 2 * 60 * 1000;
export const NOTIFICATION_MAX_ATTEMPTS = 8;
export const CALL_SOON_MS = 30 * 60 * 1000;
export const UNMATCHED_ESCALATE_COUNT = 5;
export const UNMATCHED_ESCALATE_AGE_MS = 24 * 60 * 60 * 1000;
export const DAILY_BRIEF_WINDOW_MINUTES = 15;
export const FATIGUE_OVERFLOW_DAYS = 7;
export const FATIGUE_PUSH_PER_DAY = 50;
export const JOB_FAILURE_LOOKBACK_MS = 3 * 60 * 60 * 1000;
export const GHOST_DETECTOR_STALE_MS = 36 * 60 * 60 * 1000;
/** SMS is a later channel, never simultaneous with the first push. */
export const SMS_EMERGENCY_DELAY_MS = 60 * 60 * 1000;

export const OPEN_LEAD_STATUSES = [
  "new",
  "working",
  "call_booked",
  "no_show",
  "follow_up",
  "objection_hold",
] as const;

export const USER_PREF_EVENTS = [
  "speed_to_lead",
  "unassigned_ready",
  "approaching_ghost",
  "pending_draft",
  "call_starting_soon",
  "unmatched_transcript",
  "ingestion_stalled",
  "crm_broken",
  "adoption_warning",
  "daily_brief",
] as const;

export const USER_PREF_CHANNELS = ["push", "email", "sms"] as const;

export function notificationBatchBucket(
  now: Date,
  windowMs = NOTIFICATION_BATCH_WINDOW_MS
): number {
  return Math.floor(now.getTime() / windowMs);
}

export const DEFAULT_WORKING_HOURS_START = "08:00";
export const DEFAULT_WORKING_HOURS_END = "18:00";
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5] as const;

export const NOTIFICATION_EVENT_TYPES = [
  "speed_to_lead",
  "unassigned_ready",
  "approaching_ghost",
  "pending_draft",
  "call_starting_soon",
  "unmatched_transcript",
  "ingestion_stalled",
  "crm_broken",
  "job_failure",
  "adoption_warning",
  "daily_brief",
  "hourly_summary",
  "test_send",
] as const;

export const INTERRUPT_CHANNELS = ["push", "email", "sms", "team"] as const;

export const EMERGENCY_EVENTS = new Set(["ingestion_stalled", "crm_broken"]);

/** Admin/owner targets cannot be silenced for these. */
export const ESCALATION_LOCKED_EVENTS = new Set([
  "speed_to_lead",
  "pending_draft",
  "ingestion_stalled",
  "crm_broken",
]);
