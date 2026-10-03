import { describe, expect, it } from "vitest";

import { coreMonthFacts } from "@/lib/forsight/report/core";
import {
  monthlyFromFacts,
  type MonthFacts,
  type MonthLead,
} from "@/lib/forsight/report/facts";

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

  it("is the only arithmetic, so the same facts always produce the same report", () => {
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

describe("core mapping", () => {
  it("turns Vistrial's own rows into the funnel and touch arithmetic", () => {
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
