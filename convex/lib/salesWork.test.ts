import { describe, expect, it } from "vitest";

import {
  LIBRARY_ACCEPTANCE,
  MIN_PATTERN_SAMPLE,
  buildContentCalendar,
  buildCopySets,
  buildCreativeBrief,
  buildResearchReport,
  profileReady,
} from "./salesWork";

const facts = {
  offer: "A recorded sales system",
  price: "$12,000",
  audience: "High-ticket closers",
  voice: "Direct",
  examples: "",
  pastAds: "",
  competitors: "Other closers",
};

describe("sales work", () => {
  it("says not enough data below the sample, and never claims a public result", () => {
    const report = buildResearchReport({
      facts,
      swipe: [{ excerpt: "A short line from a public page", sourceName: "Example Daily" }],
      ownResultsConnected: false,
      libraryAccepted: false,
    });
    expect(report.body).toContain("Not enough data.");
    expect(report.body).toContain("Public ad library collection is off");
    expect(report.body.toLowerCase()).not.toMatch(/earned|converted/);
    expect(MIN_PATTERN_SAMPLE).toBe(3);
    expect(LIBRARY_ACCEPTANCE.length).toBeGreaterThan(10);
  });

  it("names the source once there is a large enough swipe file", () => {
    const report = buildResearchReport({
      facts,
      swipe: [
        { excerpt: "One", sourceName: "Paper" },
        { excerpt: "Two", sourceName: "Paper" },
        { excerpt: "Three", sourceName: "Journal" },
      ],
      ownResultsConnected: false,
      libraryAccepted: true,
    });
    expect(report.body).toContain("Journal");
    expect(report.body).not.toContain("Not enough data.");
  });

  it("refuses copy, briefs, and calendars without an offer and an audience", () => {
    expect(profileReady({ offer: "", audience: "Closers" })).toBe(false);
    expect(() => buildCopySets({ ...facts, offer: " " })).toThrow("Not enough data.");
    expect(() => buildCreativeBrief({ ...facts, audience: "" })).toThrow("Not enough data.");
    expect(() => buildContentCalendar({ ...facts, offer: "" })).toThrow("Not enough data.");
  });

  it("hands back original copy from the profile", () => {
    const copy = buildCopySets(facts);
    expect(copy.body).toContain("A recorded sales system");
    expect(copy.body).toContain("High-ticket closers");
    expect(copy.body.toLowerCase()).not.toMatch(/earned|converted/);
  });
});
