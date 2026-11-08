import { MAX_TOKENS, PRICES, type ModelRoute } from "./modelRouter";
import type { WorkKind } from "./registry";
import { WEB_SEARCH_CENTS } from "./toolRouter";

/** Tokens in a prompt, over-counted on purpose: about three characters each, plus room for the wrapper. */
export function promptTokens(text: string) {
  return Math.ceil(text.length / 3) + 200;
}

/**
 * The most a model step could cost, in cents: the prompt, the work kind's full output room, and the search
 * fee for every allowed search. Search results also land in the prompt, so each search adds 25,000 input
 * tokens, the amount measured on dev (phase-2-progress, 2.4). The higher of the route's two models is used,
 * since the fallback may run.
 */
export function estimateCents(route: ModelRoute, workKind: WorkKind, prompt: string, maxSearches: number) {
  const price = (model: string) => PRICES[model] ?? (model.startsWith("fake") ? PRICES["claude-opus-5-5"] : null);
  const prices = [price(route.model), price(route.fallbackModel)].filter((row) => row !== null);
  if (prices.length === 0) return Number.POSITIVE_INFINITY;
  const input = promptTokens(prompt) + maxSearches * 25_000;
  const output = MAX_TOKENS[workKind];
  const dollars = Math.max(...prices.map((row) => (input * row.input + output * row.output) / 1_000_000));
  return Math.ceil(dollars * 100 + maxSearches * WEB_SEARCH_CENTS);
}
