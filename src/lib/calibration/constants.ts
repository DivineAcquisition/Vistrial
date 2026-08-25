/** Product numbers Prompt 16 did not name. Stated here, not guessed ad hoc. */

/** Share of new leads worked regardless of score. 0 disables the holdout. */
export const HOLDOUT_DEFAULT_PERCENT = 5;
export const HOLDOUT_MAX_PERCENT = 20;

/**
 * Score bands for the close-rate curve. 20-point bands so a typical ready
 * threshold (60) sits on a boundary. The top band includes 100.
 */
export const CALIBRATION_BANDS = [
  { key: "0-19", lo: 0, hi: 19, label: "0–19" },
  { key: "20-39", lo: 20, hi: 39, label: "20–39" },
  { key: "40-59", lo: 40, hi: 59, label: "40–59" },
  { key: "60-79", lo: 60, hi: 79, label: "60–79" },
  { key: "80-100", lo: 80, hi: 100, label: "80–100" },
] as const;

export type CalibrationBandKey = (typeof CALIBRATION_BANDS)[number]["key"];

/** Same floor as Prompt 11 diagnostics. Six leads is noise; 20 is the product minimum. */
export const CALIBRATION_MIN_N = 20;

/** Cross-client aggregates use the Prompt 12 cohort floor. */
export const CALIBRATION_BENCHMARK_MIN_ORGS = 5;

/** Largest weight move a suggestion is allowed to propose. */
export const WEIGHT_MOVE_POINTS = 5;

/** Mean factor-delta gap below this is treated as noise, not a reweight. */
export const FACTOR_DELTA_NOISE_FLOOR = 8;

/** Sample audit size per org per job run. */
export const EXTRACTION_AUDIT_SAMPLE = 5;

export const CALIBRATION_HONESTY =
  "A higher score among leads that closed is association, not proof the score caused the close.";

export const HOLDOUT_PLAIN =
  "A small random share of new leads is worked regardless of score so we can check whether the score matches who actually closes, instead of only checking the leads the score already pushed to the front.";

export const HOLDOUT_DISABLED_PLAIN =
  "The random sample is off. Close rates by score will look tidy because low-scoring leads are called last. Weight suggestions are withheld until the sample is on and large enough.";
