import { describe, expect, it } from "vitest";

import {
  computeReadinessScore,
  scoreConfidenceFromKnownCount,
  type FactorValues,
  type ScoreWeights,
} from "@/lib/scoring/compute";

/** Fixture org config for tests — not an application default. */
const NORTHSTAR: ScoreWeights = {
  timeline: 35,
  investment_capacity: 30,
  decision_authority: 20,
  pain_severity: 15,
};

const CUSTOM: ScoreWeights = {
  timeline: 50,
  investment_capacity: 10,
  decision_authority: 10,
  pain_severity: 30,
};

function factors(partial: Partial<FactorValues>): FactorValues {
  return {
    timeline: null,
    investment_capacity: null,
    decision_authority: null,
    pain_severity: null,
    ...partial,
  };
}

describe("computeReadinessScore", () => {
  it("scores all four known factors as the weighted sum, rounded", () => {
    const result = computeReadinessScore(
      factors({
        timeline: 90,
        investment_capacity: 80,
        decision_authority: 85,
        pain_severity: 75,
      }),
      NORTHSTAR
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // 90*0.35 + 80*0.30 + 85*0.20 + 75*0.15 = 31.5 + 24 + 17 + 11.25 = 83.75 → 84
    expect(result.total).toBe(84);
    expect(result.confidence).toBe("high");
    expect(result.knownFactorCount).toBe(4);
    expect(result.unknownFactors).toEqual([]);
    expect(result.explanation).toContain("Score 84");
    expect(result.explanation).toContain("timeline 90 (weight 35)");
    expect(result.explanation).toContain("high");
    expect(result.explanation).not.toContain("unknown");
  });

  it("returns an explicit unscored result when every factor is unknown, not zero", () => {
    const result = computeReadinessScore(factors({}), NORTHSTAR);
    expect(result.kind).toBe("unscored");
    if (result.kind !== "unscored") return;
    expect(result.knownFactorCount).toBe(0);
    expect(result.confidence).toBe("none");
    expect(result.explanation).toMatch(/no score/i);
    expect(result.explanation).not.toMatch(/\b0\b/);
  });

  it("omits a missing timeline and redistributes its weight", () => {
    const result = computeReadinessScore(
      factors({
        investment_capacity: 80,
        decision_authority: 50,
        pain_severity: 20,
      }),
      NORTHSTAR
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // known weights 30+20+15=65
    // 80*30/65 + 50*20/65 + 20*15/65 = 36.923 + 15.385 + 4.615 = 56.923 → 57
    expect(result.total).toBe(57);
    expect(result.unknownFactors).toEqual(["timeline"]);
    expect(result.confidence).toBe("moderate");
    expect(result.usedWeights.timeline).toBe(0);
    expect(result.usedWeights.investment_capacity).toBeCloseTo((30 / 65) * 100);
    expect(result.explanation).toMatch(/timeline was unknown/i);
    expect(result.explanation).toMatch(/not treated as zero/i);
    expect(result.explanation).toMatch(/moderate/);
  });

  it("omits a missing investment capacity and redistributes", () => {
    const result = computeReadinessScore(
      factors({
        timeline: 100,
        decision_authority: 100,
        pain_severity: 100,
      }),
      NORTHSTAR
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.total).toBe(100);
    expect(result.unknownFactors).toEqual(["investment_capacity"]);
    expect(result.confidence).toBe("moderate");
  });

  it("omits a missing decision authority and redistributes", () => {
    const result = computeReadinessScore(
      factors({
        timeline: 40,
        investment_capacity: 40,
        pain_severity: 40,
      }),
      NORTHSTAR
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.total).toBe(40);
    expect(result.unknownFactors).toEqual(["decision_authority"]);
  });

  it("omits a missing pain severity and redistributes", () => {
    const result = computeReadinessScore(
      factors({
        timeline: 0,
        investment_capacity: 0,
        decision_authority: 0,
      }),
      NORTHSTAR
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.total).toBe(0);
    expect(result.unknownFactors).toEqual(["pain_severity"]);
  });

  it("handles two factors missing (low confidence)", () => {
    const result = computeReadinessScore(
      factors({
        timeline: 90,
        investment_capacity: 80,
      }),
      NORTHSTAR
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // 90*35/65 + 80*30/65 = 48.462 + 36.923 = 85.385 → 85
    expect(result.total).toBe(85);
    expect(result.knownFactorCount).toBe(2);
    expect(result.confidence).toBe("low");
    expect(result.unknownFactors).toEqual(["decision_authority", "pain_severity"]);
    expect(result.explanation).toMatch(/low/);
    expect(result.explanation).toMatch(/less trustworthy/);
  });

  it("handles three factors missing (very low confidence)", () => {
    const result = computeReadinessScore(factors({ timeline: 70 }), NORTHSTAR);

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.total).toBe(70);
    expect(result.confidence).toBe("very_low");
    expect(result.knownFactorCount).toBe(1);
    expect(result.explanation).toMatch(/thin reading/);
  });

  it("clamps a total of 0 and 100 at the boundaries", () => {
    const zeros = computeReadinessScore(
      factors({
        timeline: 0,
        investment_capacity: 0,
        decision_authority: 0,
        pain_severity: 0,
      }),
      NORTHSTAR
    );
    const hundreds = computeReadinessScore(
      factors({
        timeline: 100,
        investment_capacity: 100,
        decision_authority: 100,
        pain_severity: 100,
      }),
      NORTHSTAR
    );

    expect(zeros.kind).toBe("scored");
    expect(hundreds.kind).toBe("scored");
    if (zeros.kind !== "scored" || hundreds.kind !== "scored") return;
    expect(zeros.total).toBe(0);
    expect(hundreds.total).toBe(100);
  });

  it("uses the passed-in weights, including a config that is not the usual 35/30/20/15 split", () => {
    const result = computeReadinessScore(
      factors({
        timeline: 20,
        investment_capacity: 100,
        decision_authority: 100,
        pain_severity: 100,
      }),
      CUSTOM
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // 20*0.50 + 100*0.10 + 100*0.10 + 100*0.30 = 10 + 10 + 10 + 30 = 60
    expect(result.total).toBe(60);
    expect(result.explanation).toContain("weight 50");
    expect(result.explanation).toContain("weight 10");
    expect(result.explanation).toContain("weight 30");
  });

  it("under a custom config, a missing heavy factor redistributes onto the rest", () => {
    const result = computeReadinessScore(
      factors({
        investment_capacity: 0,
        decision_authority: 0,
        pain_severity: 100,
      }),
      CUSTOM
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // known 10+10+30=50; 0*10/50 + 0*10/50 + 100*30/50 = 60
    expect(result.total).toBe(60);
    expect(result.unknownFactors).toEqual(["timeline"]);
  });

  it("rejects factor values outside 0–100", () => {
    expect(() =>
      computeReadinessScore(factors({ timeline: 101, investment_capacity: 0, decision_authority: 0, pain_severity: 0 }), NORTHSTAR)
    ).toThrow(/timeline/);
    expect(() =>
      computeReadinessScore(factors({ timeline: -1 }), NORTHSTAR)
    ).toThrow(/timeline/);
  });

  // A config can legally zero out a factor. If the only factor we know is one
  // the org gave no weight to, there is no arithmetic to do — and returning 0
  // would read as "not ready" rather than "not measured".
  it("returns unscored when the only known factor carries no weight", () => {
    const result = computeReadinessScore(factors({ pain_severity: 90 }), {
      timeline: 60,
      investment_capacity: 40,
      decision_authority: 0,
      pain_severity: 0,
    });
    expect(result.kind).toBe("unscored");
    expect(result.confidence).toBe("none");
    expect(result.explanation).toMatch(/no weight/i);
  });

  it("still scores when a zero-weight factor is known alongside a weighted one", () => {
    const result = computeReadinessScore(
      factors({ timeline: 80, pain_severity: 0 }),
      { timeline: 100, investment_capacity: 0, decision_authority: 0, pain_severity: 0 }
    );
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // pain_severity has no weight, so it cannot pull the total off timeline.
    expect(result.total).toBe(80);
  });

  it("does not let a zero-valued factor read as unknown", () => {
    const result = computeReadinessScore(
      factors({ timeline: 0, investment_capacity: 100 }),
      NORTHSTAR
    );
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.knownFactorCount).toBe(2);
    expect(result.unknownFactors).toEqual(["decision_authority", "pain_severity"]);
    // 0 at weight 35 and 100 at weight 30, redistributed across 65.
    expect(result.total).toBe(46);
  });
});

describe("scoreConfidenceFromKnownCount", () => {
  it("maps known-factor counts onto the confidence ladder", () => {
    expect(scoreConfidenceFromKnownCount(4)).toBe("high");
    expect(scoreConfidenceFromKnownCount(3)).toBe("moderate");
    expect(scoreConfidenceFromKnownCount(2)).toBe("low");
    expect(scoreConfidenceFromKnownCount(1)).toBe("very_low");
  });

  it("has no confidence to report when nothing is known", () => {
    expect(scoreConfidenceFromKnownCount(0)).toBeNull();
    expect(scoreConfidenceFromKnownCount(-1)).toBeNull();
  });
});
