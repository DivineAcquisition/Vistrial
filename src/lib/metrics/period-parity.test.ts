import { describe, expect, it } from "vitest";

import { resolveHomePeriod } from "@/lib/home/periods";
import { comparisonAllowed, COMPARISON_MIN, SMALL_SAMPLE } from "@/lib/metrics/definitions";
import { resolveResultsRange } from "@/lib/metrics/range";

describe("Home and Results use the same instants", () => {
  const now = new Date("2026-10-15T15:30:00.000Z");
  const timeZone = "America/New_York";

  it("matches last 30 days and this month", () => {
    for (const key of ["last_30_days", "this_month"] as const) {
      const home = resolveHomePeriod(key, { now, timeZone });
      const results = resolveResultsRange({ range: key }, { now, timeZone });
      expect(results.from).toBe(home.from);
      expect(results.to).toBe(home.to);
      expect(results.previous.from).toBe(home.previous.from);
      expect(results.previous.to).toBe(home.previous.to);
    }
  });
});

describe("sample thresholds", () => {
  it("keeps rates visible from 10 and hides comparisons under 20", () => {
    expect(SMALL_SAMPLE).toBe(10);
    expect(COMPARISON_MIN).toBe(20);
    expect(comparisonAllowed(19, 40)).toBe(false);
    expect(comparisonAllowed(20, 20)).toBe(true);
  });
});
