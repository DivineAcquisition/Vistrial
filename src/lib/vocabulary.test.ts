import { describe, expect, it } from "vitest";

import { WORDS, waitingFor } from "@/lib/vocabulary";

describe("waiting time", () => {
  const now = "2026-08-30T12:00:00.000Z";

  it("reads the way a person would say it", () => {
    expect(waitingFor("2026-08-30T11:59:30.000Z", now)).toBe("just now");
    expect(waitingFor("2026-08-30T11:30:00.000Z", now)).toBe("30 min");
    expect(waitingFor("2026-08-30T09:00:00.000Z", now)).toBe("3 hr");
    expect(waitingFor("2026-08-29T12:00:00.000Z", now)).toBe("1 day");
    expect(waitingFor("2026-08-27T12:00:00.000Z", now)).toBe("3 days");
  });

  it("shows a dash rather than a wrong number when there is no timestamp", () => {
    expect(waitingFor(null, now)).toBe("—");
  });
});

describe("the words themselves", () => {
  it("uses no internal vocabulary in any user-facing label", () => {
    const banned = [
      /readiness/i,
      /\btrack\b/i,
      /speed.to.lead/i,
      /\bghost/i,
      /\bdispatch/i,
      /extraction/i,
      /\bcohort/i,
      /\bbacklog/i,
      /\bholdout/i,
      /\bbreach/i,
      /model version/i,
    ];
    for (const value of [
      ...Object.values(WORDS),
    ]) {
      for (const pattern of banned) {
        expect(value, `"${value}" still uses internal vocabulary`).not.toMatch(pattern);
      }
    }
  });

  it("uses no acronyms in any user-facing label", () => {
    for (const value of [
      ...Object.values(WORDS),
    ]) {
      expect(value, `"${value}" contains an acronym`).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});
