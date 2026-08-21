export const DEFAULT_ANTHROPIC_DRAFT_MODEL = "claude-opus-4-6";

export const FOLLOW_UP_MAX_ATTEMPTS = 8;

/** Product choice: a follow-up drafted for a call five days ago is stale. */
export const DEFAULT_DRAFT_STALE_DAYS = 5;

/** Product choice: quiet hours 21:00–08:00 local, on by default. */
export const DEFAULT_QUIET_START = "21:00";
export const DEFAULT_QUIET_END = "08:00";

export const DEFAULT_MAX_SEQUENCE_LENGTH = 3;
export const DEFAULT_MAX_SEQUENCE_DURATION_DAYS = 21;

/** Length check fails when the draft exceeds the profile target by this factor. */
export const LENGTH_MARGIN = 1.25;

export const FOLLOW_UP_BRANCHES = [
  "closed",
  "follow_up_scheduled",
  "objection_hold",
  "no_show",
  "not_interested",
  "ghost_risk",
] as const;

export const FOLLOW_UP_CHANNELS = ["sms", "email"] as const;

export const QUALITY_FAILURE_TYPES = [
  "banned_phrase",
  "unverified_quote",
  "ungrounded_topic",
  "no_lead_specific",
  "length",
  "greeting",
  "signoff",
] as const;

export const MIN_VOICE_EXAMPLES = 2;
export const MAX_VOICE_EXAMPLES = 5;
