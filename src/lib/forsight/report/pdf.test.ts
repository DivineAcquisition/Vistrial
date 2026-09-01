import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildReport, monthPeriod } from "@/lib/forsight/report/build";
import { forsightReportPdf } from "@/lib/forsight/report/pdf";
import type { MonthlyMetrics, StoredReport } from "@/lib/forsight/report/types";

function metrics(): MonthlyMetrics {
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
  };
}

function readablePdf(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const inflated = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    try {
      return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      return match[1];
    }
  });
  const streams = inflated.join("\n");
  const decodedHex = [...streams.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
    .join("\n");
  return `${raw}\n${streams}\n${decodedHex}`;
}

describe("forsightReportPdf", () => {
  it("contains every section and the generation timestamp", async () => {
    const generatedAt = "2026-09-01T09:00:00.000Z";
    const report = buildReport({
      workspace: { id: "org-1", name: "Stellar" },
      period: monthPeriod("2026-08-01"),
      generatedAt,
      metrics: metrics(),
    });
    const stored: StoredReport = {
      id: "rep-1",
      orgId: "org-1",
      version: 2,
      generatedAt,
      generatedBy: "operator",
      generatedByName: "Dana",
      sourceType: "airtable",
      report,
      omissions: report.omissions,
    };

    const bytes = await forsightReportPdf(stored);
    const text = readablePdf(bytes);
    expect(Buffer.from(bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(text).toContain("The funnel");
    expect(text).toContain("Speed and touch");
    expect(text).toContain("Revenue");
    expect(text).toContain("Nurture health");
    expect(text).toContain("Team scorecard");
    expect(text).toContain("Objections");
    expect(text).toContain("Generated 2026-09-01T09:00:00.000Z");
    expect(text).toContain("Version 2");

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
