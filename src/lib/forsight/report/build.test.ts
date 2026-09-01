import { describe, expect, it } from "vitest";

import {
  buildReport,
  comparisonSentence,
  monthPeriod,
  objectionInterpretation,
  previousMonthStart,
} from "@/lib/forsight/report/build";
import type { MonthlyMetrics } from "@/lib/forsight/report/types";

const PERIOD = monthPeriod("2026-08-01");

function metrics(overrides: Partial<MonthlyMetrics> = {}): MonthlyMetrics {
  return {
    funnel: {
      optedIn: 20,
      scored: 18,
      qualified: 10,
      contacted: 8,
      booked: 5,
      held: 4,
      closed: 1,
    },
    speed: {
      medianHoursToFirstHumanTouch: 3.2,
      readyContactedWithinFourHoursPercent: 70,
      averageTouchesOnClosed: 6,
      averageTouchesOnLost: 1,
      showRatePercent: 80,
      rebookRatePercent: 25,
    },
    revenue: {
      newCents: 500_000,
      repeatCents: null,
      recurringCents: 200_000,
      reactivatedCents: null,
    },
    nurture: {
      poolSize: 12,
      rescoreResponses: null,
      movedToReady: 3,
      revenueFromMovedCents: 150_000,
    },
    team: [
      {
        name: "Alex",
        assigned: 8,
        contactedWithinFourHours: 6,
        neverContacted: 1,
        averageTouches: 3.5,
        booked: 4,
        showRatePercent: 75,
      },
    ],
    objections: [
      { objection: "Price", count: 3 },
      { objection: "Trust", count: 1 },
    ],
    omissions: [],
    ...overrides,
  };
}

describe("the month the report covers", () => {
  it("is the calendar month, labelled in English", () => {
    expect(PERIOD).toEqual({ start: "2026-08-01", end: "2026-08-31", label: "August 2026" });
    expect(previousMonthStart("2026-09-01")).toBe("2026-08-01");
    expect(previousMonthStart("2026-01-15")).toBe("2025-12-01");
  });
});

describe("buildReport", () => {
  it("writes a frozen document: the same metrics produce the same payload", () => {
    const generatedAt = "2026-09-01T09:00:00.000Z";
    const args = {
      workspace: { id: "org-1", name: "Stellar" },
      period: PERIOD,
      generatedAt,
      metrics: metrics(),
    };
    const first = buildReport(args);
    const second = buildReport(args);
    expect(first).toEqual(second);
    expect(first.generatedAt).toBe(generatedAt);
  });

  it("keeps the stored numbers when later metrics move", () => {
    const stored = buildReport({
      workspace: { id: "org-1", name: "Stellar" },
      period: PERIOD,
      generatedAt: "2026-09-01T09:00:00.000Z",
      metrics: metrics(),
    });
    const funnel = stored.sections.find((section) => section.kind === "funnel");
    expect(funnel?.kind === "funnel" && funnel.steps.find((step) => step.label === "Closed")?.count).toBe(
      1
    );

    const later = metrics({ funnel: { ...metrics().funnel, closed: 99 } });
    expect(later.funnel.closed).toBe(99);
    expect(funnel?.kind === "funnel" && funnel.steps.find((step) => step.label === "Closed")?.count).toBe(
      1
    );
  });

  it("omits unavailable revenue lines rather than showing them as zero", () => {
    const report = buildReport({
      workspace: { id: "org-1", name: "Stellar" },
      period: PERIOD,
      generatedAt: "2026-09-01T09:00:00.000Z",
      metrics: metrics(),
    });
    const revenue = report.sections.find((section) => section.kind === "revenue");
    expect(revenue?.kind).toBe("revenue");
    if (revenue?.kind !== "revenue") throw new Error("expected revenue");
    expect(revenue.figures.map((row) => row.label)).toEqual(["New", "Recurring"]);
    expect(revenue.figures.map((row) => row.value)).not.toContain("$0");
    expect(report.omissions.some((row) => row.line === "Repeat")).toBe(true);
    expect(report.omissions.some((row) => row.line === "Reactivated")).toBe(true);
  });

  it("turns a section with nothing in it into one plain line", () => {
    const report = buildReport({
      workspace: { id: "org-1", name: "Stellar" },
      period: PERIOD,
      generatedAt: "2026-09-01T09:00:00.000Z",
      metrics: metrics({
        funnel: { optedIn: 4, scored: 4, qualified: 2, contacted: 2, booked: 0, held: 0, closed: 0 },
        objections: [],
        revenue: { newCents: null, repeatCents: null, recurringCents: null, reactivatedCents: null },
        team: null,
      }),
    });
    const objections = report.sections.find((section) => section.title === "Objections");
    expect(objections).toEqual({
      kind: "absent",
      title: "Objections",
      line: "No calls were held this month, so there are no objections to read.",
    });
    const revenue = report.sections.find((section) => section.title === "Revenue");
    expect(revenue?.kind).toBe("absent");
    const team = report.sections.find((section) => section.title === "Team scorecard");
    expect(team?.kind).toBe("absent");
  });

  it("does not put ad spend, or any omitted line, on the client document", () => {
    const report = buildReport({
      workspace: { id: "org-1", name: "Stellar" },
      period: PERIOD,
      generatedAt: "2026-09-01T09:00:00.000Z",
      metrics: metrics({
        omissions: [
          {
            section: "Generation",
            line: "Ad spend",
            reason: "This workspace has no Meta ad source connected.",
          },
        ],
      }),
    });
    const serialized = JSON.stringify(report.sections);
    expect(serialized).not.toMatch(/ad spend/i);
    expect(report.omissions.some((row) => row.line === "Ad spend")).toBe(true);
  });
});

describe("objectionInterpretation", () => {
  it("is generated from the actual distribution, not a static legend", () => {
    const price = objectionInterpretation([
      { objection: "Price", count: 8 },
      { objection: "Trust", count: 1 },
    ]);
    expect(price).toContain("Price led the month");
    expect(price).toContain("offer or a qualification problem");

    const spouse = objectionInterpretation([{ objection: "Spouse", count: 5 }]);
    expect(spouse).toContain("decision authority");

    const thinking = objectionInterpretation([{ objection: "Thinking", count: 4 }]);
    expect(thinking).toContain("the call itself is not closing");
  });

  it("softens the reading when the mass is spread across many objections", () => {
    const text = objectionInterpretation([
      { objection: "Price", count: 3 },
      { objection: "Trust", count: 3 },
      { objection: "Fit", count: 3 },
    ]);
    expect(text).toContain("hint rather than a diagnosis");
  });
});

describe("comparisonSentence", () => {
  it("names the closed-versus-lost gap in words", () => {
    expect(comparisonSentence(6, 1)).toContain("the system working");
    expect(comparisonSentence(1, 6)).toContain("wrong conversations");
  });
});
