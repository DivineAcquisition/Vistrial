import { describe, expect, it } from "vitest";

import { buildPortalSummary, UNEVENTFUL_FINDING } from "@/lib/portal/summary";
import { summaryOverstates } from "@/lib/reporting/summary";

const base = {
  outcome: {
    headline: { k: 8, n: 40, per_hundred: 20, too_small: false, sample_label: "8 of 40" },
    comparison: { shown: false, plain: "No pre-activation comparison is shown." },
    attribution: "Vistrial did not close these deals. The client's team did.",
    correlation_caveat: "A change after activation is not proof that Vistrial caused it.",
  },
  previousOutcome: {
    headline: { k: 8, n: 40, per_hundred: 20, too_small: false, sample_label: "8 of 40" },
  },
  coverage: { ever_touched: { k: 36, n: 40, pct: 90, too_small: false } },
  previousCoverage: { ever_touched: { k: 36, n: 40, pct: 90, too_small: false } },
  sources: {},
  terminal: { too_small: true, suppressed_plain: "Not enough terminal outcomes." },
  speed: { too_small: true },
};

describe("owner portal summary", () => {
  it("says nothing needs attention when the period is uneventful", () => {
    const text = buildPortalSummary(base);
    expect(text).toContain(UNEVENTFUL_FINDING);
    expect(text).not.toContain("The biggest leak");
    expect(summaryOverstates(text)).toBe(false);
  });

  it("shows a decline instead of hiding it", () => {
    const text = buildPortalSummary({
      ...base,
      outcome: {
        ...base.outcome,
        headline: { k: 6, n: 40, per_hundred: 15, too_small: false, sample_label: "6 of 40" },
      },
      previousOutcome: {
        headline: { k: 10, n: 40, per_hundred: 25, too_small: false, sample_label: "10 of 40" },
      },
    });
    expect(text).toContain("declined");
    expect(text).not.toContain(UNEVENTFUL_FINDING);
  });

  it("refuses copy that credits Vistrial with a close", () => {
    expect(() =>
      buildPortalSummary({
        ...base,
        outcome: {
          ...base.outcome,
          attribution: "Vistrial closed these deals.",
        },
      })
    ).toThrow(/overclaimed/);
  });
});
