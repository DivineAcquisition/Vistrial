export const DEFAULT_CAPS = {
  maxCostCentsPerRun: 25,
  maxCostCentsPerDay: 200,
  maxSteps: 40,
  maxDurationMs: 300_000,
};

/** The most any skill may ever be allowed (decision D3): $10 a run, $100 a day, 200 steps, 1 hour. */
export const PLATFORM_CEILING = {
  maxCostCentsPerRun: 1000,
  maxCostCentsPerDay: 10_000,
  maxSteps: 200,
  maxDurationMs: 3_600_000,
};

/** The ceiling for a skill with no caps of its own, such as the dev test skills: $1 a run, $10 a day. */
export const SMALL_CEILING = {
  maxCostCentsPerRun: 100,
  maxCostCentsPerDay: 1000,
  maxSteps: 200,
  maxDurationMs: 3_600_000,
};

export type SkillCaps = { defaults: Caps; ceiling: Caps };

/**
 * Caps per skill. A skill not listed here gets `DEFAULT_CAPS` and `SMALL_CEILING`, so the test skills
 * keep their small caps. Market Intelligence (decision D3): $3 a run and $25 a day per workspace by
 * default. An Owner may lower them, or raise them up to the platform ceiling.
 */
export const SKILL_CAPS: Record<string, SkillCaps> = {
  "market-intelligence": {
    defaults: { maxCostCentsPerRun: 300, maxCostCentsPerDay: 2500, maxSteps: 60, maxDurationMs: 1_800_000 },
    ceiling: PLATFORM_CEILING,
  },
};

export function capsForSkill(skillSlug: string): SkillCaps {
  return SKILL_CAPS[skillSlug] ?? { defaults: DEFAULT_CAPS, ceiling: SMALL_CEILING };
}

/** A stored row never exceeds the skill's current ceiling, even if the ceiling was lowered after it was saved. */
export function clampToCeiling(caps: Caps, ceiling: Caps): Caps {
  return {
    maxCostCentsPerRun: Math.min(caps.maxCostCentsPerRun, ceiling.maxCostCentsPerRun),
    maxCostCentsPerDay: Math.min(caps.maxCostCentsPerDay, ceiling.maxCostCentsPerDay),
    maxSteps: Math.min(caps.maxSteps, ceiling.maxSteps),
    maxDurationMs: Math.min(caps.maxDurationMs, ceiling.maxDurationMs),
  };
}

/** The run cost bar warns at this share of the per-run cap, before the hard stop. */
export const SOFT_WARNING_RATIO = 0.8;

export type Caps = {
  maxCostCentsPerRun: number;
  maxCostCentsPerDay: number;
  maxSteps: number;
  maxDurationMs: number;
};

export function assertWithinCeiling(caps: Caps, ceiling: Caps = SMALL_CEILING) {
  if (caps.maxSteps > ceiling.maxSteps || caps.maxDurationMs > ceiling.maxDurationMs) {
    throw new Error("Steps and run time cannot exceed the platform ceiling.");
  }
  if (caps.maxCostCentsPerRun > ceiling.maxCostCentsPerRun) {
    throw new Error("A run cap cannot exceed the platform ceiling.");
  }
  if (caps.maxCostCentsPerDay > ceiling.maxCostCentsPerDay) {
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
}) {
  if (args.runCost >= args.caps.maxCostCentsPerRun) return true;
  if (args.dayCost >= args.caps.maxCostCentsPerDay) return true;
  if (args.steps >= args.caps.maxSteps) return true;
  if (args.now - args.startedAt >= args.caps.maxDurationMs) return true;
  return false;
}
