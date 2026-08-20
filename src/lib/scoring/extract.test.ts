import { describe, expect, it } from "vitest";

import { extractFactors, parseNumericAnswer, type ScoreFieldMap } from "@/lib/scoring/extract";

function maps(): ScoreFieldMap[] {
  return [
    {
      id: "m-timeline",
      fieldName: "timeline",
      factor: "timeline",
      rules: [
        { id: "r1", kind: "choice", answerValue: "30 days", rangeMin: null, rangeMax: null, score: 80 },
        { id: "r2", kind: "choice", answerValue: "this week", rangeMin: null, rangeMax: null, score: 95 },
      ],
    },
    {
      id: "m-budget",
      fieldName: "budget",
      factor: "investment_capacity",
      rules: [
        { id: "r3", kind: "choice", answerValue: "15k", rangeMin: null, rangeMax: null, score: 80 },
      ],
    },
    {
      id: "m-revenue",
      fieldName: "annual_revenue",
      factor: "investment_capacity",
      rules: [
        { id: "r4", kind: "range", answerValue: null, rangeMin: 0, rangeMax: 50000, score: 20 },
        { id: "r5", kind: "range", answerValue: null, rangeMin: 50000, rangeMax: 150000, score: 50 },
        { id: "r6", kind: "range", answerValue: null, rangeMin: 150000, rangeMax: 1_000_000_000, score: 90 },
      ],
    },
    {
      id: "m-authority",
      fieldName: "authority",
      factor: "decision_authority",
      rules: [
        { id: "r7", kind: "choice", answerValue: "I decide", rangeMin: null, rangeMax: null, score: 100 },
      ],
    },
  ];
}

describe("extractFactors", () => {
  it("maps matching discrete answers to factor values", () => {
    const result = extractFactors({ timeline: "30 days", budget: "15k", authority: "I decide" }, maps());
    expect(result.factors.timeline).toBe(80);
    expect(result.factors.investment_capacity).toBe(80);
    expect(result.factors.decision_authority).toBe(100);
    expect(result.factors.pain_severity).toBeNull();
    expect(result.notes.some((note) => note.produced === 80 && note.factor === "timeline")).toBe(true);
  });

  it("treats a mapped field with no matching rule as unknown, never a default", () => {
    const result = extractFactors({ timeline: "someday maybe" }, maps());
    expect(result.factors.timeline).toBeNull();
    expect(result.factors.investment_capacity).toBeNull();
    expect(result.notes.some((note) => note.detail.includes("stayed unknown"))).toBe(true);
  });

  it("ignores unmapped application fields without error", () => {
    const result = extractFactors(
      { timeline: "this week", favorite_color: "blue", source: "facebook" },
      maps()
    );
    expect(result.factors.timeline).toBe(95);
    expect(result.ignoredFields.sort()).toEqual(["favorite_color", "source"]);
  });

  it("matches choice answers case-insensitively", () => {
    const result = extractFactors({ timeline: "  This Week " }, maps());
    expect(result.factors.timeline).toBe(95);
  });

  it("maps a numeric range, preferring the tightest band", () => {
    const result = extractFactors({ annual_revenue: "$80,000" }, maps());
    expect(result.factors.investment_capacity).toBe(50);
  });

  it("keeps the first mapped value when two fields target the same factor", () => {
    const result = extractFactors({ budget: "15k", annual_revenue: 200000 }, maps());
    expect(result.factors.investment_capacity).toBe(80);
  });
});

describe("parseNumericAnswer", () => {
  it("reads numbers, currency strings, and rejects non-numeric text", () => {
    expect(parseNumericAnswer(15000)).toBe(15000);
    expect(parseNumericAnswer("$80,000")).toBe(80000);
    expect(parseNumericAnswer("15k")).toBeNull();
    expect(parseNumericAnswer("soon")).toBeNull();
  });
});
