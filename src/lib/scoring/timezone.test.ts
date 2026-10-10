import { describe, expect, it } from "vitest";

import { calendarDaysBetween, ymdInZone } from "@/lib/scoring/timezone";
import { parseIanaTimeZone } from "@/lib/timezones";

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

  // A ghost threshold of 14 has to mean fourteen local dates even when one of
  // them is 23 or 25 hours long. Counting elapsed hours would drift a day here
  // and either flag a lead early or miss it entirely.
  it("counts local dates across a spring-forward transition", () => {
    // Mar 8 2026 is the US spring-forward date; this span contains it.
    const from = new Date("2026-03-01T17:00:00.000Z");
    const to = new Date("2026-03-15T16:00:00.000Z");
    expect(calendarDaysBetween(from, to, "America/New_York")).toBe(14);
  });

  it("counts local dates across a fall-back transition", () => {
    // Nov 1 2026 is the US fall-back date; this span contains it.
    const from = new Date("2026-10-25T16:00:00.000Z");
    const to = new Date("2026-11-08T17:00:00.000Z");
    expect(calendarDaysBetween(from, to, "America/New_York")).toBe(14);
  });

  it("handles a zone on a half-hour offset", () => {
    const from = new Date("2026-01-01T20:00:00.000Z"); // Jan 2 01:30 in Kolkata
    const to = new Date("2026-01-15T20:00:00.000Z");
    expect(calendarDaysBetween(from, to, "Asia/Kolkata")).toBe(14);
  });

  it("handles a zone far ahead of UTC", () => {
    const from = new Date("2026-01-01T11:00:00.000Z"); // already Jan 2 at +14
    const to = new Date("2026-01-15T11:00:00.000Z");
    expect(calendarDaysBetween(from, to, "Pacific/Kiritimati")).toBe(14);
  });

  it("is symmetric in sign", () => {
    const from = new Date("2026-06-01T12:00:00.000Z");
    const to = new Date("2026-06-15T12:00:00.000Z");
    expect(calendarDaysBetween(from, to, "America/New_York")).toBe(14);
    expect(calendarDaysBetween(to, from, "America/New_York")).toBe(-14);
  });
});

describe("ymdInZone", () => {
  it("reads the local calendar date, not the UTC one", () => {
    // 8pm Eastern on Jun 1 is already Jun 2 in UTC.
    const at = new Date("2026-06-02T00:00:00.000Z");
    expect(ymdInZone(at, "America/New_York")).toBe("2026-06-01");
    expect(ymdInZone(at, "UTC")).toBe("2026-06-02");
  });

  it("zero-pads month and day so keys sort", () => {
    expect(ymdInZone(new Date("2026-01-05T12:00:00.000Z"), "UTC")).toBe("2026-01-05");
  });
});

describe("parseIanaTimeZone", () => {
  it("accepts a real IANA zone and rejects garbage", () => {
    expect(parseIanaTimeZone("America/Chicago")).toBe("America/Chicago");
    expect(parseIanaTimeZone(" UTC ")).toBe("UTC");
    expect(parseIanaTimeZone("NotAZone")).toBeNull();
    expect(parseIanaTimeZone("")).toBeNull();
    expect(parseIanaTimeZone(null)).toBeNull();
  });
});
