import { describe, expect, it } from "vitest";

import { isLong, splitPost } from "./post";

const WEEKLY = `This week at Northlight Growth and its four clients.

What finished
• Market report: executive coaching programs (approved November 6).
• Page teardown: danareyes.example.

What was measured
No result has been recorded yet.

Check-ins due
None.

Proposed for next week
• Test a two-call close (Aster Coaching). Expected: 2 to 5 more new clients a month (Your data)

These are on the Tasks board, waiting for an Owner or Admin. Writing this plan used 84 credits.`;

describe("a weekly report, split into the parts it has", () => {
  const parts = splitPost(WEEKLY);
  it("keeps the summary and the closing note as they are", () => {
    expect(parts.lead).toEqual(["This week at Northlight Growth and its four clients."]);
    expect(parts.tail).toEqual(["These are on the Tasks board, waiting for an Owner or Admin. Writing this plan used 84 credits."]);
  });
  it("reads each titled list with its lines", () => {
    expect(parts.sections.map((row) => [row.title, row.items.length, row.note])).toEqual([
      ["What finished", 2, ""],
      ["What was measured", 0, "No result has been recorded yet."],
      ["Check-ins due", 0, "None."],
      ["Proposed for next week", 1, ""],
    ]);
  });
  it("loses no line", () => {
    const again = [...parts.lead, ...parts.sections.flatMap((row) => [row.title, ...row.items, row.note]), ...parts.tail].filter(Boolean);
    for (const line of WEEKLY.split("\n").map((row) => row.replace(/^• /, "").trim()).filter(Boolean)) expect(again).toContain(line);
  });
});

describe("a post that is not a report", () => {
  it("comes back as plain paragraphs", () => {
    expect(splitPost("Conversions went from 64 to 47 (-27%) between the last two results files.")).toEqual({ lead: ["Conversions went from 64 to 47 (-27%) between the last two results files."], sections: [], tail: [] });
    expect(splitPost("Two publications reported it.\n\nThis is what 3 sources said. It is not a forecast.").sections).toEqual([]);
  });
  it("does not take a sentence for a title", () => {
    expect(splitPost("It publishes something where others can see it.\nType PUBLISH to approve.").sections).toEqual([]);
  });
  it("folds only what is long", () => {
    expect(isLong("Short.")).toBe(false);
    expect(isLong("x".repeat(241))).toBe(true);
    expect(isLong("a\nb\nc\nd\ne")).toBe(true);
  });
});
