import "server-only";

import { createAnthropicMessage } from "@/lib/extraction/anthropic";
import { extractJsonObject } from "@/lib/extraction/parse";
import { geminiApiKey, geminiGenerateJson } from "@/lib/scribe/gemini";
import { ProviderUnavailable, anthropicUnavailable } from "@/lib/scribe/provider";
import { SCRIBE_EXTRACT_SYSTEM, scribeExtractUser, type CaseFactSpec } from "@/lib/scribe/prompt";

export type ExtractCallResult = {
  json: unknown;
  model: string;
  provider: "gemini" | "anthropic";
  inputTokens: number;
  outputTokens: number;
  /** Why Gemini was skipped, for staff only. */
  fallbackReason: string | null;
};

/**
 * Gemini reads the call; when it cannot take work (or returns something
 * unusable) Anthropic reads it instead. When neither can, the caller waits on
 * the provider and resumes later without spending an attempt.
 */
export async function extractCall(args: {
  businessDescription: string;
  facts: CaseFactSpec[];
  objectionLabels: string[];
  passagesText: string;
  truncated: boolean;
  constraints?: string;
}): Promise<ExtractCallResult> {
  const user = scribeExtractUser(args);
  let fallbackReason: string | null = null;

  if (geminiApiKey()) {
    try {
      const result = await geminiGenerateJson({ system: SCRIBE_EXTRACT_SYSTEM, user });
      return {
        json: extractJsonObject(result.text),
        model: result.model,
        provider: "gemini",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        fallbackReason: null,
      };
    } catch (cause) {
      fallbackReason = cause instanceof Error ? cause.message.slice(0, 120) : "gemini_failed";
    }
  } else {
    fallbackReason = "gemini_unavailable:missing_key";
  }

  try {
    const message = await createAnthropicMessage({
      system: SCRIBE_EXTRACT_SYSTEM,
      user,
      maxTokens: 6000,
      timeoutMs: 90_000,
    });
    return {
      json: extractJsonObject(message.text),
      model: message.model,
      provider: "anthropic",
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
      fallbackReason,
    };
  } catch (cause) {
    const unavailable = anthropicUnavailable(cause);
    if (unavailable) {
      const both = new ProviderUnavailable("anthropic", `${fallbackReason ?? "gemini"}; ${unavailable.message}`, unavailable.status);
      throw both;
    }
    throw cause;
  }
}
