export const EXTRACTION_SYSTEM_PROMPT = `You extract structured facts from a sales call transcript for a closer who was not on the call.

Rules you must not break:
- Never infer what was not said. If the prospect did not name a budget, budget is absent, not a guess from context.
- Quotes must be verbatim substrings of the transcript. Do not paraphrase. If you cannot copy a phrase exactly, omit it.
- Distinguish absent from unclear. Absent means the topic was never discussed. Unclear means it was mentioned but you cannot use the wording as a stated fact.
- A short, garbled, or one-sided call should produce empty or absent fields. Inventing content is worse than leaving fields empty.
- Objections need the prospect's own words and a type from: price, timing, spouse_partner, trust, fit, competitor, other.
- Do not include the setter's or closer's words as prospect quotes.

Return JSON only, matching:
{
  "summary": string | null,
  "stated_objection": { "state": "absent" | "unclear" | "present", "text": string | null },
  "budget_signal": { "state": "absent" | "unclear" | "present", "text": string | null },
  "timeline_signal": { "state": "absent" | "unclear" | "present", "text": string | null },
  "decision_process": { "state": "absent" | "unclear" | "present", "text": string | null },
  "next_step_agreed": { "state": "absent" | "unclear" | "present", "text": string | null },
  "quotes": [{ "text": string, "topic": string }],
  "objections": [{ "type": "price" | "timing" | "spouse_partner" | "trust" | "fit" | "competitor" | "other", "verbatim": string }]
}`;

export type ExtractionPromptContext = {
  offerType?: string | null;
  offerTypeOther?: string | null;
  qualificationSignals?: string[] | null;
  qualificationSignalsOther?: string | null;
  leadChannels?: string[] | null;
  leadChannelsOther?: string | null;
  topObjections?: Array<{ type: string; phrasing: string }>;
};

function workspaceContext(context?: ExtractionPromptContext): string | null {
  if (!context) return null;
  const lines: string[] = [];
  if (context.offerType === "other" && context.offerTypeOther?.trim()) {
    lines.push(`This business named their offer type as: ${context.offerTypeOther.trim()}.`);
  }
  if (context.leadChannels?.includes("other") && context.leadChannelsOther?.trim()) {
    lines.push(`Leads also come from: ${context.leadChannelsOther.trim()}.`);
  }
  if (context.qualificationSignals?.includes("other") && context.qualificationSignalsOther?.trim()) {
    lines.push(`They also listen for this qualification signal: ${context.qualificationSignalsOther.trim()}.`);
  }
  if (context.topObjections?.length) {
    lines.push(
      `Usual objection wording in this business (use only to classify what was actually said):\n${context.topObjections
        .map((item) => `- ${item.type}: "${item.phrasing}"`)
        .join("\n")}`
    );
  }
  if (!lines.length) return null;
  return `Workspace context. Classify against this list. Do not treat it as facts from this call.\n${lines.join("\n")}`;
}

export function extractionUserPrompt(
  transcript: string,
  truncated: boolean,
  context?: ExtractionPromptContext
): string {
  const note = truncated
    ? "The middle of this transcript was omitted because the call was too long. Only extract from the text you were given.\n\n"
    : "";
  const extra = workspaceContext(context);
  return `${note}${extra ? `${extra}\n\n` : ""}Transcript:\n${transcript}`;
}
