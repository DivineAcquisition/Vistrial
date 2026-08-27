import { describe, expect, it } from "vitest";

import { formatIsoDate, isIsoDate, parseIsoDate } from "@/lib/dates/iso";

describe("iso calendar dates", () => {
  it("round-trips a local calendar day", () => {
    const parsed = parseIsoDate("2026-08-27");
    expect(parsed).toBeInstanceOf(Date);
    expect(formatIsoDate(parsed!)).toBe("2026-08-27");
  });

  it("rejects impossible days", () => {
    expect(parseIsoDate("2026-02-31")).toBeUndefined();
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("reads the date prefix from a datetime string", () => {
    expect(formatIsoDate(parseIsoDate("2026-01-02T15:00:00Z")!)).toBe("2026-01-02");
  });
});
