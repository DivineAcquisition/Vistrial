export const SCORE_FACTORS = [
  "timeline",
  "investment_capacity",
  "decision_authority",
  "pain_severity",
] as const;

export type ScoreFactor = (typeof SCORE_FACTORS)[number];

export type FactorValues = Record<ScoreFactor, number | null>;

export type ScoreWeights = Record<ScoreFactor, number>;

export type ScoreConfidence = "high" | "moderate" | "low" | "very_low";

export const FACTOR_LABELS: Record<ScoreFactor, string> = {
  timeline: "timeline",
  investment_capacity: "investment capacity",
  decision_authority: "decision authority",
  pain_severity: "pain severity",
};

function isIntInRange(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

export function scoreConfidenceFromKnownCount(
  knownCount: number
): ScoreConfidence | null {
  if (knownCount <= 0) return null;
  if (knownCount >= 4) return "high";
  if (knownCount === 3) return "moderate";
  if (knownCount === 2) return "low";
  return "very_low";
}

function confidenceFor(knownCount: number): ScoreConfidence {
  return scoreConfidenceFromKnownCount(knownCount) ?? "very_low";
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export type ScoredResult = {
  kind: "scored";
  total: number;
  factors: FactorValues;
  /** Weights actually applied after unknown factors were dropped. Sum to 100. */
  usedWeights: Record<ScoreFactor, number>;
  unknownFactors: ScoreFactor[];
  knownFactors: ScoreFactor[];
  knownFactorCount: number;
  confidence: ScoreConfidence;
  explanation: string;
};

export type UnscoredResult = {
  kind: "unscored";
  factors: FactorValues;
  unknownFactors: ScoreFactor[];
  knownFactors: [];
  knownFactorCount: 0;
  confidence: "none";
  explanation: string;
};

export type ReadinessScoreResult = ScoredResult | UnscoredResult;

/**
 * Pure readiness total. Weights are passed in from org config — this function
 * has no defaults, no database, and no clock.
 *
 * Unknown factors are omitted, not treated as zero. Their weight is spread
 * across the known factors in proportion to the known weights.
 */
export function computeReadinessScore(
  factors: FactorValues,
  weights: ScoreWeights
): ReadinessScoreResult {
  for (const factor of SCORE_FACTORS) {
    const value = factors[factor];
    if (value !== null && !isIntInRange(value)) {
      throw new Error(`${FACTOR_LABELS[factor]} must be an integer from 0 to 100, or unknown.`);
    }
    const weight = weights[factor];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`${FACTOR_LABELS[factor]} weight must be a number of 0 or more.`);
    }
  }

  const knownFactors = SCORE_FACTORS.filter((factor) => factors[factor] !== null);
  const unknownFactors = SCORE_FACTORS.filter((factor) => factors[factor] === null);

  if (knownFactors.length === 0) {
    return {
      kind: "unscored",
      factors,
      unknownFactors: [...SCORE_FACTORS],
      knownFactors: [],
      knownFactorCount: 0,
      confidence: "none",
      explanation:
        "No score. Every factor was unknown — timeline, investment capacity, decision authority, and pain severity. A number here would be a guess, not a reading.",
    };
  }

  const knownWeightSum = knownFactors.reduce((sum, factor) => sum + weights[factor], 0);
  if (knownWeightSum === 0) {
    return {
      kind: "unscored",
      factors,
      unknownFactors,
      knownFactors: [],
      knownFactorCount: 0,
      confidence: "none",
      explanation:
        "No score. The known factors carry no weight in this workspace's config, so there is nothing to add up.",
    };
  }

  const usedWeights = {} as Record<ScoreFactor, number>;
  for (const factor of SCORE_FACTORS) {
    usedWeights[factor] = 0;
  }

  let weighted = 0;
  for (const factor of knownFactors) {
    const share = weights[factor] / knownWeightSum;
    usedWeights[factor] = share * 100;
    weighted += (factors[factor] as number) * share;
  }

  const total = Math.min(100, Math.max(0, Math.round(weighted)));
  const confidence = confidenceFor(knownFactors.length);

  const usedParts = knownFactors.map((factor) => {
    const original = weights[factor];
    const effective = Math.round(usedWeights[factor]);
    const value = factors[factor] as number;
    if (unknownFactors.length === 0) {
      return `${FACTOR_LABELS[factor]} ${value} (weight ${original})`;
    }
    return `${FACTOR_LABELS[factor]} ${value} (configured weight ${original}, ${effective} after redistributing unknowns)`;
  });

  let explanation = `Score ${total} from ${knownFactors.length} of 4 factors: ${joinList(usedParts)}.`;

  if (unknownFactors.length > 0) {
    explanation += ` ${joinList(unknownFactors.map((factor) => FACTOR_LABELS[factor]))} ${
      unknownFactors.length === 1 ? "was" : "were"
    } unknown and ${
      unknownFactors.length === 1 ? "was" : "were"
    } left out, not treated as zero. That weight was spread across the known factors.`;
  }

  explanation += ` Confidence is ${confidence}`;
  if (knownFactors.length === 4) {
    explanation += " because every factor was known.";
  } else if (knownFactors.length === 1) {
    explanation += " because only one factor was known — this is a thin reading.";
  } else {
    explanation += ` because ${4 - knownFactors.length} factor${
      4 - knownFactors.length === 1 ? " was" : "s were"
    } missing. A score from ${knownFactors.length} of 4 is less trustworthy than one from all four.`;
  }

  return {
    kind: "scored",
    total,
    factors,
    usedWeights,
    unknownFactors,
    knownFactors,
    knownFactorCount: knownFactors.length,
    confidence,
    explanation,
  };
}
