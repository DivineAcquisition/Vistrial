import { describe, expect, it } from "vitest";

import {
  bookedCalls,
  compare,
  costPerBookedCall,
  firstReplyTime,
  formatReplyTime,
  noShowsRebooked,
  quietLeadsRecovered,
  revenueBooked,
  type CallRow,
} from "@/lib/home/metrics";
import { describeRange, parseHomePeriodKey, resolveHomePeriod } from "@/lib/home/periods";

const period = { from: "2026-09-28T05:00:00.000Z", to: "2026-10-02T17:00:00.000Z" };

describe("periods", () => {
  // Friday Oct 2 2026, noon in Chicago.
  const now = new Date("2026-10-02T17:00:00.000Z");

  it("starts this week on Monday in the workspace time zone", () => {
    const week = resolveHomePeriod("this_week", { now, timeZone: "America/Chicago" });
    expect(week.from).toBe("2026-09-28T05:00:00.000Z");
    expect(week.to).toBe(now.toISOString());
    expect(week.fromDate).toBe("2026-09-28");
    expect(week.toDate).toBe("2026-10-02");
    expect(week.comparisonLabel).toBe("from last week");
  });

  it("compares a running week against the same stretch of last week", () => {
    const week = resolveHomePeriod("this_week", { now, timeZone: "America/Chicago" });
    expect(week.previous.from).toBe("2026-09-21T05:00:00.000Z");
    expect(week.previous.to).toBe("2026-09-25T17:00:00.000Z");
    expect(Date.parse(week.to) - Date.parse(week.from)).toBe(
      Date.parse(week.previous.to) - Date.parse(week.previous.from)
    );
  });

  it("makes last week a whole Monday-to-Monday week", () => {
    const last = resolveHomePeriod("last_week", { now, timeZone: "America/Chicago" });
    expect(last.from).toBe("2026-09-21T05:00:00.000Z");
    expect(last.to).toBe("2026-09-28T05:00:00.000Z");
    expect(last.toDate).toBe("2026-09-27");
    expect(last.previous.from).toBe("2026-09-14T05:00:00.000Z");
  });

  it("starts this month on the 1st and compares the same days of last month", () => {
    const month = resolveHomePeriod("this_month", { now, timeZone: "America/Chicago" });
    expect(month.from).toBe("2026-10-01T05:00:00.000Z");
    expect(month.previous.from).toBe("2026-09-01T05:00:00.000Z");
    expect(month.previous.toDate).toBe("2026-09-02");
    expect(month.comparisonLabel).toBe("from the same days last month");
  });

  it("never lets last month's stretch run into this month", () => {
    const month = resolveHomePeriod("this_month", {
      now: new Date("2026-03-31T17:00:00.000Z"),
      timeZone: "America/Chicago",
    });
    expect(month.previous.to).toBe(month.from);
  });

  it("covers 30 calendar days including today", () => {
    const thirty = resolveHomePeriod("last_30_days", { now, timeZone: "America/Chicago" });
    expect(thirty.fromDate).toBe("2026-09-03");
    expect(thirty.toDate).toBe("2026-10-02");
  });

  it("falls back to this week and to UTC on bad input", () => {
    expect(parseHomePeriodKey("yesterday")).toBe("this_week");
    expect(parseHomePeriodKey("last_week")).toBe("last_week");
    const week = resolveHomePeriod("this_week", { now, timeZone: "Not/AZone" });
    expect(week.from).toBe("2026-09-28T00:00:00.000Z");
  });

  it("describes the range in short dates", () => {
    expect(describeRange({ from: "", to: "", fromDate: "2026-09-28", toDate: "2026-10-02" })).toBe(
      "Sep 28 – Oct 2"
    );
  });
});

describe("booked calls and cost per booked call", () => {
  const calls: CallRow[] = [
    { id: "c1", leadId: "a", scheduledAt: "2026-10-05T15:00:00Z", createdAt: "2026-09-29T12:00:00Z", outcome: null },
    { id: "c2", leadId: "b", scheduledAt: "2026-10-06T15:00:00Z", createdAt: "2026-10-01T12:00:00Z", outcome: null },
    // Booked before the period.
    { id: "c3", leadId: "c", scheduledAt: "2026-09-30T15:00:00Z", createdAt: "2026-09-20T12:00:00Z", outcome: null },
    // A transcript-only row, not a booking.
    { id: "c4", leadId: "d", scheduledAt: null, createdAt: "2026-09-30T12:00:00Z", outcome: "held" },
    // A test lead.
    { id: "c5", leadId: "t", scheduledAt: "2026-10-06T15:00:00Z", createdAt: "2026-10-01T12:00:00Z", outcome: null },
  ];

  it("counts bookings that arrived in the period, newest first", () => {
    const result = bookedCalls(calls, period, new Set(["t"]));
    expect(result.count).toBe(2);
    expect(result.leadIds).toEqual(["b", "a"]);
  });

  it("divides spend by bookings, and refuses to guess when spend is missing", () => {
    expect(costPerBookedCall(null, 4)).toEqual({ state: "not_connected" });
    expect(costPerBookedCall(50_000, 0)).toEqual({ state: "no_bookings", spendCents: 50_000 });
    expect(costPerBookedCall(50_000, 4)).toEqual({ state: "ok", cents: 12_500, spendCents: 50_000 });
  });
});

describe("quiet leads recovered", () => {
  const arrivals = new Map([
    ["quiet", "2026-09-01T00:00:00Z"],
    ["busy", "2026-09-01T00:00:00Z"],
    ["silent", "2026-09-01T00:00:00Z"],
    ["fresh", "2026-09-29T00:00:00Z"],
  ]);

  it("counts a lead that went quiet, got a Vistrial message, and then replied", () => {
    const result = quietLeadsRecovered({
      arrivals,
      period,
      sends: [
        { leadId: "quiet", sentAt: "2026-09-29T15:00:00Z" },
        { leadId: "busy", sentAt: "2026-09-29T15:00:00Z" },
        { leadId: "silent", sentAt: "2026-09-29T15:00:00Z" },
        { leadId: "fresh", sentAt: "2026-09-29T15:00:00Z" },
      ],
      touches: [
        { leadId: "quiet", occurredAt: "2026-09-25T10:00:00Z", direction: "outbound" },
        // The send's own touch is not activity before it.
        { leadId: "quiet", occurredAt: "2026-09-29T15:00:20Z", direction: "outbound" },
        { leadId: "quiet", occurredAt: "2026-09-30T09:00:00Z", direction: "inbound" },
        // Busy had activity 10 hours before the send: not quiet.
        { leadId: "busy", occurredAt: "2026-09-29T05:00:00Z", direction: "outbound" },
        { leadId: "busy", occurredAt: "2026-09-30T09:00:00Z", direction: "inbound" },
        // Fresh arrived a day and a half before: not quiet either.
        { leadId: "fresh", occurredAt: "2026-09-30T09:00:00Z", direction: "inbound" },
      ],
      bookings: [],
    });
    expect(result.leadIds).toEqual(["quiet"]);
  });

  it("counts a booking after the message as a recovery", () => {
    const result = quietLeadsRecovered({
      arrivals,
      period,
      sends: [{ leadId: "silent", sentAt: "2026-09-29T15:00:00Z" }],
      touches: [],
      bookings: [{ leadId: "silent", createdAt: "2026-10-01T15:00:00Z" }],
    });
    expect(result.count).toBe(1);
  });

  it("ignores a reply that lands outside the period", () => {
    const result = quietLeadsRecovered({
      arrivals,
      period,
      sends: [{ leadId: "silent", sentAt: "2026-09-20T15:00:00Z" }],
      touches: [{ leadId: "silent", occurredAt: "2026-09-21T09:00:00Z", direction: "inbound" }],
      bookings: [],
    });
    expect(result.count).toBe(0);
  });
});

describe("first reply time", () => {
  it("takes the median over touched leads and counts the untouched separately", () => {
    const result = firstReplyTime({
      period,
      arrivals: [
        { id: "a", optedInAt: "2026-09-29T10:00:00Z" },
        { id: "b", optedInAt: "2026-09-29T11:00:00Z" },
        { id: "c", optedInAt: "2026-09-29T12:00:00Z" },
        { id: "d", optedInAt: "2026-09-29T13:00:00Z" },
        { id: "old", optedInAt: "2026-09-01T13:00:00Z" },
      ],
      firstTouchAt: new Map([
        ["a", "2026-09-29T10:04:00Z"],
        ["b", "2026-09-29T11:10:00Z"],
        ["c", "2026-09-29T14:00:00Z"],
        ["old", "2026-09-01T13:01:00Z"],
      ]),
    });
    expect(result.measured).toBe(3);
    expect(result.waiting).toBe(1);
    expect(result.medianMinutes).toBe(10);
    expect(result.leadIds).toEqual(["c", "b", "a"]);
  });

  it("returns no median rather than zero when nothing was touched", () => {
    const result = firstReplyTime({
      period,
      arrivals: [{ id: "a", optedInAt: "2026-09-29T10:00:00Z" }],
      firstTouchAt: new Map(),
    });
    expect(result.medianMinutes).toBeNull();
  });

  it("shows minutes, then hours past an hour", () => {
    expect(formatReplyTime(0.4)).toBe("under 1 min");
    expect(formatReplyTime(12.4)).toBe("12 min");
    expect(formatReplyTime(60)).toBe("60 min");
    expect(formatReplyTime(90)).toBe("1.5 hr");
    expect(formatReplyTime(120)).toBe("2 hr");
    expect(formatReplyTime(60 * 30)).toBe("30 hr");
    expect(formatReplyTime(60 * 72)).toBe("3 days");
  });
});

describe("no-shows rebooked", () => {
  it("pairs a missed appointment with the next booking made after it", () => {
    const calls: CallRow[] = [
      { id: "ns", leadId: "a", scheduledAt: "2026-09-25T15:00:00Z", createdAt: "2026-09-20T12:00:00Z", outcome: "no_show" },
      { id: "rb", leadId: "a", scheduledAt: "2026-10-03T15:00:00Z", createdAt: "2026-09-30T12:00:00Z", outcome: null },
      // Booked before the miss: not a rebook.
      { id: "ns2", leadId: "b", scheduledAt: "2026-09-30T15:00:00Z", createdAt: "2026-09-20T12:00:00Z", outcome: "no_show" },
      { id: "early", leadId: "b", scheduledAt: "2026-10-08T15:00:00Z", createdAt: "2026-09-29T12:00:00Z", outcome: null },
      // Missed, never rebooked.
      { id: "ns3", leadId: "c", scheduledAt: "2026-09-29T15:00:00Z", createdAt: "2026-09-25T12:00:00Z", outcome: "no_show" },
    ];
    const result = noShowsRebooked(calls, period);
    expect(result.count).toBe(1);
    expect(result.pairs).toEqual([{ noShowId: "ns", rebookId: "rb", leadId: "a" }]);
  });
});

describe("revenue booked", () => {
  it("nets refunds and splits by lifecycle, leaving unclassified visible", () => {
    const result = revenueBooked(
      [
        { leadId: "a", amountCents: 300_000, kind: "sale", lifecycle: "new", occurredAt: "2026-09-29T00:00:00Z" },
        { leadId: "a", amountCents: 50_000, kind: "refund", lifecycle: "new", occurredAt: "2026-09-30T00:00:00Z" },
        { leadId: "b", amountCents: 100_000, kind: "sale", lifecycle: null, occurredAt: "2026-09-30T00:00:00Z" },
        { leadId: "c", amountCents: 99_000, kind: "failed", lifecycle: "repeat", occurredAt: "2026-09-30T00:00:00Z" },
        { leadId: null, amountCents: 70_000, kind: "sale", lifecycle: "new", occurredAt: "2026-09-30T00:00:00Z" },
        { leadId: "d", amountCents: 70_000, kind: "sale", lifecycle: "new", occurredAt: "2026-09-01T00:00:00Z" },
      ],
      period
    );
    expect(result.netCents).toBe(350_000);
    expect(result.byLifecycle.new).toBe(250_000);
    expect(result.byLifecycle.unclassified).toBe(100_000);
    expect(result.leadIds).toEqual(["a", "b", "c"]);
  });
});

describe("comparison line", () => {
  it("reads like a sentence and colours by improvement, not direction", () => {
    expect(
      compare({ current: 7, previous: 4, hasPreviousData: true, comparisonLabel: "from last week" })
    ).toEqual({ direction: "up", improved: true, text: "up 3 from last week" });
    expect(
      compare({
        current: 4,
        previous: 9,
        hasPreviousData: true,
        comparisonLabel: "from last week",
        lowerIsBetter: true,
        format: (minutes) => `${minutes} min`,
      })
    ).toEqual({ direction: "down", improved: true, text: "down 5 min from last week" });
  });

  it("hides itself when there is no previous data", () => {
    expect(compare({ current: 7, previous: 0, hasPreviousData: false, comparisonLabel: "from last week" })).toBeNull();
    expect(compare({ current: null, previous: 3, hasPreviousData: true, comparisonLabel: "from last week" })).toBeNull();
  });

  it("says when nothing changed", () => {
    expect(
      compare({ current: 3, previous: 3, hasPreviousData: true, comparisonLabel: "from last week" })?.text
    ).toBe("same as last week");
  });
});
