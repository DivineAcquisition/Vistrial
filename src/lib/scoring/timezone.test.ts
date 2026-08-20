import { describe, expect, it } from "vitest";

import { calendarDaysBetween } from "@/lib/scoring/timezone";

describe("calendarDaysBetween", () => {
  it("counts calendar dates in the org timezone, not the UTC date", () => {
    // 11pm Eastern on Jan 15 is already Jan 16 in UTC.
    const from = new Date("2026-01-02T05:00:00.000Z"); // Jan 2 00:00 America/New_York
    const to = new Date("2026-01-16T04:00:00.000Z"); // Jan 15 23:00 America/New_York
    expect(calendarDaysBetween(from, to, "America/New_York")).toBe(13);
    expect(calendarDaysBetween(from, to, "UTC")).toBe(14);
  });

  it("returns 0 on the same local date", () => {
    const a = new Date("2026-06-01T04:00:00.000Z");
    const b = new Date("2026-06-01T06:00:00.000Z");
    expect(calendarDaysBetween(a, b, "America/New_York")).toBe(0);
  });
});
