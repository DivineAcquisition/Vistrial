import type { Enums } from "@/types/database";

import { keepVerbatimObjections, keepVerbatimQuotes, normalizeForQuoteMatch } from "@/lib/transcripts/quotes";
import type {
  ExtractedObjection,
  ExtractedSignal,
  ExtractionSignalState,
  ParsedExtraction,
  VerbatimQuote,
} from "@/lib/transcripts/types";

const STATES: ExtractionSignalState[] = ["absent", "unclear", "present"];
const OBJECTION_TYPES: Enums<"objection_type">[] = [
  "price",
  "timing",
  "spouse_partner",
  "trust",
  "fit",
  "competitor",
  "other",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asState(value: unknown): ExtractionSignalState | null {
  const raw = asString(value);
  if (!raw) return null;
  return (STATES as string[]).includes(raw) ? (raw as ExtractionSignalState) : null;
}

function parseSignal(value: unknown, transcript: string): ExtractedSignal {
  const record = asRecord(value);
  if (!record) {
    const text = asString(value);
    if (!text) return { state: "absent", text: null };
    return verifySignal({ state: "unclear", text }, transcript);
  }
  const state = asState(record.state) ?? "absent";
  const text = asString(record.text);
  if (state === "absent") return { state: "absent", text: null };
  if (state === "present" && !text) return { state: "unclear", text: null };
  if (state === "unclear") return verifySignal({ state: "unclear", text }, transcript);
  return verifySignal({ state: "present", text }, transcript);
}

function verifySignal(signal: ExtractedSignal, transcript: string): ExtractedSignal {
  if (!signal.text) {
    return signal.state === "present" ? { state: "unclear", text: null } : signal;
  }
  const needle = normalizeForQuoteMatch(signal.text);
  if (needle.length < 4) {
    return signal.state === "present" ? { state: "unclear", text: signal.text } : signal;
  }
  if (normalizeForQuoteMatch(transcript).includes(needle)) return signal;
  if (signal.state === "present") return { state: "absent", text: null };
  return { state: "unclear", text: null };
}

function parseQuotes(value: unknown): VerbatimQuote[] {
  if (!Array.isArray(value)) return [];
  const quotes: VerbatimQuote[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const text = asString(record.text) ?? asString(record.quote);
    if (!text) continue;
    quotes.push({
      text,
      topic: asString(record.topic) ?? "situation",
    });
  }
  return quotes;
}

function parseObjections(value: unknown): ExtractedObjection[] {
  if (!Array.isArray(value)) return [];
  const objections: ExtractedObjection[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const typeRaw = asString(record.type);
    const verbatim = asString(record.verbatim) ?? asString(record.text);
    if (!typeRaw || !verbatim) continue;
    const type = (OBJECTION_TYPES as string[]).includes(typeRaw)
      ? (typeRaw as Enums<"objection_type">)
      : "other";
    objections.push({ type, verbatim });
  }
  return objections;
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("invalid_json");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error("invalid_json");
  }
}

/**
 * Parse model output into schema fields. Quotes and objection verbatim that
 * do not appear in the source transcript are dropped — never stored.
 */
export function parseExtraction(raw: unknown, transcript: string): ParsedExtraction {
  const record = asRecord(raw);
  if (!record) {
    return emptyExtraction();
  }

  const summary = asString(record.summary);
  return {
    summary,
    statedObjection: parseSignal(record.stated_objection ?? record.statedObjection, transcript),
    budgetSignal: parseSignal(record.budget_signal ?? record.budgetSignal, transcript),
    timelineSignal: parseSignal(record.timeline_signal ?? record.timelineSignal, transcript),
    decisionProcess: parseSignal(record.decision_process ?? record.decisionProcess, transcript),
    nextStepAgreed: parseSignal(record.next_step_agreed ?? record.nextStepAgreed, transcript),
    quotes: keepVerbatimQuotes(parseQuotes(record.quotes), transcript),
    objections: keepVerbatimObjections(parseObjections(record.objections), transcript),
  };
}

export function emptyExtraction(): ParsedExtraction {
  const absent: ExtractedSignal = { state: "absent", text: null };
  return {
    summary: null,
    statedObjection: absent,
    budgetSignal: absent,
    timelineSignal: absent,
    decisionProcess: absent,
    nextStepAgreed: absent,
    quotes: [],
    objections: [],
  };
}

export function presentSignalText(signal: ExtractedSignal): string | null {
  return signal.state === "present" ? signal.text : null;
}
