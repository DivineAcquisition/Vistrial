import { userError } from "./errors";
export const DEFAULT_CAPS = {
  maxCostCentsPerRun: 25,
  maxCostCentsPerDay: 200,
  maxSteps: 40,
  maxDurationMs: 300_000,
};

/** No workspace can set caps above these. Raised for research (decision D3): $10 a run, $100 a day. */
export const PLATFORM_CEILING = {
  maxCostCentsPerRun: 1000,
  maxCostCentsPerDay: 10_000,
  maxSteps: 200,
  maxDurationMs: 3_600_000,
};

/**
 * Skills that cost far more than the rest set their own caps and keep their own day counter, so a
 * research day cannot use up the test skill's budget or the other way round (decision D3). Every
 * other skill shares the agent's caps (DEFAULT_CAPS unless the Owner changed them).
 */
export const SKILL_CAPS: Readonly<Record<string, Caps>> = {
  "market-intelligence": {
    maxCostCentsPerRun: 300,
    maxCostCentsPerDay: 2500,
    maxSteps: 60,
    maxDurationMs: 1_800_000,
  },
  /** One long write over approved research, plus one revision held in reserve. No web research. */
  "offer-intelligence": {
    maxCostCentsPerRun: 150,
    maxCostCentsPerDay: 1000,
    maxSteps: 20,
    maxDurationMs: 600_000,
  },
  /** Words only for now: a brief, four copy variations, a script and captions, plus one revision in reserve. */
  "creative-production": {
    maxCostCentsPerRun: 150,
    maxCostCentsPerDay: 1500,
    maxSteps: 20,
    maxDurationMs: 600_000,
  },
  /** Up to six pages read and analysed one by one, one write across them, plus one revision in reserve. */
  "landing-page-teardown": {
    maxCostCentsPerRun: 300,
    maxCostCentsPerDay: 1500,
    maxSteps: 40,
    maxDurationMs: 1_200_000,
  },
  /** One short model call over the organization's own records, to choose among open report items. No web research. */
  "task-proposer": {
    maxCostCentsPerRun: 30,
    maxCostCentsPerDay: 120,
    maxSteps: 6,
    maxDurationMs: 300_000,
  },
  /**
   * Industry trend posts: one web search step (four searches at most) and one short write, once a month.
   * The day cap equals the run cap, so a month's reading can never cost more than one run.
   */
  "industry-trends": {
    maxCostCentsPerRun: 120,
    maxCostCentsPerDay: 120,
    maxSteps: 8,
    maxDurationMs: 600_000,
  },
  "growth-diagnostics": {
    maxCostCentsPerRun: 100,
    maxCostCentsPerDay: 1000,
    maxSteps: 20,
    maxDurationMs: 600_000,
  },
};

/** The caps row and day counter a skill uses: its own slug when it has its own caps, otherwise the agent's (undefined). */
export function capScope(skillSlug: string | undefined): string | undefined {
  return skillSlug !== undefined && Object.hasOwn(SKILL_CAPS, skillSlug) ? skillSlug : undefined;
}

/** The caps a skill runs under when the workspace has not set any. */
export function defaultCapsFor(skillSlug: string | undefined): Caps {
  const scope = capScope(skillSlug);
  return scope === undefined ? DEFAULT_CAPS : SKILL_CAPS[scope];
}

/** The run cost bar warns at this share of the per-run cap, before the hard stop. */
export const SOFT_WARNING_RATIO = 0.8;

export type Caps = {
  maxCostCentsPerRun: number;
  maxCostCentsPerDay: number;
  maxSteps: number;
  maxDurationMs: number;
};

export function assertWithinCeiling(caps: Caps) {
  if (caps.maxSteps > PLATFORM_CEILING.maxSteps || caps.maxDurationMs > PLATFORM_CEILING.maxDurationMs) {
    throw userError("Steps and run time cannot exceed the platform ceiling.", "limit");
  }
  if (caps.maxCostCentsPerRun > PLATFORM_CEILING.maxCostCentsPerRun) {
    throw userError("A run cap cannot exceed the platform ceiling.", "limit");
  }
  if (caps.maxCostCentsPerDay > PLATFORM_CEILING.maxCostCentsPerDay) {
    throw userError("A day cap cannot exceed the platform ceiling.", "limit");
  }
  if (caps.maxCostCentsPerRun < 1 || caps.maxCostCentsPerDay < 1) {
    throw userError("A limit must be above zero.", "limit");
  }
}

/** The model every cap above was sized for (Claude Opus 5.5), in dollars per million tokens. */
export const CAPS_SIZED_FOR = { input: 4, output: 20 };

/**
 * How much further a run on a chosen model may spend than the caps say: the model's list price over the
 * price the caps were sized for (the mean of the input and output ratios). Never below 1, so a cheaper
 * model does not lower a cap, and 1 when no model was chosen or it has no price.
 */
export function capScale(price: { input: number; output: number } | null | undefined): number {
  if (!price) return 1;
  const ratio = (price.input / CAPS_SIZED_FOR.input + price.output / CAPS_SIZED_FOR.output) / 2;
  return Number.isFinite(ratio) ? Math.max(1, ratio) : 1;
}

/**
 * A run's caps on a dearer model: the run's cost cap raised by the scale, never past the platform ceiling.
 * Steps and run time do not change.
 *
 * The day cap is an organization's own budget, so it is not multiplied. It rises only as far as one run on
 * this model needs to fit (some skills set the day cap equal to the run cap), and never past the ceiling.
 */
export function scaleCaps(caps: Caps, scale: number): Caps {
  if (!(scale > 1)) return caps;
  const run = Math.max(caps.maxCostCentsPerRun, Math.min(Math.ceil(caps.maxCostCentsPerRun * scale), PLATFORM_CEILING.maxCostCentsPerRun));
  const day = Math.max(caps.maxCostCentsPerDay, Math.min(run, PLATFORM_CEILING.maxCostCentsPerDay));
  return { ...caps, maxCostCentsPerRun: run, maxCostCentsPerDay: day };
}

export function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function overCap(args: {
  caps: Caps;
  runCost: number;
  dayCost: number;
  steps: number;
  startedAt: number;
  now: number;
}) {
  if (args.runCost >= args.caps.maxCostCentsPerRun) return true;
  if (args.dayCost >= args.caps.maxCostCentsPerDay) return true;
  if (args.steps >= args.caps.maxSteps) return true;
  if (args.now - args.startedAt >= args.caps.maxDurationMs) return true;
  return false;
}
