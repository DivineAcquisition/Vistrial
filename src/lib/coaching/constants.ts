/**
 * Product numbers Prompt 17 did not name. Stated here, not guessed ad hoc.
 *
 * Prompt 16 already set the diagnostic floor and score bands. Per-rep
 * comparison is meaningless without those, so this prompt reuses them.
 */

/** Same floor as reporting diagnostics and calibration. Below this, show nothing. */
export const CALL_QUALITY_MIN_N = 20;

/** Cross-client aggregates use the Prompt 12 cohort floor. */
export const CALL_QUALITY_BENCHMARK_MIN_ORGS = 5;

/**
 * Hours a rep's call analysis and per-rep patterns stay private to them
 * before owner/admin (the only "manager" roles in this product) can see them.
 * 0 means the manager sees immediately — the cost is that the rep does not
 * get a window to notice the pattern first.
 */
export const CALL_QUALITY_EMBARGO_HOURS_DEFAULT = 48;
export const CALL_QUALITY_EMBARGO_HOURS_MIN = 0;
export const CALL_QUALITY_EMBARGO_HOURS_MAX = 168;

/** Windows used to detect a structural shift without an outcome change. */
export const GAMING_WINDOW_DAYS = 14;
export const GAMING_STRUCTURAL_SHIFT = 0.2;
export const GAMING_OUTCOME_MAX_SHIFT_PP = 5;

/**
 * Residual lead-quality gap inside a 20-point band. Wider than this and a
 * closed-vs-lost difference may still be the leads, not the calls.
 */
export const LEAD_QUALITY_RESIDUAL_POINTS = 5;

/** Typical duration for a call type is undefined until this many comparable recordings exist. */
export const TYPICAL_DURATION_MIN_N = CALL_QUALITY_MIN_N;

/** Brief re-renders within this window are the same opening, not a new one. */
export const BRIEF_VIEW_DEDUPE_MINUTES = 5;

export const ANALYZER_VERSION = "call_quality.v1";

export const CALL_QUALITY_HONESTY =
  "These numbers describe what was on the recording. They are not a grade, not a ranking, and not a reason to fire anyone.";

export const STRUCTURAL_NOT_A_TARGET =
  "Talk ratio, question count, and call length are diagnostics. They are not goals. Moving the number without moving the outcome is the signature of a gamed measure.";

export const COACHING_DISCLOSURE =
  "Your calls are transcribed. Vistrial reads those transcripts for patterns — what was asked, which objections were handled, whether a next step was set — and uses that to coach. You can see everything computed about you. Your manager sees the same numbers after a short delay, not a secret score.";
