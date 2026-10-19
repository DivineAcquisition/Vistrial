import { shortHash, stableStringify } from "@/lib/config/resolve";
import { isApprovedInput, type ApprovedInputKey, type FieldMapEntry } from "@/lib/assay/inputs";
import {
  ENGAGEMENT_RULE_KINDS,
  isCallSignal,
  isSignalValue,
  type CallSignal,
  type Confidence,
  type EngagementRuleKind,
} from "@/lib/assay/vocabulary";

/**
 * A workspace's scoring rules, read from its configuration. Staff edit them
 * through the configuration layers; the AI never sets a number here.
 */

export const FIT_OPS = ["is_true", "is_false", "gte", "lte", "equals", "source_quality"] as const;
export type FitOp = (typeof FIT_OPS)[number];

export type FitRule = {
  id: string;
  input: ApprovedInputKey;
  op: FitOp;
  value: string | null;
  points: number;
  reason: string;
  /** A missing field scores neutral unless staff chose to count it against the lead. */
  missing: "neutral" | "negative";
  enabled: boolean;
};

export type EngagementRule = {
  id: string;
  kind: EngagementRuleKind;
  points: number;
  reason: string;
  /** Most times one rule may count. */
  maxCount: number;
  /** replied_fast: a reply within this many minutes of the team's outreach. */
  minutes: number | null;
  /** no_reply: days of silence after outreach. two_way: the window. */
  days: number | null;
  /** two_way: replies needed inside the window. */
  minCount: number | null;
  enabled: boolean;
};

export type CallRule = {
  id: string;
  signal: CallSignal;
  value: string;
  points: number;
  reason: string;
  enabled: boolean;
};

export type PartWeights = { fit: number; engagement: number; call: number };
export type TierLines = { hot: number; warm: number; cool: number };

export type AssayRules = {
  /** The configuration version that produced these rules. Stored on every score. */
  version: string;
  weights: PartWeights;
  tiers: TierLines;
  stickiness: number;
  /** Positive engagement loses half its value per this many days of silence. */
  halfLifeDays: number;
  /** Negative engagement points count in full until the lead acts this many days after them. */
  negativeExpiryDays: number;
  /** Positive engagement older than this does not count. */
  lookbackDays: number;
  confidence: Exclude<Confidence, "low">;
  signalHalfAfterDays: number;
  signalDropAfterDays: number;
  fit: FitRule[];
  engagement: EngagementRule[];
  call: CallRule[];
  fieldMap: FieldMapEntry[];
};

/** Every part starts here before rules move it. */
export const PART_BASE = 50;

/** A source needs this many closed leads before its record counts. Same floor as the learning rules. */
export const SOURCE_MIN_CLOSED = 20;

export const DEFAULT_SETTINGS = {
  weights: { fit: 35, engagement: 45, call: 20 },
  tiers: { hot: 75, warm: 50, cool: 25 },
  stickiness: 5,
  halfLifeDays: 7,
  negativeExpiryDays: 30,
  lookbackDays: 90,
  confidence: "medium" as const,
  signalHalfAfterDays: 60,
  signalDropAfterDays: 120,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : [];
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(value: unknown): number | null {
  const n = num(value, NaN);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function clampPoints(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export type RulesProblem = { key: string; message: string };

export type ParsedRules = { rules: AssayRules; problems: RulesProblem[] };

/**
 * Read rules from configuration values. A rule that names an input, event, or
 * signal Assay does not know is dropped and reported, never guessed at.
 */
export function parseRules(values: Record<string, unknown>): ParsedRules {
  const problems: RulesProblem[] = [];
  const weights = record(values["assay.weights"]);
  const tiers = record(values["assay.tiers"]);

  const fit: FitRule[] = [];
  for (const [index, row] of list(values["assay.fit_rules"]).entries()) {
    const input = text(row.input);
    const op = text(row.op) as FitOp;
    const id = text(row.id) || `fit_${index + 1}`;
    if (!isApprovedInput(input)) {
      problems.push({ key: "assay.fit_rules", message: `Fit rule "${id}" reads "${input}", which is not an approved input. It was ignored.` });
      continue;
    }
    if (!FIT_OPS.includes(op)) {
      problems.push({ key: "assay.fit_rules", message: `Fit rule "${id}" has an unknown condition. It was ignored.` });
      continue;
    }
    fit.push({
      id,
      input,
      op,
      value: text(row.value) || null,
      points: clampPoints(num(row.points, 0)),
      reason: text(row.reason),
      missing: row.missing === "negative" ? "negative" : "neutral",
      enabled: row.enabled !== false,
    });
  }

  const engagement: EngagementRule[] = [];
  for (const [index, row] of list(values["assay.engagement_rules"]).entries()) {
    const kind = text(row.kind) as EngagementRuleKind;
    const id = text(row.id) || `engagement_${index + 1}`;
    if (!ENGAGEMENT_RULE_KINDS.includes(kind)) {
      problems.push({ key: "assay.engagement_rules", message: `Engagement rule "${id}" counts something Assay does not track. It was ignored.` });
      continue;
    }
    engagement.push({
      id,
      kind,
      points: clampPoints(num(row.points, 0)),
      reason: text(row.reason),
      maxCount: Math.max(1, Math.round(num(row.max_count, 1))),
      minutes: optionalNum(row.minutes),
      days: optionalNum(row.days),
      minCount: optionalNum(row.min_count),
      enabled: row.enabled !== false,
    });
  }

  const call: CallRule[] = [];
  for (const [index, row] of list(values["assay.call_rules"]).entries()) {
    const signal = text(row.signal);
    const value = text(row.value);
    const id = text(row.id) || `call_${index + 1}`;
    if (!isCallSignal(signal) || !isSignalValue(signal, value)) {
      problems.push({ key: "assay.call_rules", message: `Call rule "${id}" reads a call signal Scribe does not record. It was ignored.` });
      continue;
    }
    call.push({
      id,
      signal,
      value,
      points: clampPoints(num(row.points, 0)),
      reason: text(row.reason),
      enabled: row.enabled !== false,
    });
  }

  const fieldMap = list(values["assay.field_map"])
    .map((row) => ({ source: text(row.source), input: text(row.input) }))
    .filter((row) => row.source);

  const confidence = values["assay.signal_confidence"] === "high" ? "high" : "medium";

  const content: Omit<AssayRules, "version"> = {
    weights: {
      fit: Math.max(0, num(weights.fit, DEFAULT_SETTINGS.weights.fit)),
      engagement: Math.max(0, num(weights.engagement, DEFAULT_SETTINGS.weights.engagement)),
      call: Math.max(0, num(weights.call, DEFAULT_SETTINGS.weights.call)),
    },
    tiers: {
      hot: num(tiers.hot, DEFAULT_SETTINGS.tiers.hot),
      warm: num(tiers.warm, DEFAULT_SETTINGS.tiers.warm),
      cool: num(tiers.cool, DEFAULT_SETTINGS.tiers.cool),
    },
    stickiness: Math.max(0, num(values["assay.tier_stickiness"], DEFAULT_SETTINGS.stickiness)),
    halfLifeDays: Math.max(1, num(values["assay.decay_half_life_days"], DEFAULT_SETTINGS.halfLifeDays)),
    negativeExpiryDays: Math.max(1, num(values["assay.negative_expiry_days"], DEFAULT_SETTINGS.negativeExpiryDays)),
    lookbackDays: Math.max(1, num(values["assay.engagement_lookback_days"], DEFAULT_SETTINGS.lookbackDays)),
    confidence,
    signalHalfAfterDays: Math.max(1, num(values["assay.signal_half_after_days"], DEFAULT_SETTINGS.signalHalfAfterDays)),
    signalDropAfterDays: Math.max(1, num(values["assay.signal_drop_after_days"], DEFAULT_SETTINGS.signalDropAfterDays)),
    fit,
    engagement,
    call,
    fieldMap,
  };
  return { rules: { version: rulesVersion(content), ...content }, problems };
}

/** The version of a set of rules: a hash of their content, so only rule changes make a new one. */
export function rulesVersion(content: Omit<AssayRules, "version">): string {
  return `a${shortHash(stableStringify(content))}`;
}
