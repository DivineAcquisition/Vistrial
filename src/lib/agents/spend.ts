import { cacheHitInputFactor } from "@/lib/agents/anthropic";
import { MODEL_RATES_USD_PER_MTIME } from "@/lib/ops/constants";

export function tokensToUsd(args: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
}): number {
  return (
    (args.inputTokens / 1_000_000) * args.inputPerMTok +
    (args.outputTokens / 1_000_000) * args.outputPerMTok +
    (args.cacheReadTokens / 1_000_000) * args.cacheReadPerMTok
  );
}

export function spendKey(orgId: string, agentId: string): string {
  return `${orgId}:${agentId}`;
}

function ratesForModel(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) {
    return { input: MODEL_RATES_USD_PER_MTIME.opusInput, output: MODEL_RATES_USD_PER_MTIME.opusOutput };
  }
  return { input: MODEL_RATES_USD_PER_MTIME.defaultInput, output: MODEL_RATES_USD_PER_MTIME.defaultOutput };
}

/** Estimated USD for one turn. Cache hits are a tenth of standard input. */
export function estimatedAgentSpendUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}): number {
  const rates = ratesForModel(args.model);
  return tokensToUsd({
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cacheReadTokens: args.cacheReadTokens ?? 0,
    inputPerMTok: rates.input,
    outputPerMTok: rates.output,
    cacheReadPerMTok: rates.input * cacheHitInputFactor(),
  });
}
