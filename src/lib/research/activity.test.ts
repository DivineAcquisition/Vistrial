import { describe, expect, it } from "vitest";

import { activityFeed, activityTotals, clock, nowWords, platformMix } from "./activity";

const step = (phase: string, extra: Record<string, unknown> = {}) => ({ phase, status: "completed", kind: "tool", resultCode: "ok", ...extra });

describe("activity feed", () => {
  it("puts supplied links first and found sources under the collect step", () => {
    const sources = [
      { id: "a", platform: "web", title: "A", origin: "supplied" },
      { id: "b", platform: "youtube", title: "B", origin: "found" },
      { id: "c", platform: "youtube", title: "C", origin: "found" },
      { id: "d", platform: "web", title: "D", origin: "found" },
    ];
    const feed = activityFeed([step("context"), step("brief"), step("research", { webSearches: 6, webFetches: 3 }), step("collect"), step("classify")], sources);
    expect(feed.map((row) => row.key)).toEqual(["supplied", "step-0", "step-1", "step-2", "step-3", "found", "step-4"]);
    expect(feed[3].detail).toBe("6 searches, 3 pages read.");
    expect(feed[5].title).toBe("Kept 3 sources");
    expect(feed[5].detail).toBe("2 YouTube, 1 Web");
  });

  it("says plainly when a step failed or checks did not pass", () => {
    const feed = activityFeed([step("write", { status: "failed" }), step("check", { resultCode: "checks_failed" }), step("revise", { kind: "note", resultCode: "over_budget" }), step("save", { resultCode: "needs_review" })], []);
    expect(feed.map((row) => row.tone)).toEqual(["critical", "warning", "warning", "warning"]);
    expect(feed[2].title).toBe("Skipped the revision");
  });

  it("names what it is doing now from the last finished step", () => {
    expect(nowWords([], "running")).toBe("Reading your business memory");
    expect(nowWords([step("collect")], "running")).toBe("Reading each source");
    expect(nowWords([step("check", { resultCode: "checks_failed" })], "running")).toBe("Revising the report");
    expect(nowWords([step("ask")], "waiting")).toBe("Waiting for your answer");
    expect(nowWords([step("save")], "completed")).toBeNull();
  });

  it("totals searches and pages, formats the clock and the mix", () => {
    expect(activityTotals([step("research", { webSearches: 4, webFetches: 2 }), step("research", { webSearches: 1 })])).toEqual({ searches: 5, pages: 2, steps: 2 });
    expect(clock(65_000)).toBe("1:05");
    expect(clock(3_725_000)).toBe("1:02:05");
    expect(platformMix([])).toBe("");
  });
});
