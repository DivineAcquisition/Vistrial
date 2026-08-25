/**
 * Product numbers Prompt 18 did not name. Stated here, not guessed ad hoc.
 *
 * This layer calls existing server actions. These numbers only bound the
 * agent loop, confirmation batches, and how much of a read result is sent
 * back to the model.
 */

/** Records a single confirmed write may touch. Org-configurable. Never silent truncate. */
export const OPERATOR_BATCH_CAP_DEFAULT = 10;
export const OPERATOR_BATCH_CAP_MIN = 1;
export const OPERATOR_BATCH_CAP_MAX = 40;

/** Undo is available this long after a reversible write executes. */
export const OPERATOR_UNDO_WINDOW_MS = 15 * 60 * 1000;

/** Tool calls (not model rounds) after which the run stops and reports what completed. */
export const OPERATOR_STEP_LIMIT = 12;

/** Wall clock for one streaming session (start or continue). Confirmed writes already done stand. */
export const OPERATOR_TIME_LIMIT_MS = 90_000;

/** Runs per requesting user per org per hour. */
export const OPERATOR_RATE_LIMIT_USER = 20;
/** Runs per org per hour, all members. */
export const OPERATOR_RATE_LIMIT_ORG = 60;
export const OPERATOR_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/** Rows of a list result sent to the model. The UI still links those rows. */
export const OPERATOR_RESULT_PAGE_SIZE = 20;

/** Keyboard shortcut that opens the command panel from anywhere in the app. */
export const OPERATOR_SHORTCUT = "Mod+K";

export const OPERATOR_MODEL_ENV = "OPERATOR_AGENT_MODEL";

export const OPERATOR_HONESTY =
  "If a tool returned nothing, say nothing was found. Do not estimate, extrapolate, or fill a gap from general knowledge.";
