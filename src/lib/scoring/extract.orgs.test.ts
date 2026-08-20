import { expect, it } from "vitest";

import { extractFactors, type ScoreFieldMap } from "@/lib/scoring/extract";

it("scores identical answers differently under two orgs' maps", () => {
  const answers = { timeline: "soon" };
  const orgA: ScoreFieldMap[] = [
    {
      id: "a",
      fieldName: "timeline",
      factor: "timeline",
      rules: [{ id: "a1", kind: "choice", answerValue: "soon", rangeMin: null, rangeMax: null, score: 90 }],
    },
  ];
  const orgB: ScoreFieldMap[] = [
    {
      id: "b",
      fieldName: "timeline",
      factor: "timeline",
      rules: [{ id: "b1", kind: "choice", answerValue: "soon", rangeMin: null, rangeMax: null, score: 20 }],
    },
  ];
  expect(extractFactors(answers, orgA).factors.timeline).toBe(90);
  expect(extractFactors(answers, orgB).factors.timeline).toBe(20);
});
