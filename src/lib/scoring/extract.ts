import {
  FACTOR_LABELS,
  SCORE_FACTORS,
  type FactorValues,
  type ScoreFactor,
} from "@/lib/scoring/compute";

export type MappingKind = "choice" | "range";

export type ScoreFieldRule = {
  id: string;
  kind: MappingKind;
  /** Discrete answer, compared case-insensitively after trim. */
  answerValue: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  score: number;
};

export type ScoreFieldMap = {
  id: string;
  fieldName: string;
  factor: ScoreFactor;
  rules: ScoreFieldRule[];
};

export type ExtractionNote = {
  fieldName: string;
  factor: ScoreFactor;
  read: string | null;
  produced: number | null;
  detail: string;
};

export type ExtractionResult = {
  factors: FactorValues;
  notes: ExtractionNote[];
  ignoredFields: string[];
};

function emptyFactors(): FactorValues {
  return {
    timeline: null,
    investment_capacity: null,
    decision_authority: null,
    pain_severity: null,
  };
}

function normalizeChoice(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Pull a number from a primitive answer. Commas and a leading $ are ignored. */
export function parseNumericAnswer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function stringifyAnswer(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function matchRule(value: unknown, rules: ScoreFieldRule[]): ScoreFieldRule | null {
  const text = stringifyAnswer(value);
  if (text !== null) {
    const normalized = normalizeChoice(text);
    const choice = rules.find(
      (rule) => rule.kind === "choice" && rule.answerValue !== null && normalizeChoice(rule.answerValue) === normalized
    );
    if (choice) return choice;
  }

  const numeric = parseNumericAnswer(value);
  if (numeric === null) return null;

  const ranges = rules
    .filter(
      (rule) =>
        rule.kind === "range" &&
        rule.rangeMin !== null &&
        rule.rangeMax !== null &&
        numeric >= rule.rangeMin &&
        numeric <= rule.rangeMax
    )
    .sort((a, b) => (a.rangeMax! - a.rangeMin!) - (b.rangeMax! - b.rangeMin!));

  return ranges[0] ?? null;
}

/**
 * Call language is scored against the org's existing factor maps.
 * A mapped answer that appears inside the spoken signal counts; the longest
 * hit wins so “15k” beats “5k”. Unmatched speech leaves the factor unknown
 * for overlay — never a guessed number.
 */
export function matchCallRule(text: string, rules: ScoreFieldRule[]): ScoreFieldRule | null {
  const exact = matchRule(text, rules);
  if (exact) return exact;

  const normalized = normalizeChoice(text);
  const hits = rules
    .filter((rule) => {
      if (rule.kind !== "choice" || !rule.answerValue) return false;
      const answer = normalizeChoice(rule.answerValue);
      return answer.length >= 3 && normalized.includes(answer);
    })
    .sort(
      (a, b) => normalizeChoice(b.answerValue ?? "").length - normalizeChoice(a.answerValue ?? "").length
    );
  return hits[0] ?? null;
}

const CALL_SIGNAL_FACTORS = {
  timeline_signal: "timeline",
  budget_signal: "investment_capacity",
  decision_process: "decision_authority",
} as const;

export type CallScoreSignals = {
  timeline_signal: string | null;
  budget_signal: string | null;
  decision_process: string | null;
};

/**
 * Map present call signals onto factors using every org map for that factor,
 * not the application field name. Factors the call did not speak to stay null
 * so overlay leaves them untouched.
 */
export function extractCallFactors(signals: CallScoreSignals, maps: ScoreFieldMap[]): ExtractionResult {
  const factors = emptyFactors();
  const notes: ExtractionNote[] = [];
  const ignoredFields: string[] = [];

  for (const [fieldName, factor] of Object.entries(CALL_SIGNAL_FACTORS) as Array<
    [keyof CallScoreSignals, ScoreFactor]
  >) {
    const text = signals[fieldName];
    if (!text) continue;

    const factorMaps = maps.filter((map) => map.factor === factor);
    if (factorMaps.length === 0) {
      ignoredFields.push(fieldName);
      notes.push({
        fieldName,
        factor,
        read: text,
        produced: null,
        detail: `Call spoke to ${FACTOR_LABELS[factor]} but this workspace has no map for that factor, so it was left unchanged.`,
      });
      continue;
    }

    let matched: { map: ScoreFieldMap; rule: ScoreFieldRule } | null = null;
    for (const map of factorMaps) {
      const rule = matchCallRule(text, map.rules);
      if (rule) {
        matched = { map, rule };
        break;
      }
    }

    if (!matched) {
      notes.push({
        fieldName,
        factor,
        read: text,
        produced: null,
        detail: `Call spoke to ${FACTOR_LABELS[factor]} but the wording did not match a mapped answer, so that factor was left unchanged rather than guessed.`,
      });
      continue;
    }

    factors[factor] = matched.rule.score;
    notes.push({
      fieldName,
      factor,
      read: text,
      produced: matched.rule.score,
      detail: `Call “${matched.map.fieldName}” matched ${JSON.stringify(matched.rule.answerValue ?? matched.rule.score)} → ${FACTOR_LABELS[factor]} ${matched.rule.score}.`,
    });
  }

  return { factors, notes, ignoredFields };
}

/**
 * Map application answers through org-configured field maps.
 * Unmapped fields are ignored. A mapped field with no matching rule yields
 * unknown for that factor — never a default number.
 */
export function extractFactors(
  answers: Record<string, unknown>,
  maps: ScoreFieldMap[]
): ExtractionResult {
  const factors = emptyFactors();
  const notes: ExtractionNote[] = [];
  const mappedFields = new Set(maps.map((map) => map.fieldName));
  const ignoredFields = Object.keys(answers).filter((key) => !mappedFields.has(key));

  for (const map of maps) {
    const raw = Object.prototype.hasOwnProperty.call(answers, map.fieldName)
      ? answers[map.fieldName]
      : undefined;
    const read = stringifyAnswer(raw);

    if (raw === undefined) {
      notes.push({
        fieldName: map.fieldName,
        factor: map.factor,
        read: null,
        produced: null,
        detail: `No application field “${map.fieldName}” for ${FACTOR_LABELS[map.factor]}.`,
      });
      continue;
    }

    const matched = matchRule(raw, map.rules);
    if (!matched) {
      notes.push({
        fieldName: map.fieldName,
        factor: map.factor,
        read,
        produced: null,
        detail: `Answer ${JSON.stringify(read)} on “${map.fieldName}” did not match a ${FACTOR_LABELS[map.factor]} mapping, so that factor stayed unknown.`,
      });
      continue;
    }

    if (factors[map.factor] === null) {
      factors[map.factor] = matched.score;
      notes.push({
        fieldName: map.fieldName,
        factor: map.factor,
        read,
        produced: matched.score,
        detail: `“${map.fieldName}” = ${JSON.stringify(read)} → ${FACTOR_LABELS[map.factor]} ${matched.score}.`,
      });
    } else {
      notes.push({
        fieldName: map.fieldName,
        factor: map.factor,
        read,
        produced: matched.score,
        detail: `“${map.fieldName}” also maps to ${FACTOR_LABELS[map.factor]} but that factor was already set; the first match was kept.`,
      });
    }
  }

  return { factors, notes, ignoredFields };
}

export function extractionReasoning(notes: ExtractionNote[], ignoredFields: string[]): string {
  const lines = notes.map((note) => note.detail);
  if (ignoredFields.length > 0) {
    lines.push(
      `Ignored unmapped ${ignoredFields.length === 1 ? "field" : "fields"}: ${ignoredFields.join(", ")}.`
    );
  }
  return lines.join(" ");
}

export function isScoreFactor(value: string): value is ScoreFactor {
  return (SCORE_FACTORS as readonly string[]).includes(value);
}
