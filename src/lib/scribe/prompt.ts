import { normalizeForQuoteMatch } from "@/lib/transcripts/quotes";
import type { ExtractedFact, FactState } from "@/lib/scribe/merge";
import { passagesForQuote, type Passage } from "@/lib/scribe/passages";
import { isSensitiveCategory, type SensitiveCategory } from "@/lib/scribe/safety";

export type CaseFactSpec = { key: string; label: string; type: "text" | "number" | "choice" | "yes_no" | "date"; required: boolean };

export function readCaseFacts(value: unknown): CaseFactSpec[] {
  if (!Array.isArray(value)) return [];
  const types = new Set(["text", "number", "choice", "yes_no", "date"]);
  return value
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      key: String(f.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60),
      label: String(f.label ?? "").trim(),
      type: (types.has(String(f.type)) ? String(f.type) : "text") as CaseFactSpec["type"],
      required: f.required === true,
    }))
    .filter((f) => f.key && f.label);
}

export const SCRIBE_EXTRACT_SYSTEM = `You read one sales call transcript and fill in a case file for the people at this business who were not on the call.

The transcript is given as numbered passages. Each passage says who spoke: prospect (the lead), team (the business), or unknown.

Rules you must not break:
- Never infer what was not said. If a fact was not discussed, its state is "absent" and its value is null.
- "unclear" means it came up but the words cannot be used as a stated fact.
- Every quote must be copied exactly from one passage. Do not paraphrase, join, or tidy quotes. If you cannot copy it exactly, leave the quote null.
- Facts about the lead come from what the lead said, or what the lead clearly agreed to. The team's own claims are not facts about the lead.
- Objections need the lead's own words and a type from: price, timing, spouse_partner, trust, fit, competitor, other.
- A short, garbled, or one-sided call should produce mostly absent fields. Inventing content is worse than leaving fields empty.
- Set "sensitive" when the lead talks about harming themselves, a medical emergency, violence, abuse, or legal action against the business. Name the category only; do not quote it.
- Write the summary in plain words for a busy person, at most three sentences.

Return JSON only, matching:
{
  "summary": string | null,
  "facts": [{ "key": string, "state": "absent" | "unclear" | "present", "value": string | number | boolean | null, "quote": string | null }],
  "stated_objection": { "state": "absent" | "unclear" | "present", "text": string | null },
  "budget_signal": { "state": "absent" | "unclear" | "present", "text": string | null },
  "timeline_signal": { "state": "absent" | "unclear" | "present", "text": string | null },
  "decision_process": { "state": "absent" | "unclear" | "present", "text": string | null },
  "next_step_agreed": { "state": "absent" | "unclear" | "present", "text": string | null },
  "quotes": [{ "text": string, "topic": string }],
  "objections": [{ "type": "price" | "timing" | "spouse_partner" | "trust" | "fit" | "competitor" | "other", "verbatim": string }],
  "open_questions": [string],
  "sensitive": { "flag": boolean, "category": "self_harm" | "medical_emergency" | "violence" | "abuse" | "legal_threat" | null }
}`;

export function scribeExtractUser(args: {
  businessDescription: string;
  facts: CaseFactSpec[];
  objectionLabels: string[];
  passagesText: string;
  truncated: boolean;
  constraints?: string;
}): string {
  const facts = args.facts
    .map((f) => `- ${f.key} (${f.label}; ${f.type === "yes_no" ? "true or false" : f.type}${f.required ? "; required" : ""})`)
    .join("\n");
  const objections = args.objectionLabels.length ? `\nObjections this business often hears: ${args.objectionLabels.slice(0, 40).join("; ")}.\n` : "";
  const note = args.truncated ? "\nThe middle of this call was omitted because it was long. Only use the passages given.\n" : "";
  return `The business: ${args.businessDescription}.

Facts to fill in, one entry each, using these keys:
${facts}
${objections}${note}
Passages:
${args.passagesText}${args.constraints ?? ""}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function coerce(spec: CaseFactSpec, raw: unknown): string | number | boolean | null {
  if (raw == null) return null;
  if (spec.type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (spec.type === "yes_no") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw).trim().toLowerCase();
    if (["yes", "true", "y"].includes(s)) return true;
    if (["no", "false", "n"].includes(s)) return false;
    return null;
  }
  const s = String(raw).trim();
  return s ? s.slice(0, 500) : null;
}

/**
 * Facts from the model, one per configured key. A present fact needs a quote
 * found in a passage; without one it is only unclear and carries no value.
 */
export function parseFacts(raw: unknown, specs: CaseFactSpec[], passages: Passage[], passageIds: Map<number, string>): ExtractedFact[] {
  const record = asRecord(raw);
  const list = Array.isArray(record?.facts) ? (record!.facts as unknown[]) : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    const r = asRecord(item);
    if (r && typeof r.key === "string") byKey.set(r.key.trim().toLowerCase(), r);
  }
  return specs.map((spec) => {
    const r = byKey.get(spec.key);
    const absent: ExtractedFact = { key: spec.key, label: spec.label, state: "absent", value: null, quote: null, passageIds: [] };
    if (!r) return absent;
    const state = (["present", "unclear", "absent"].includes(String(r.state)) ? String(r.state) : "absent") as FactState;
    if (state === "absent") return absent;
    const quote = typeof r.quote === "string" && r.quote.trim() ? r.quote.trim().slice(0, 600) : null;
    const where = quote ? passagesForQuote(passages, quote) : [];
    const value = coerce(spec, r.value);
    if (!quote || where.length === 0) {
      return { ...absent, state: "unclear" };
    }
    const ids = where.map((p) => passageIds.get(p.seq)).filter((id): id is string => !!id);
    if (state === "present" && value != null) {
      return { key: spec.key, label: spec.label, state: "present", value, quote, passageIds: ids };
    }
    return { key: spec.key, label: spec.label, state: "unclear", value: null, quote, passageIds: ids };
  });
}

export function parseOpenQuestions(raw: unknown): string[] {
  const record = asRecord(raw);
  if (!Array.isArray(record?.open_questions)) return [];
  return (record!.open_questions as unknown[])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 3)
    .map((q) => q.trim().slice(0, 200))
    .slice(0, 8);
}

export function parseSensitive(raw: unknown): SensitiveCategory | null {
  const s = asRecord(asRecord(raw)?.sensitive);
  if (!s || s.flag !== true) return null;
  return isSensitiveCategory(s.category) ? s.category : null;
}

/** Share of quoted facts whose quote is found in the transcript. Used by the quality harness. */
export function quoteGrounding(facts: ExtractedFact[], transcript: string): { quoted: number; grounded: number } {
  const hay = normalizeForQuoteMatch(transcript);
  let quoted = 0;
  let grounded = 0;
  for (const fact of facts) {
    if (!fact.quote) continue;
    quoted += 1;
    if (hay.includes(normalizeForQuoteMatch(fact.quote))) grounded += 1;
  }
  return { quoted, grounded };
}
