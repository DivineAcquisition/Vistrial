import "server-only";

import { DEFAULT_ANTHROPIC_DRAFT_MODEL } from "@/lib/follow-up/constants";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/transcripts/constants";

export type AnthropicMessageResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function anthropicDraftModel(): string {
  return process.env.ANTHROPIC_DRAFT_MODEL?.trim() || DEFAULT_ANTHROPIC_DRAFT_MODEL;
}

export function anthropicApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? key : null;
}

export async function createAnthropicMessage(args: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<AnthropicMessageResult> {
  const key = anthropicApiKey();
  if (!key) throw new Error("missing_api_key");

  const model = args.model?.trim() || anthropicModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 4096,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("anthropic_timeout");
    throw new Error("anthropic_http");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error("anthropic_http");
  }

  const body = (await response.json()) as {
    model?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = (body.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    text,
    model: body.model ?? model,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}
