/**
 * Match window is unspecified in the product spec. Calendar invites drift.
 * 20 minutes is wide enough for timezone-rounded starts and tight enough
 * that two same-day calls on one lead still fail closed into unmatched.
 */
export const TRANSCRIPT_MATCH_WINDOW_MS = 20 * 60 * 1000;

/** Bounded window sent to the model. Head + tail, never the full long call. */
export const TRANSCRIPT_HEAD_CHARS = 60_000;
export const TRANSCRIPT_TAIL_CHARS = 20_000;
export const TRANSCRIPT_MAX_CHARS = TRANSCRIPT_HEAD_CHARS + TRANSCRIPT_TAIL_CHARS;

export const EXTRACTION_MAX_ATTEMPTS = 8;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

export const TRANSCRIPT_SOURCES = ["fathom", "fireflies", "zoom", "ghl", "manual"] as const;

export const RECORDER_SOURCES = ["fathom", "fireflies", "zoom", "ghl"] as const;

export const EXTRACTION_CORRECTABLE_FIELDS = [
  "summary",
  "stated_objection",
  "stated_objection_state",
  "budget_signal",
  "budget_signal_state",
  "timeline_signal",
  "timeline_signal_state",
  "decision_process",
  "decision_process_state",
  "next_step_agreed",
  "next_step_state",
  "quotes",
] as const;

export type ExtractionCorrectableField = (typeof EXTRACTION_CORRECTABLE_FIELDS)[number];
