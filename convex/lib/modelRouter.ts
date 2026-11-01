import Anthropic from "@anthropic-ai/sdk";

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

export const PROVIDERS = ["claude", "fake"] as const;

/** Dollars per million tokens, first-party API rates. A model missing here cannot run, so caps stay real. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** Output room per kind of work. Short kinds stay short so one call cannot spend the run cap alone. */
export const MAX_TOKENS: Record<WorkKind, number> = {
  research: 16000,
  classify: 1024,
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
    if (error instanceof Anthropic.RateLimitError) throw new ModelError("rate_limited", true);
    if (error instanceof Anthropic.AuthenticationError) throw new ModelError("auth_failed", false);
    if (error instanceof Anthropic.BadRequestError) throw new ModelError("bad_request", false);
    if (error instanceof Anthropic.APIConnectionError) throw new ModelError("connection_failed", true);
    if (error instanceof Anthropic.APIError) {
      throw new ModelError("provider_error", typeof error.status === "number" && error.status >= 500);
    }
    throw new ModelError("provider_error", false);
  }
  return completionFromResponse(model, response);
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
