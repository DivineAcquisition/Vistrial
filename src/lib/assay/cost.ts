import { MODEL_RATES_USD_PER_MTIME } from "@/lib/ops/constants";

import { ASSAY_SIGNAL_EXTRA_INPUT_TOKENS, ASSAY_SIGNAL_EXTRA_OUTPUT_TOKENS } from "@/lib/assay/signals";

/** Rules scoring does not call a model. This is the added Scribe cost per call. */
export function addedSignalCostUsd(model: "default" | "opus" = "default"): number {
  const input = model === "opus" ? MODEL_RATES_USD_PER_MTIME.opusInput : MODEL_RATES_USD_PER_MTIME.defaultInput;
  const output = model === "opus" ? MODEL_RATES_USD_PER_MTIME.opusOutput : MODEL_RATES_USD_PER_MTIME.defaultOutput;
  return (ASSAY_SIGNAL_EXTRA_INPUT_TOKENS * input + ASSAY_SIGNAL_EXTRA_OUTPUT_TOKENS * output) / 1_000_000;
}

export function scoringComputeNote(scoresToday: number): string {
  return `Rules scoring did not call AI. ${scoresToday.toLocaleString("en-US")} ${scoresToday === 1 ? "score" : "scores"} today.`;
}
