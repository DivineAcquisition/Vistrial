import { describe, expect, it } from "vitest";

import { computeReadinessScore } from "@/lib/scoring/compute";
import { extractFactors, type ScoreFieldMap } from "@/lib/scoring/extract";

const maps: ScoreFieldMap[] = [
  {
    id: "t",
    fieldName: "timeline",
    factor: "timeline",
    rules: [{ id: "t1", kind: "choice", answerValue: "30 days", rangeMin: null, rangeMax: null, score: 80 }],
  },
  {
    id: "b",
    fieldName: "budget",
    factor: "investment_capacity",
    rules: [{ id: "b1", kind: "choice", answerValue: "15k", rangeMin: null, rangeMax: null, score: 80 }],
  },
];

const weights = {
  timeline: 35,
  investment_capacity: 30,
  decision_authority: 20,
  pain_severity: 15,
};

describe("intake-shaped flow", () => {
  it("scores Maya-like answers from maps without defaulting unknown factors to zero", () => {
    const extracted = extractFactors({ timeline: "30 days", budget: "15k", extra: "ignored" }, maps);
    expect(extracted.factors.decision_authority).toBeNull();
    expect(extracted.factors.pain_severity).toBeNull();
    expect(extracted.ignoredFields).toEqual(["extra"]);
    const computed = computeReadinessScore(extracted.factors, weights);
    expect(computed.kind).toBe("scored");
    if (computed.kind !== "scored") return;
    expect(computed.total).toBe(80);
    expect(computed.confidence).toBe("low");
  });
});
