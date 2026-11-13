import Anthropic from "@anthropic-ai/sdk";

import { openRouterComplete } from "./openrouter";
import { WORK_KINDS, type WorkKind } from "./registry";

export type ModelRoute = {
  provider: string;
  model: string;
  fallbackProvider: string;
  fallbackModel: string;
};

export type Completion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  provider: string;
  model: string;
};

/** "claude" is Anthropic, direct. "openrouter" reaches other companies' models through OpenRouter (lib/openrouter.ts). */
export const PROVIDERS = ["claude", "openrouter", "fake"] as const;

export type Price = {
  input: number;
  output: number;
  cacheRead: number;
  /** Dollars per million tokens written to the cache. Missing means 1.25x input (Anthropic's rule). */
  cacheWrite?: number;
  /** Cents for one web search by the model's own search. Missing means 1 cent (Anthropic's fee). */
  searchCents?: number;
};

/**
 * Dollars per million tokens. A model missing here cannot run, through any provider, so caps stay real.
 *
 * Claude rows are Anthropic's first-party API rates. Cache writes cost 1.25x input; cache reads are listed
 * per model (Haiku 5.5's is assumed at 10% of input).
 *
 * Rows with a company prefix ("openai/", "google/") are OpenRouter model ids, with the prices its models
 * endpoint (https://openrouter.ai/api/v1/models) listed on 2026-11-13. OpenRouter reports what each call
 * cost, and that is what is charged; these rows are the fallback when it reports none, and what the
 * worst-case estimate before a step is worked out from. Above 272,000 input tokens the GPT-6.1 input price
 * doubles; the reported cost includes that, this table does not.
 */
export const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "openai/gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5, searchCents: 1 },
  "openai/gpt-6.1-terra": { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25, searchCents: 1 },
  "google/gemini-4-carbon": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0.1875, searchCents: 1.4 },
  "google/gemini-4-hydrogen": { input: 1.5, output: 7.5, cacheRead: 0.075, cacheWrite: 0.0833, searchCents: 1.4 },
};

/** Output room per kind of work. Short kinds stay short so one call cannot spend the run cap alone. */
export const MAX_TOKENS: Record<WorkKind, number> = {
  research: 16000,
  classify: 8000,
  write: 16000,
  summarize: 4000,
};

/** Tokens and money a call used. A refused call is billed, so it carries this too. */
export type Spend = {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

export const NO_SPEND: Spend = { inputTokens: 0, outputTokens: 0, costCents: 0 };

export function addSpend(a: Spend, b: Spend): Spend {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costCents: a.costCents + b.costCents,
  };
}

/**
 * A failed call carries a code for the step row, and what it was billed, so the cost is still
 * counted. The message never holds model or page text.
 */
export class ModelError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly spent: Spend = NO_SPEND,
  ) {
    super(`Model call failed: ${code}`);
  }
}

export function isWorkKind(value: string): value is WorkKind {
  return (WORK_KINDS as readonly string[]).includes(value);
}

export function isProvider(value: string) {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function costCents(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICES[model];
  if (!price) throw new ModelError("unpriced_model", false);
  const dollars = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.round(dollars * 100 * 10_000) / 10_000;
}

/**
 * Application code asks for a work kind. The route decides the model, and the fallback takes over on a
 * retryable failure. What a failed first call was billed is added to the result, or to the error when
 * the fallback fails too, so no billed call goes uncounted.
 */
export async function complete(route: ModelRoute, workKind: WorkKind, input: string): Promise<Completion> {
  try {
    return await callProvider(route.provider, route.model, workKind, input);
  } catch (error) {
    const sameRoute = route.fallbackProvider === route.provider && route.fallbackModel === route.model;
    if (!(error instanceof ModelError) || !error.retryable || sameRoute) throw error;
    const spent = error.spent;
    try {
      const result = await callProvider(route.fallbackProvider, route.fallbackModel, workKind, input);
      return { ...result, ...addSpend(result, spent) };
    } catch (fallbackError) {
      if (!(fallbackError instanceof ModelError)) throw new ModelError("provider_error", false, spent);
      throw new ModelError(fallbackError.code, fallbackError.retryable, addSpend(spent, fallbackError.spent));
    }
  }
}

async function callProvider(provider: string, model: string, workKind: WorkKind, input: string) {
  if (provider === "claude") return claudeComplete(model, workKind, input);
  if (provider === "openrouter") return openRouterComplete(model, workKind, input);
  if (provider === "fake") return fakeComplete(provider, model);
  throw new ModelError("unknown_provider", false);
}

export function fakeComplete(provider: string, model: string): Completion {
  if (model === "fake-failing") throw new ModelError("provider_error", true);
  if (model.startsWith("fake-refusing")) throw new ModelError("refused", true, { inputTokens: 10, outputTokens: 2, costCents: 2 });
  const costCents = model === "fake-expensive" ? 30 : 1;
  return { text: "ok", inputTokens: 10, outputTokens: 5, costCents, provider, model };
}

export async function claudeComplete(model: string, workKind: WorkKind, input: string): Promise<Completion> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ModelError("no_key", false);
  if (!PRICES[model]) throw new ModelError("unpriced_model", false);
  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS[workKind],
      messages: [{ role: "user", content: input }],
    });
  } catch (error) {
    throw toModelError(error);
  }
  return completionFromResponse(model, response);
}

/** Maps an SDK error to a result code. Nothing from the provider's message is kept. */
export function toModelError(error: unknown, spent: Spend = NO_SPEND): ModelError {
  if (error instanceof ModelError) return new ModelError(error.code, error.retryable, addSpend(spent, error.spent));
  if (error instanceof Anthropic.RateLimitError) return new ModelError("rate_limited", true, spent);
  if (error instanceof Anthropic.AuthenticationError) return new ModelError("auth_failed", false, spent);
  if (error instanceof Anthropic.BadRequestError) return new ModelError("bad_request", false, spent);
  if (error instanceof Anthropic.APIConnectionError) return new ModelError("connection_failed", true, spent);
  if (error instanceof Anthropic.APIError) {
    return new ModelError("provider_error", typeof error.status === "number" && error.status >= 500, spent);
  }
  return new ModelError("provider_error", false, spent);
}

/** Turns a Claude response into a completion. A refusal is still billed, so its usage rides on the error. */
export function completionFromResponse(
  model: string,
  response: Pick<Anthropic.Message, "content" | "stop_reason" | "usage">,
): Completion {
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const spent = { inputTokens, outputTokens, costCents: costCents(model, inputTokens, outputTokens) };
  if (response.stop_reason === "refusal") throw new ModelError("refused", true, spent);
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
  return { text, ...spent, provider: "claude", model };
}
