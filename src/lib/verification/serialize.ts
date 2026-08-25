import type { ParsedExtraction } from "@/lib/transcripts/types";

/** Output only. Never include generator reasoning. */
export function extractionJsonForVerifier(parsed: ParsedExtraction): string {
  return JSON.stringify({
    summary: parsed.summary,
    stated_objection: parsed.statedObjection,
    budget_signal: parsed.budgetSignal,
    timeline_signal: parsed.timelineSignal,
    decision_process: parsed.decisionProcess,
    next_step_agreed: parsed.nextStepAgreed,
    quotes: parsed.quotes,
    objections: parsed.objections,
  });
}

export function rawQuotesFromModelJson(value: unknown): Array<{ text: string; topic: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const quotes = (value as Record<string, unknown>).quotes;
  if (!Array.isArray(quotes)) return [];
  const out: Array<{ text: string; topic: string }> = [];
  for (const item of quotes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const text = typeof rec.text === "string" ? rec.text.trim() : "";
    const topic = typeof rec.topic === "string" ? rec.topic.trim() : "situation";
    if (text) out.push({ text, topic: topic || "situation" });
  }
  return out;
}
