/**
 * Product numbers Prompt 24 did not name. Stated here, not guessed ad hoc.
 */

/** Tool calls after which a run stops and reports what it completed. */
export const AGENT_STEP_LIMIT = 12;

/** Wall clock for one on-demand session. Confirmed writes already done stand. */
export const AGENT_TIME_LIMIT_MS = 90_000;

/** Wall clock for one scheduled or triggered session. Longer: nobody is waiting. */
export const AGENT_ASYNC_TIME_LIMIT_MS = 8 * 60_000;

/** Rows of a list result sent to the model. Page rather than dump. */
export const AGENT_RESULT_PAGE_SIZE = 20;

/** Internal writes may touch this many records. Same default as Prompt 18. */
export const AGENT_INTERNAL_BATCH_CAP_DEFAULT = 10;
export const AGENT_INTERNAL_BATCH_CAP_MIN = 1;
export const AGENT_INTERNAL_BATCH_CAP_MAX = 40;

/**
 * External writes (client systems) use a tighter cap than internal.
 * Show every record. Never truncate.
 */
export const AGENT_EXTERNAL_BATCH_CAP_DEFAULT = 5;
export const AGENT_EXTERNAL_BATCH_CAP_MIN = 1;
export const AGENT_EXTERNAL_BATCH_CAP_MAX = 20;

/** Undo window for reversible writes. */
export const AGENT_UNDO_WINDOW_MS = 15 * 60 * 1000;

/** Failed runs retry this many times, then dead-letter. Never retry forever. */
export const AGENT_RETRY_MAX = 3;

/** Backoff between retries, in milliseconds. */
export const AGENT_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 25 * 60_000] as const;

/** Default daily run cap per agent per org. Hard stop. */
export const AGENT_DAILY_RUN_CAP_DEFAULT = 40;

/** Default daily spend cap in USD per agent per org. Hard stop. */
export const AGENT_DAILY_SPEND_CAP_USD_DEFAULT = 25;

/** Yield when a person in this org used the app this recently. */
export const AGENT_USER_ACTIVITY_WINDOW_MS = 8_000;

/** How long a background step waits for live user work to clear. */
export const AGENT_YIELD_MS = 1_500;

/** Statement timeout for background agent queries, milliseconds. */
export const AGENT_STATEMENT_TIMEOUT_MS = 8_000;

export const AGENT_HALT_APPS = ["crm", "calendar"] as const;
export type AgentHaltApp = (typeof AGENT_HALT_APPS)[number];
