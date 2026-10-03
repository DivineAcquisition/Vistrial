import { describe, expect, it } from "vitest";

import { countAppointments, countMessages } from "@/lib/forsight/ghl";
import { addDays, weekEnd, weekLabel, weekStartFor } from "@/lib/forsight/weeks";

describe("weeks run Monday to Sunday", () => {
  it("puts every day of a week on the same Monday", () => {
    expect(weekStartFor("2026-08-31")).toBe("2026-08-31");
    expect(weekStartFor("2026-09-03")).toBe("2026-08-31");
    expect(weekStartFor("2026-09-06")).toBe("2026-08-31");
    expect(weekStartFor("2026-09-07")).toBe("2026-09-07");
  });

  it("names a week the way the dashboard shows it", () => {
    expect(weekLabel("2026-08-31")).toBe("Week of 8/31");
    expect(weekEnd("2026-08-31")).toBe("2026-09-06");
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
    expect(weekStartFor("2027-01-03")).toBe("2026-12-28");
  });
});

describe("counting GHL activity", () => {
  it("counts every appointment as booked and splits the outcomes", () => {
    expect(
      countAppointments([
        { outcome: "held" },
        { outcome: "held" },
        { outcome: "no_show" },
        { outcome: "cancelled" },
        { outcome: null },
        { outcome: "rescheduled" },
      ])
    ).toEqual({ booked: 6, showed: 2, noShowed: 1, cancelled: 1 });
  });

  it("splits outbound by channel and counts inbound replies", () => {
    const counts = countMessages(
      [
        { direction: "outbound", channel: "sms", occurredAt: "2026-08-26T10:00:00Z" },
        { direction: "outbound", channel: "sms", occurredAt: "2026-08-26T11:00:00Z" },
        { direction: "outbound", channel: "email", occurredAt: "2026-08-27T10:00:00Z" },
        { direction: "outbound", channel: "call", occurredAt: "2026-08-27T12:00:00Z" },
        { direction: "inbound", channel: "sms", occurredAt: "2026-08-27T13:00:00Z" },
      ],
      { from: "2026-08-25", to: "2026-08-31T23:59:59Z" },
      false
    );
    expect(counts).toEqual({
      outboundSms: 2,
      outboundEmail: 1,
      outboundOther: 1,
      inbound: 1,
      partial: false,
    });
  });

  it("drops messages from outside the week being reported on", () => {
    const counts = countMessages(
      [
        { direction: "inbound", channel: "sms", occurredAt: "2026-08-01T10:00:00Z" },
        { direction: "inbound", channel: "sms", occurredAt: "2026-08-26T10:00:00Z" },
      ],
      { from: "2026-08-25", to: "2026-08-31T23:59:59Z" },
      false
    );
    expect(counts.inbound).toBe(1);
  });

  it("carries the partial flag through, so a capped walk is never read as a total", () => {
    expect(countMessages([], { from: "2026-08-25", to: "2026-08-31T23:59:59Z" }, true).partial).toBe(
      true
    );
  });
});
