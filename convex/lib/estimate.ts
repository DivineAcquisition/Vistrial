import { MAX_TOKENS, PRICES, type ModelRoute } from "./modelRouter";
import type { WorkKind } from "./registry";
import { WEB_SEARCH_CENTS } from "./toolRouter";

/**
 * Input tokens one web search brings into context. Measured on dev (phase-2-progress.md, 2.4 and
 * Milestone B): about 25k per search. Rounded up so an estimate errs toward not starting.
 */
export const SEARCH_INPUT_TOKENS = 30_000;

/** A fetched page with no `maxContentTokens` set is counted at this size. */
export const FETCH_INPUT_TOKENS = 20_000;

/** Characters per token for the estimate. Low on purpose, so the estimate runs high. */
const CHARS_PER_TOKEN = 3;

export type EstimateInput = {
  workKind: WorkKind;
  inputChars: number;
  maxOutputTokens?: number;
  webSearchMaxUses?: number;
  webFetchMaxUses?: number;
  webFetchMaxContentTokens?: number;
};

/** The output room a model step gets: its own limit when set, never more than its kind allows. */
export function outputLimit(workKind: WorkKind, maxOutputTokens?: number) {
  const ceiling = MAX_TOKENS[workKind];
  return maxOutputTokens === undefined ? ceiling : Math.max(1, Math.min(ceiling, Math.floor(maxOutputTokens)));
}

function priceFor(model: string) {
  // Fake models are priced as the most expensive model they could stand in for, so tests see real estimates.
  return PRICES[model] ?? PRICES["claude-opus-5-5"];
}

/**
 * The most a model step could cost before it starts: the prompt, its full output room, every search it
 * may run and the pages those bring in, at the dearer of the route's two models. Used only to decide
 * whether to start a call, never to bill one.
 */
export function estimateCents(route: ModelRoute, input: EstimateInput) {
  const primary = priceFor(route.model);
  const fallback = priceFor(route.fallbackModel);
  const price = {
    input: Math.max(primary.input, fallback.input),
    output: Math.max(primary.output, fallback.output),
  };
  const searches = input.webSearchMaxUses ?? 0;
  const fetches = input.webFetchMaxUses ?? 0;
  const inputTokens =
    Math.ceil(input.inputChars / CHARS_PER_TOKEN) +
    searches * SEARCH_INPUT_TOKENS +
    fetches * (input.webFetchMaxContentTokens ?? FETCH_INPUT_TOKENS);
  const outputTokens = outputLimit(input.workKind, input.maxOutputTokens);
  const dollars = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.ceil(dollars * 100 * 100) / 100 + searches * WEB_SEARCH_CENTS;
}

/**
 * What the next model step may spend. A skill with a reserve keeps that much of its run cap back for
 * the completion check and one revision; only steps marked `useReserve` may spend into it.
 */
export function stepAllowance(args: {
  runCapCents: number;
  dayCapCents: number;
  runCostCents: number;
  dayCostCents: number;
  reserveCents: number;
  useReserve: boolean;
}) {
  const runRoom = args.runCapCents - (args.useReserve ? 0 : args.reserveCents) - args.runCostCents;
  const dayRoom = args.dayCapCents - args.dayCostCents;
  return Math.min(runRoom, dayRoom);
}
