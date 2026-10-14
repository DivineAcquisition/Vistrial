/**
 * Which model answers, and what it cost. Haiku routes and answers plain metric
 * questions; Sonnet takes questions that need reasoning. Compass never
 * escalates to Opus. Both can be overridden by environment for a deployment.
 */

export const COMPASS_FAST_MODEL_ENV = "COMPASS_FAST_MODEL";
export const COMPASS_REASONING_MODEL_ENV = "COMPASS_REASONING_MODEL";

export const DEFAULT_FAST_MODEL = "claude-haiku-5-5";
export const DEFAULT_REASONING_MODEL = "claude-sonnet-5-5";

export type CompassRoute = "fast" | "reasoning";

/** US dollars per million tokens: input, output, cache read. List prices; spend views label them estimated. */
const RATES: Array<{ match: RegExp; input: number; output: number; cacheRead: number }> = [
  { match: /haiku-5/, input: 0.1, output: 0.5, cacheRead: 0.01 },
  { match: /haiku-4/, input: 1, output: 5, cacheRead: 0.1 },
  { match: /sonnet-5/, input: 2, output: 10, cacheRead: 0.2 },
  { match: /sonnet-4/, input: 3, output: 15, cacheRead: 0.3 },
  { match: /opus/, input: 5, output: 25, cacheRead: 0.5 },
];

export function modelIdFor(route: CompassRoute, env: Record<string, string | undefined> = process.env): string {
  const override = route === "fast" ? env[COMPASS_FAST_MODEL_ENV] : env[COMPASS_REASONING_MODEL_ENV];
  const id = override?.trim() || (route === "fast" ? DEFAULT_FAST_MODEL : DEFAULT_REASONING_MODEL);
  if (/opus|fable|creative/i.test(id)) {
    throw new Error("Compass does not use that model.");
  }
  return id;
}

/** Estimated cost in millionths of a dollar. Cached input is billed at the cache-read rate. */
export function costMicros(modelId: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }): number {
  const rate = RATES.find((row) => row.match.test(modelId)) ?? RATES[2]!;
  const uncached = Math.max(0, usage.inputTokens - usage.cacheReadTokens);
  const dollars = (uncached * rate.input + usage.cacheReadTokens * rate.cacheRead + usage.outputTokens * rate.output) / 1_000_000;
  return Math.round(dollars * 1_000_000);
}
