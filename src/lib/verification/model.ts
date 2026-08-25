import "server-only";

import { createAnthropicMessage } from "@/lib/extraction/anthropic";
import {
  DEFAULT_ANTHROPIC_VERIFIER_MODEL,
  VERIFIER_MAX_TOKENS,
  VERIFIER_TIMEOUT_MS,
} from "@/lib/verification/constants";
import { parseVerifierResponse } from "@/lib/verification/faults";
import type { ModelVerifyResult } from "@/lib/verification/types";

export function anthropicVerifierModel(): string {
  return process.env.ANTHROPIC_VERIFIER_MODEL?.trim() || DEFAULT_ANTHROPIC_VERIFIER_MODEL;
}

/**
 * Fault-finding model call. Payload is source + output + rules.
 * Never pass generator reasoning.
 */
export async function runModelVerifier(args: {
  system: string;
  user: string;
  includeEmbarrassment: boolean;
}): Promise<ModelVerifyResult> {
  const model = anthropicVerifierModel();
  const message = await createAnthropicMessage({
    system: args.system,
    user: args.user,
    model,
    maxTokens: VERIFIER_MAX_TOKENS,
    timeoutMs: VERIFIER_TIMEOUT_MS,
  });
  const parsed = parseVerifierResponse(message.text);
  return {
    invoked: true,
    faults: parsed.faults,
    wouldEmbarrass: args.includeEmbarrassment ? parsed.wouldEmbarrass : null,
    model: message.model,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
    skippedReason: null,
  };
}

export function skippedVerifier(
  reason: ModelVerifyResult["skippedReason"]
): ModelVerifyResult {
  return {
    invoked: false,
    faults: [],
    wouldEmbarrass: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    skippedReason: reason,
  };
}
