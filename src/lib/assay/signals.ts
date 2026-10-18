import type { CallSignals, Confidence, RedFlag } from "@/lib/assay/types";

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function confidenceMeets(value: Confidence, minimum: Confidence): boolean {
  return CONFIDENCE_RANK[value] >= CONFIDENCE_RANK[minimum];
}

function unknown<T extends string>(value: T): { value: T; confidence: Confidence } {
  return { value, confidence: "low" };
}

export function emptyCallSignals(ageDays = 0): CallSignals {
  return {
    timeline: unknown("unknown"),
    budgetFit: unknown("unknown"),
    decisionMaker: unknown("unknown"),
    objectionResolved: unknown("unknown"),
    buyingIntent: unknown("unknown"),
    nextStep: unknown("unknown"),
    redFlags: [],
    ageDays,
  };
}

const TIMELINE = new Set(["ready_now", "within_30", "within_90", "later", "unknown"]);
const BUDGET = new Set(["fits", "does_not_fit", "unknown"]);
const DECISION = new Set(["on_call", "needs_someone_else", "unknown"]);
const YES_NO = new Set(["yes", "no", "unknown"]);
const NEXT = new Set(["booked", "quote", "decision_date", "none", "unknown"]);
const FLAGS = new Set(["price_shopping", "outside_scope"]);
const CONF = new Set(["low", "medium", "high"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pick<T extends string>(raw: unknown, allowed: Set<string>, fallback: T): { value: T; confidence: Confidence } {
  const record = asRecord(raw);
  const value = typeof raw === "string" ? raw : typeof record?.value === "string" ? record.value : "";
  const confidenceRaw = typeof record?.confidence === "string" ? record.confidence : "medium";
  const confidence = CONF.has(confidenceRaw) ? (confidenceRaw as Confidence) : "low";
  if (!allowed.has(value)) return { value: fallback, confidence: "low" };
  return { value: value as T, confidence };
}

/**
 * Reads the signals object from the same Scribe extraction. Free text and
 * instructions are ignored. The model never supplies a score.
 */
export function parseAssaySignals(raw: unknown, ageDays = 0): CallSignals {
  const root = asRecord(raw);
  const signals = asRecord(root?.signals) ?? root;
  if (!signals) return emptyCallSignals(ageDays);
  const flagsRaw = Array.isArray(signals.red_flags) ? signals.red_flags : [];
  const flagConfidence = CONF.has(String(signals.red_flag_confidence)) ? (String(signals.red_flag_confidence) as Confidence) : "medium";
  const redFlags = flagsRaw
    .filter((flag): flag is RedFlag => typeof flag === "string" && FLAGS.has(flag))
    .map((flag) => ({ value: flag, confidence: flagConfidence }));
  return {
    timeline: pick(signals.timeline_confidence ? { value: signals.timeline, confidence: signals.timeline_confidence } : signals.timeline, TIMELINE, "unknown"),
    budgetFit: pick(signals.budget_confidence ? { value: signals.budget_fit, confidence: signals.budget_confidence } : signals.budget_fit, BUDGET, "unknown"),
    decisionMaker: pick(
      signals.decision_confidence ? { value: signals.decision_maker, confidence: signals.decision_confidence } : signals.decision_maker,
      DECISION,
      "unknown"
    ),
    objectionResolved: pick(
      signals.objection_confidence ? { value: signals.objection_resolved, confidence: signals.objection_confidence } : signals.objection_resolved,
      YES_NO,
      "unknown"
    ),
    buyingIntent: pick(
      signals.intent_confidence ? { value: signals.buying_intent, confidence: signals.intent_confidence } : signals.buying_intent,
      YES_NO,
      "unknown"
    ),
    nextStep: pick(signals.next_step_confidence ? { value: signals.next_step, confidence: signals.next_step_confidence } : signals.next_step, NEXT, "unknown"),
    redFlags,
    ageDays,
  };
}

function matched(text: string | null, pattern: RegExp): boolean {
  if (!text) return false;
  return pattern.test(text);
}

/**
 * Fallback when an older case file has prose signals and no structured object.
 * Only fixed phrases count. The prose is not stored on the score.
 */
export function signalsFromLegacy(args: {
  timeline: string | null;
  budget: string | null;
  decision: string | null;
  nextStep: string | null;
  objectionResolved: boolean | null;
  priceShopping: boolean;
  outsideScope: boolean;
  ageDays: number;
}): CallSignals {
  const base = emptyCallSignals(args.ageDays);
  const timeline = args.timeline;
  if (matched(timeline, /\b(right away|asap|today|this week|immediately)\b/i)) base.timeline = { value: "ready_now", confidence: "medium" };
  else if (matched(timeline, /\b(this month|30 days|within a month|couple of weeks)\b/i)) base.timeline = { value: "within_30", confidence: "medium" };
  else if (matched(timeline, /\b(90 days|this quarter|a few months)\b/i)) base.timeline = { value: "within_90", confidence: "medium" };
  else if (matched(timeline, /\b(next year|not right now|no rush|someday)\b/i)) base.timeline = { value: "later", confidence: "medium" };

  const budget = args.budget;
  if (matched(budget, /\b(budget works|can afford|within budget|that price works|price works)\b/i)) base.budgetFit = { value: "fits", confidence: "medium" };
  else if (matched(budget, /\b(too expensive|can't afford|cannot afford|out of my budget|out of our budget)\b/i)) {
    base.budgetFit = { value: "does_not_fit", confidence: "medium" };
  }

  const decision = args.decision;
  if (matched(decision, /\b(i decide|i can decide|i'm the owner|i am the owner|my decision)\b/i)) {
    base.decisionMaker = { value: "on_call", confidence: "medium" };
  } else if (matched(decision, /\b(someone else|need approval|not my decision)\b/i)) {
    base.decisionMaker = { value: "needs_someone_else", confidence: "medium" };
  }

  if (args.objectionResolved === true) base.objectionResolved = { value: "yes", confidence: "medium" };
  if (args.objectionResolved === false) base.objectionResolved = { value: "no", confidence: "medium" };

  const next = args.nextStep;
  if (matched(next, /\b(booked|scheduled|see you)\b/i)) base.nextStep = { value: "booked", confidence: "medium" };
  else if (matched(next, /\b(send a quote|quote)\b/i)) base.nextStep = { value: "quote", confidence: "medium" };
  else if (matched(next, /\b(decide by|decision date)\b/i)) base.nextStep = { value: "decision_date", confidence: "medium" };

  if (matched(timeline, /\b(want to (get this )?scheduled|let's do it|ready to start|want to move ahead)\b/i)) {
    base.buyingIntent = { value: "yes", confidence: "medium" };
  }

  const flags: CallSignals["redFlags"] = [];
  if (args.priceShopping) flags.push({ value: "price_shopping", confidence: "medium" });
  if (args.outsideScope) flags.push({ value: "outside_scope", confidence: "medium" });
  base.redFlags = flags;
  return base;
}

/** Extra tokens the signals block adds to Scribe's existing extraction. No second call. */
export const ASSAY_SIGNAL_EXTRA_INPUT_TOKENS = 380;
export const ASSAY_SIGNAL_EXTRA_OUTPUT_TOKENS = 180;
