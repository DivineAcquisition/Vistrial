import { describe, expect, it } from "vitest";

import { leadsWaitingCount, showWelcomeBanner } from "@/lib/home/simple";

describe("home numbers", () => {
  it("adds missed leads and leads close to a deadline", () => {
    expect(leadsWaitingCount(2, 3)).toBe(5);
    expect(leadsWaitingCount(null, 1)).toBe(1);
    expect(leadsWaitingCount(null, null)).toBe(0);
  });

  it("shows the welcome line only for the first seven days after go-live", () => {
    const start = Date.parse("2026-10-01T00:00:00Z");
    expect(showWelcomeBanner(new Date(start).toISOString(), start + 6 * 24 * 60 * 60 * 1000)).toBe(true);
    expect(showWelcomeBanner(new Date(start).toISOString(), start + 8 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(showWelcomeBanner(null, start)).toBe(false);
  });
});
