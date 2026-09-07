import { describe, expect, it } from "vitest";

import { extractCallFactors, extractFactors, parseNumericAnswer, type ScoreFieldMap } from "@/lib/scoring/extract";

function maps(): ScoreFieldMap[] {
  return [
    {
      id: "m-timeline",
      fieldName: "timeline",
      factor: "timeline",
      rules: [
        { id: "r1", kind: "choice", answerValue: "30 days", rangeMin: null, rangeMax: null, score: 80 },
        { id: "r2", kind: "choice", answerValue: "this week", rangeMin: null, rangeMax: null, score: 95 },
        { id: "r2b", kind: "choice", answerValue: "after q1", rangeMin: null, rangeMax: null, score: 30 },
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

  it("maps a spoken call signal through the factor's maps, not the form field name", () => {
    const result = extractCallFactors(
      {
        timeline_signal: "Realistically we are looking at after Q1.",
        budget_signal: null,
        decision_process: "My partner has to be in the room for this.",
      },
      maps()
    );
    expect(result.factors.timeline).toBe(30);
    expect(result.factors.investment_capacity).toBeNull();
    expect(result.factors.decision_authority).toBeNull();
    expect(result.factors.pain_severity).toBeNull();
  });

  it("does not guess a number when the spoken signal matches no mapped answer", () => {
    const result = extractCallFactors(
      { timeline_signal: "whenever the stars align", budget_signal: null, decision_process: null },
      maps()
    );
    expect(result.factors.timeline).toBeNull();
    expect(result.notes.some((note) => note.detail.includes("left unchanged"))).toBe(true);
  });

  it("lets the longest mapped phrase win so 15k beats 5k", () => {
    const result = extractCallFactors(
      { timeline_signal: null, budget_signal: "we can do 15k this quarter", decision_process: null },
      maps()
    );
    expect(result.factors.investment_capacity).toBe(80);
  });
});

describe("mapping is per-org configuration", () => {
  // The whole reason mappings live in a table is that a $3K coach and a $15K
  // consultant read the same answer differently. Identical answers, different
  // org config, different factor values — with no code change between them.
  it("scores identical application answers differently under two orgs' mappings", () => {
    const answers = { timeline: "next quarter", annual_revenue: 90000 };

    const patientCoach: ScoreFieldMap[] = [
      {
        id: "a-timeline",
        fieldName: "timeline",
        factor: "timeline",
        rules: [
          { id: "a1", kind: "choice", answerValue: "next quarter", rangeMin: null, rangeMax: null, score: 70 },
        ],
      },
      {
        id: "a-revenue",
        fieldName: "annual_revenue",
        factor: "investment_capacity",
        rules: [
          { id: "a2", kind: "range", answerValue: null, rangeMin: 50000, rangeMax: 150000, score: 85 },
        ],
      },
    ];

    const urgentConsultant: ScoreFieldMap[] = [
      {
        id: "b-timeline",
        fieldName: "timeline",
        factor: "timeline",
        rules: [
          { id: "b1", kind: "choice", answerValue: "next quarter", rangeMin: null, rangeMax: null, score: 20 },
        ],
      },
      {
        id: "b-revenue",
        fieldName: "annual_revenue",
        factor: "investment_capacity",
        rules: [
          { id: "b2", kind: "range", answerValue: null, rangeMin: 50000, rangeMax: 150000, score: 25 },
        ],
      },
    ];

    const coach = extractFactors(answers, patientCoach);
    const consultant = extractFactors(answers, urgentConsultant);

    expect(coach.factors.timeline).toBe(70);
    expect(coach.factors.investment_capacity).toBe(85);
    expect(consultant.factors.timeline).toBe(20);
    expect(consultant.factors.investment_capacity).toBe(25);
  });

  it("leaves a factor unknown for an org that maps no field to it", () => {
    const onlyTimeline: ScoreFieldMap[] = [
      {
        id: "c-timeline",
        fieldName: "timeline",
        factor: "timeline",
        rules: [
          { id: "c1", kind: "choice", answerValue: "this week", rangeMin: null, rangeMax: null, score: 95 },
        ],
      },
    ];

    const result = extractFactors({ timeline: "this week", authority: "I decide" }, onlyTimeline);
    expect(result.factors.timeline).toBe(95);
    expect(result.factors.decision_authority).toBeNull();
    expect(result.ignoredFields).toContain("authority");
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
