import "server-only";

import { createAnthropicMessage } from "@/lib/extraction/anthropic";
import { extractJsonObject } from "@/lib/extraction/parse";
import type { ScoringBand } from "@/lib/scribe/bands";
import type { ExtractedFact } from "@/lib/scribe/merge";
import { anthropicUnavailable } from "@/lib/scribe/provider";

export type Analysis = {
  summary: string | null;
  nextStep: string | null;
  readinessReason: string | null;
  openQuestions: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type EarlierPassage = { body: string; speaker: string; when: string | null };

const SYSTEM = `You write the top of a lead's case file for a small sales team. You get facts gathered from calls, each with its state, the readiness score and band (already decided; do not change them), the business's own rules for readiness, and short passages from earlier calls with this same lead.

Rules you must not break:
- Use only what you are given. Never invent facts, amounts, dates, or names.
- The summary is at most three plain sentences about where this lead stands now, across calls.
- The next step is one concrete action for the team (for example "Call Thursday to confirm the deposit"). Never promise anything to the lead. Never say a message was sent.
- The readiness reason explains the band in one or two sentences, pointing at the facts that drove it and what is still missing.
- Open questions are things the team still needs to learn, as short questions, at most five.
- No jargon, no scores spelled out as percentages, no mention of other companies or tools.

Return JSON only: { "summary": string, "next_step": string, "readiness_reason": string, "open_questions": [string] }`;

function factLine(f: ExtractedFact): string {
  if (f.state === "absent") return `- ${f.label}: not discussed`;
  if (f.state === "unclear") return `- ${f.label}: came up, unclear`;
  return `- ${f.label}: ${String(f.value)}`;
}

function list(label: string, items: unknown): string {
  const values = Array.isArray(items)
    ? items.map((i) => (typeof i === "string" ? i : i && typeof i === "object" ? String((i as Record<string, unknown>).reason ?? "") : "")).filter(Boolean)
    : [];
  return values.length ? `${label}:\n${values.map((v) => `- ${v}`).join("\n")}\n` : "";
}

export async function analyzeCase(args: {
  businessDescription: string;
  values: Record<string, unknown>;
  facts: ExtractedFact[];
  callSummary: string | null;
  agreedNextStep: string | null;
  score: number | null;
  band: ScoringBand | null;
  earlier: EarlierPassage[];
  extractedQuestions: string[];
}): Promise<Analysis> {
  const earlier = args.earlier.length
    ? `Earlier calls with this lead:\n${args.earlier.map((p) => `- (${p.speaker}${p.when ? `, ${p.when.slice(0, 10)}` : ""}) ${p.body.slice(0, 600)}`).join("\n")}\n`
    : "This is the first call on record for this lead.\n";
  const user = `The business: ${args.businessDescription}.

${list("Ready to buy when", args.values["qualification.ready_criteria"])}${list("Needs nurturing when", args.values["qualification.not_ready_criteria"])}${list("Stop pursuing when", args.values["qualification.disqualifiers"])}${list("Must know before qualifying", args.values["qualification.minimum_info"])}
Facts so far:
${args.facts.map(factLine).join("\n") || "- none"}

This call in short: ${args.callSummary ?? "no summary"}
Next step agreed on the call: ${args.agreedNextStep ?? "none"}
Readiness: ${args.score == null ? "not scored yet" : `${args.score} of 100`}${args.band ? `, band "${args.band.name}" (${args.band.meaning}; usual next step: ${args.band.next_step})` : ""}
Questions noticed while reading: ${args.extractedQuestions.join("; ") || "none"}

${earlier}`;

  try {
    const message = await createAnthropicMessage({ system: SYSTEM, user, maxTokens: 1200, timeoutMs: 60_000 });
    const json = extractJsonObject(message.text) as Record<string, unknown>;
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    return {
      summary: text(json.summary, 1200),
      nextStep: text(json.next_step, 300),
      readinessReason: text(json.readiness_reason, 600),
      openQuestions: Array.isArray(json.open_questions)
        ? json.open_questions.filter((q): q is string => typeof q === "string" && q.trim().length > 3).map((q) => q.trim().slice(0, 200)).slice(0, 5)
        : [],
      model: message.model,
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
    };
  } catch (cause) {
    throw anthropicUnavailable(cause) ?? cause;
  }
}
