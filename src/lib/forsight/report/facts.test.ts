import { describe, expect, it } from "vitest";

import { airtableMonthFacts } from "@/lib/forsight/report/airtable";
import { coreMonthFacts } from "@/lib/forsight/report/core";
import {
  monthlyFromFacts,
  parseHours,
  revenueBucket,
  type MonthFacts,
  type MonthLead,
} from "@/lib/forsight/report/facts";
import type { ForsightRecord } from "@/lib/forsight/types";

const PERIOD = { start: "2026-08-01", end: "2026-08-31" };

function lead(overrides: Partial<MonthLead> & { id: string }): MonthLead {
  return {
    hoursToFirstHuman: 3,
    humanTouches: 2,
    scored: true,
    qualified: true,
    contacted: true,
    booked: true,
    held: true,
    closed: false,
    lost: false,
    noShow: false,
    rebooked: false,
    assignedName: "Alex",
    ...overrides,
  };
}

describe("parseHours", () => {
  it("reads the number out of Airtable's text formula", () => {
    expect(parseHours("12 hrs")).toBe(12);
    expect(parseHours(4)).toBe(4);
    expect(parseHours("NEVER TOUCHED")).toBeNull();
    expect(parseHours("")).toBeNull();
  });
});

describe("revenueBucket", () => {
  it("maps the template's Type values without folding Reactivated into New", () => {
    expect(revenueBucket("Install Fee")).toBe("new");
    expect(revenueBucket("Retainer")).toBe("recurring");
    expect(revenueBucket("Repeat")).toBe("repeat");
    expect(revenueBucket("Reactivated")).toBe("reactivated");
    expect(revenueBucket("Audit Only")).toBeNull();
  });
});

describe("monthlyFromFacts", () => {
  const facts: MonthFacts = {
    leads: [
      lead({ id: "a", closed: true, humanTouches: 6, hoursToFirstHuman: 2 }),
      lead({
        id: "b",
        lost: true,
        humanTouches: 1,
        hoursToFirstHuman: 10,
        held: false,
        booked: true,
      }),
      lead({
        id: "c",
        qualified: false,
        contacted: false,
        booked: false,
        held: false,
        humanTouches: 0,
        hoursToFirstHuman: null,
        assignedName: null,
      }),
    ],
    revenue: { newCents: 500_000, repeatCents: null, recurringCents: 200_000, reactivatedCents: null },
    nurture: { poolSize: 12, rescoreResponses: null, movedToReady: 2, revenueFromMovedCents: 150_000 },
    objections: [{ objection: "Price", count: 3 }],
    teamAvailable: true,
    omissions: [],
  };

  it("is the only arithmetic, so both adapters agree when they hand over the same facts", () => {
    const once = monthlyFromFacts(facts);
    const twice = monthlyFromFacts(facts);
    expect(once).toEqual(twice);
    expect(once.funnel).toEqual({
      optedIn: 3,
      scored: 3,
      qualified: 2,
      contacted: 2,
      booked: 2,
      held: 1,
      closed: 1,
    });
    expect(once.speed.averageTouchesOnClosed).toBe(6);
    expect(once.speed.averageTouchesOnLost).toBe(1);
    expect(once.speed.medianHoursToFirstHumanTouch).toBe(6);
    expect(once.revenue.repeatCents).toBeNull();
    expect(once.nurture.rescoreResponses).toBeNull();
  });

  it("omits the team when assignment is not a thing this source tracks", () => {
    expect(monthlyFromFacts({ ...facts, teamAvailable: false }).team).toBeNull();
  });
});

describe("Airtable mapping", () => {
  const leads: ForsightRecord[] = [
    {
      id: "rec1",
      fields: {
        "Opt-In Date": "2026-08-04",
        Stage: "Closed Won",
        "Qualification Result": "Qualified",
        "Readiness Score": 80,
        "Human Touches": 6,
        "Hours to First Human Touch": "2 hrs",
        "Is Booked": 1,
        "Is Held": 1,
        "Audit Outcome": "Held",
      },
    },
    {
      id: "rec2",
      fields: {
        "Opt-In Date": "2026-08-05",
        Stage: "Closed Lost",
        "Qualification Result": "Qualified",
        "Readiness Score": 70,
        "Human Touches": 1,
        "Hours to First Human Touch": "NEVER TOUCHED",
        "Is Booked": 1,
        "Is Held": 0,
        "Audit Outcome": "No-Show",
        "No-Show Count": 1,
      },
    },
  ];

  const deals: ForsightRecord[] = [
    { id: "d1", fields: { Date: "2026-08-10", Amount: 5000, Type: "Install Fee", Status: "Cleared" } },
    { id: "d2", fields: { Date: "2026-08-11", Amount: 2000, Type: "Retainer", Status: "Cleared" } },
    { id: "d3", fields: { Date: "2026-08-12", Amount: 999, Type: "Audit Only", Status: "Cleared" } },
    { id: "d4", fields: { Date: "2026-08-12", Amount: 100, Type: "Install Fee", Status: "Pending" } },
    { id: "d5", fields: { Date: "2026-07-01", Amount: 8000, Type: "Install Fee", Status: "Cleared" } },
  ];

  it("counts Install Fee as New and Retainer as Recurring, and never folds Audit Only into New", () => {
    const metrics = monthlyFromFacts(airtableMonthFacts(leads, deals, [], PERIOD));
    expect(metrics.revenue.newCents).toBe(500_000);
    expect(metrics.revenue.recurringCents).toBe(200_000);
    expect(metrics.revenue.repeatCents).toBeNull();
    expect(metrics.revenue.reactivatedCents).toBeNull();
  });

  it("omits every revenue line when the Deals table is missing, rather than zeroing them", () => {
    const omissions = [
      { section: "Revenue", line: "Deals", reason: "This workspace's base has no Deals table." },
    ];
    const metrics = monthlyFromFacts(airtableMonthFacts(leads, null, [], PERIOD, omissions));
    expect(metrics.revenue).toEqual({
      newCents: null,
      repeatCents: null,
      recurringCents: null,
      reactivatedCents: null,
    });
    expect(metrics.omissions.some((row) => row.line === "Deals")).toBe(true);
  });

  it("treats a missing Call Debriefs table as objections the source cannot record", () => {
    const metrics = monthlyFromFacts(airtableMonthFacts(leads, deals, null, PERIOD));
    expect(metrics.objections).toBeNull();
  });

  it("returns an empty objection list when the table exists but nothing was held that recorded one", () => {
    const metrics = monthlyFromFacts(airtableMonthFacts(leads, deals, [], PERIOD));
    expect(metrics.objections).toEqual([]);
  });
});

describe("core mapping", () => {
  it("produces the same funnel and touch arithmetic as Airtable when the facts match", () => {
    const core = monthlyFromFacts(
      coreMonthFacts({
        leads: [
          {
            id: "a",
            opted_in_at: "2026-08-04T12:00:00Z",
            status: "closed_won",
            current_score: 80,
            has_net_close: true,
            first_human_touch_at: "2026-08-04T14:00:00Z",
            lead_type: "ready_track",
            assigned_setter_id: "m1",
            assigned_closer_id: null,
          },
        ],
        calls: [
          {
            id: "c1",
            lead_id: "a",
            scheduled_at: "2026-08-10T15:00:00Z",
            occurred_at: "2026-08-10T15:00:00Z",
            outcome: "held",
          },
        ],
        touches: new Map([["a", 6]]),
        members: new Map([["m1", "Alex"]]),
        objections: [{ objection: "Price", count: 1 }],
        trackChanges: { poolSize: 4, movedIds: ["a"] },
        revenue: new Map([["a", 150_000]]),
        threshold: 60,
        period: PERIOD,
      })
    );

    expect(core.funnel.optedIn).toBe(1);
    expect(core.funnel.closed).toBe(1);
    expect(core.funnel.held).toBe(1);
    expect(core.speed.averageTouchesOnClosed).toBe(6);
    expect(core.team?.[0]?.name).toBe("Alex");
    expect(core.revenue.newCents).toBeNull();
    expect(core.nurture.rescoreResponses).toBeNull();
    expect(core.nurture.revenueFromMovedCents).toBe(150_000);
  });
});
