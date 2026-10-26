export const DEFAULT_CAPS = {
  maxCostCentsPerRun: 25,
  maxCostCentsPerDay: 200,
  maxSteps: 40,
  maxDurationMs: 300_000,
};

export const PLATFORM_CEILING = {
  maxCostCentsPerRun: 100,
  maxCostCentsPerDay: 1000,
};

export type Caps = {
  maxCostCentsPerRun: number;
  maxCostCentsPerDay: number;
  maxSteps: number;
  maxDurationMs: number;
};

export function assertWithinCeiling(caps: Pick<Caps, "maxCostCentsPerRun" | "maxCostCentsPerDay">) {
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
}) {
  if (args.runCost >= args.caps.maxCostCentsPerRun) return true;
  if (args.dayCost >= args.caps.maxCostCentsPerDay) return true;
  if (args.steps >= args.caps.maxSteps) return true;
  if (args.now - args.startedAt >= args.caps.maxDurationMs) return true;
  return false;
}
