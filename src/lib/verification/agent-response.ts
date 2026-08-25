import { fault, uniqueFaults } from "@/lib/verification/faults";
import type { DeterministicCheckResult } from "@/lib/verification/types";

const NUMBER = /(?<![A-Za-z])(?:\$)?\d+(?:,\d{3})*(?:\.\d+)?%?/g;

export type AgentStepFact = {
  seq: number;
  toolName: string;
  summary: string | null;
  result: unknown;
};

function collectNumbers(text: string): Set<string> {
  const found = new Set<string>();
  const matches = text.match(NUMBER) ?? [];
  for (const raw of matches) {
    found.add(raw.replace(/,/g, ""));
  }
  return found;
}

function factsText(steps: AgentStepFact[]): string {
  return steps
    .map((step) => {
      const result =
        typeof step.result === "string" ? step.result : JSON.stringify(step.result ?? {});
      return `${step.seq} ${step.toolName} ${step.summary ?? ""} ${result}`;
    })
    .join("\n");
}

function sentenceHasUnsupportedNumber(sentence: string, allowed: Set<string>): string | null {
  const nums = [...collectNumbers(sentence)];
  for (const num of nums) {
    if (!allowed.has(num)) return num;
  }
  return null;
}

/**
 * Post-run: every number in the response must appear in a tool result.
 * Unsupported sentences are dropped. The person never sees a caveat.
 */
export function correctAgentResponse(args: {
  response: string;
  steps: AgentStepFact[];
}): DeterministicCheckResult & { corrected: string } {
  const allowed = collectNumbers(factsText(args.steps));
  const faults = [];
  const kept: string[] = [];
  const parts = args.response.split(/(?<=[.!?])\s+/);

  for (const sentence of parts) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const bad = sentenceHasUnsupportedNumber(trimmed, allowed);
    if (bad) {
      faults.push(
        fault("unsupported_number", "response", `The number ${bad} does not appear in any tool result.`)
      );
      continue;
    }
    kept.push(trimmed);
  }

  let corrected = kept.join(" ").trim();
  if (!corrected && args.response.trim()) {
    const summaries = args.steps
      .map((step) => step.summary)
      .filter((item): item is string => Boolean(item && item.trim()));
    corrected = summaries.length
      ? summaries.join(" ")
      : "The run finished. No figures from the tools were available to report.";
    if (faults.length === 0) {
      faults.push(
        fault("unsupported_claim", "response", "The response had no sentence that traced to a tool result.")
      );
    }
  }

  return {
    ok: uniqueFaults(faults).length === 0,
    faults: uniqueFaults(faults),
    corrected,
  };
}
