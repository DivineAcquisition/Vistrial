import { describe, expect, it } from "vitest";

import { contrastingPhrases, phraseFindingStatement } from "@/lib/coaching/language";
import { CALL_QUALITY_MIN_N } from "@/lib/coaching/constants";

const closed = Array.from({ length: CALL_QUALITY_MIN_N }, () => {
  return "Closer: Help me understand the decision authority here. Prospect: I decide. Closer: Thursday at two works.";
});
const lost = Array.from({ length: CALL_QUALITY_MIN_N }, () => {
  return "Closer: Anyway I will send the brochure. Prospect: I need to think it over.";
});

describe("what-works language contrast", () => {
  it("shows nothing below the sample floor", () => {
    expect(
      contrastingPhrases({
        closedTranscripts: closed.slice(0, 5),
        lostTranscripts: lost,
        minClosed: CALL_QUALITY_MIN_N,
      })
    ).toEqual([]);
  });

  it("describes a phrase that showed up on closed calls, and is not a script", () => {
    const rows = contrastingPhrases({
      closedTranscripts: closed,
      lostTranscripts: lost,
      minClosed: CALL_QUALITY_MIN_N,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.phrase.includes("decision authority"))).toBe(true);
    expect(rows.every((row) => row.closedShare > row.lostShare)).toBe(true);
    const statement = phraseFindingStatement(rows[0]!, closed.length, lost.length);
    expect(statement).toMatch(/not a script/i);
    expect(statement).toMatch(/description of the recordings/i);
  });
});
