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
    throw new Error("Steps and run time cannot exceed the platform ceiling.");
  }
  if (caps.maxCostCentsPerRun > PLATFORM_CEILING.maxCostCentsPerRun) {
    throw new Error("A run cap cannot exceed the platform ceiling.");
  }
  if (caps.maxCostCentsPerDay > PLATFORM_CEILING.maxCostCentsPerDay) {
    throw new Error("A day cap cannot exceed the platform ceiling.");
  }
  if (caps.maxCostCentsPerRun < 1 || caps.maxCostCentsPerDay < 1) {
    throw new Error("Caps must be at least 1 cent.");
  }
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
  /** Time the run spent waiting for a person. It does not count toward the time cap. */
  waitedMs?: number;
}) {
  if (args.runCost >= args.caps.maxCostCentsPerRun) return true;
  if (args.dayCost >= args.caps.maxCostCentsPerDay) return true;
  if (args.steps >= args.caps.maxSteps) return true;
  if (activeMs(args.startedAt, args.now, args.waitedMs) >= args.caps.maxDurationMs) return true;
  return false;
}

export function activeMs(startedAt: number, now: number, waitedMs = 0) {
  return now - startedAt - waitedMs;
}
