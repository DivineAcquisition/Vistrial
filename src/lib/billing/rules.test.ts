import { describe, expect, it } from "vitest";

import {
  creditNeedsSecondAdmin,
  daysSinceFailure,
  leadCaptureContinues,
  quoteIsSingleAdmin,
  quoteNeedsSecondAdmin,
  restrictionState,
} from "@/lib/billing/rules";

describe("failed payment days", () => {
  it("keeps the workspace fully on through day 7, then restricts, suspends, and closes", () => {
    expect(restrictionState(0)).toBe("past_due");
    expect(restrictionState(1)).toBe("past_due");
    expect(restrictionState(6)).toBe("past_due");
    expect(restrictionState(7)).toBe("past_due");
    expect(restrictionState(8)).toBe("restricted");
    expect(restrictionState(29)).toBe("restricted");
    expect(restrictionState(30)).toBe("suspended");
    expect(restrictionState(59)).toBe("suspended");
    expect(restrictionState(60)).toBe("canceled");
  });

  it("counts calendar days, not partial hours", () => {
    expect(daysSinceFailure("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysSinceFailure("2026-10-01", "2026-10-09")).toBe(8);
  });
});

describe("quoted prices and credits", () => {
  it("asks for a second Platform Admin under $97 only when one exists", () => {
    expect(quoteNeedsSecondAdmin(9600, 2)).toBe(true);
    expect(quoteNeedsSecondAdmin(9700, 2)).toBe(false);
    expect(quoteNeedsSecondAdmin(5000, 1)).toBe(false);
    expect(quoteIsSingleAdmin(5000, 1)).toBe(true);
    expect(quoteIsSingleAdmin(5000, 2)).toBe(false);
  });

  it("asks for a second admin above one month of price", () => {
    expect(creditNeedsSecondAdmin(9701, 9700, 2)).toBe(true);
    expect(creditNeedsSecondAdmin(9700, 9700, 2)).toBe(false);
    expect(creditNeedsSecondAdmin(20000, 9700, 1)).toBe(false);
  });
});

describe("hard caps", () => {
  it("still captures the lead when the AI case file is over the limit", () => {
    expect(leadCaptureContinues({ allowed: false, capture: true })).toBe(true);
    expect(leadCaptureContinues({ allowed: true })).toBe(true);
  });
});
