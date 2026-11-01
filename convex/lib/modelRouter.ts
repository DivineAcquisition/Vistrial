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

/** What the provider billed for a call, whether or not the call gave usable output. */
export type BilledUsage = { inputTokens: number; outputTokens: number; costCents: number };

export const NO_USAGE: BilledUsage = { inputTokens: 0, outputTokens: 0, costCents: 0 };

export function addUsage(a: BilledUsage, b: BilledUsage): BilledUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costCents: Math.round((a.costCents + b.costCents) * 10_000) / 10_000,
  };
}

/**
 * A failed call carries a code for the step row. The message never holds model or page text.
 * `billed` is what the provider charged anyway (a refusal is billed), so caps count it.
 */
export class ModelError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly billed: BilledUsage = NO_USAGE,
  ) {
    super(`Model call failed: ${code}`);
  }
}

function billedBy(error: unknown): BilledUsage {
  return error instanceof ModelError ? error.billed : NO_USAGE;
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
 * Application code asks for a work kind. The route decides the model, and the fallback takes over on a retryable failure.
 * Usage billed by a failed first attempt is added to the result, or to the error when the fallback fails too.
 */
export async function complete(route: ModelRoute, workKind: WorkKind, input: string): Promise<Completion> {
  try {
    return await callProvider(route.provider, route.model, workKind, input);
  } catch (error) {
    const retryable = error instanceof ModelError && error.retryable;
    const sameRoute = route.fallbackProvider === route.provider && route.fallbackModel === route.model;
    if (!retryable || sameRoute) throw error;
    const firstBilled = billedBy(error);
    let result: Completion;
    try {
      result = await callProvider(route.fallbackProvider, route.fallbackModel, workKind, input);
    } catch (second) {
      const code = second instanceof ModelError ? second.code : "provider_error";
      const again = second instanceof ModelError && second.retryable;
      throw new ModelError(code, again, addUsage(firstBilled, billedBy(second)));
    }
    return { ...result, ...addUsage(firstBilled, result) };
  }
}

async function callProvider(provider: string, model: string, workKind: WorkKind, input: string) {
  if (provider === "claude") return claudeComplete(model, workKind, input);
  if (provider === "fake") return fakeComplete(provider, model);
  throw new ModelError("unknown_provider", false);
}

export function fakeComplete(provider: string, model: string): Completion {
  if (model === "fake-failing") throw new ModelError("provider_error", true);
  // A billed refusal: 10 input and 5 output tokens, 2 cents.
  if (model.startsWith("fake-refusing")) throw new ModelError("refused", true, { inputTokens: 10, outputTokens: 5, costCents: 2 });
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
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  if (response.stop_reason === "refusal") {
    // The refused call is billed, so its cost travels with the error.
    throw new ModelError("refused", true, { inputTokens, outputTokens, costCents: costCents(model, inputTokens, outputTokens) });
  }
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
  return {
    text,
    inputTokens,
    outputTokens,
    costCents: costCents(model, inputTokens, outputTokens),
    provider: "claude",
    model,
  };
}
