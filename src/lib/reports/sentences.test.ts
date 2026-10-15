import { describe, expect, it } from "vitest";

import { draftFromFigures, figureHash, summaryMatchesFigures } from "@/lib/reports/sentences";

describe("client report sentences", () => {
  const figures = [
    { metric: "new_leads", value: 42 },
    { metric: "bookings", value: 6 },
  ];

  it("names each metric and only uses its figure", () => {
    const draft = draftFromFigures(figures);
    expect(draft).toContain("(new_leads)");
    expect(draft).toContain("(bookings)");
    expect(draft).toContain("42");
    expect(summaryMatchesFigures(draft, figures).ok).toBe(true);
  });

  it("blocks a number that is not in the payload", () => {
    const draft = draftFromFigures(figures).replace("42", "99");
    const result = summaryMatchesFigures(draft, figures);
    expect(result.ok).toBe(false);
  });

  it("changes the hash when a figure changes", () => {
    expect(figureHash(figures)).not.toBe(figureHash([{ metric: "new_leads", value: 41 }, figures[1]!]));
  });
});
