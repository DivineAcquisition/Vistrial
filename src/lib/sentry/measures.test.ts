import { describe, expect, it } from "vitest";

import { sentryStatus, summarizeMeasures } from "@/lib/sentry/measures";

describe("Sentry measures", () => {
  it("reports average, median, and share within the window", () => {
    const summary = summarizeMeasures([
      { metric: "time_to_first_touch", seconds: 300, met: true },
      { metric: "time_to_first_touch", seconds: 900, met: true },
      { metric: "time_to_first_touch", seconds: 3600, met: false },
      { metric: "gap", seconds: 7200, met: true },
      { metric: "gap", seconds: 99999, met: false },
    ]);
    expect(summary.firstTouches).toBe(3);
    expect(summary.averageMinutes).toBeCloseTo(26.67, 1);
    expect(summary.medianMinutes).toBe(15);
    expect(summary.withinWindowPercent).toBeCloseTo(66.7, 0);
    expect(summary.gapsMetPercent).toBe(50);
  });

  it("says nothing rather than zero when there is no data", () => {
    const summary = summarizeMeasures([]);
    expect(summary.averageMinutes).toBeNull();
    expect(summary.withinWindowPercent).toBeNull();
  });

  it("shows a quiet sweep as stopped, and a pause as paused", () => {
    const now = Date.parse("2026-06-02T14:00:00.000Z");
    expect(sentryStatus({ mode: "live", lastSweepAt: "2026-06-02T13:59:30.000Z", lastError: null, now }).state).toBe("watching");
    expect(sentryStatus({ mode: "live", lastSweepAt: "2026-06-02T13:00:00.000Z", lastError: null, now }).state).toBe("stopped");
    expect(sentryStatus({ mode: "practice", lastSweepAt: null, lastError: "paused", now }).state).toBe("paused");
    expect(sentryStatus({ mode: "live", lastSweepAt: null, lastError: "config", now }).state).toBe("stopped");
    expect(sentryStatus({ mode: "off", lastSweepAt: null, lastError: null, now }).state).toBe("off");
  });
});
