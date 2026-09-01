import { describe, expect, it } from "vitest";

import { creativeRow } from "@/lib/forsight/creatives";
import {
  NO_AD_SPEND,
  NO_AUDITS_YET,
  NO_CLOSES_YET,
  cac,
  costPerApplication,
  costPerAuditHeld,
  costPerBookedCall,
  ctrPercent,
  roas,
  spendUnavailable,
} from "@/lib/forsight/formulas";
import { touchStatus } from "@/lib/forsight/core-source";
import { isClosedStage } from "@/lib/forsight/fields";
import { goingQuiet, neverContacted, type LeadRow } from "@/lib/forsight/pipeline";
import type { ForsightRecord } from "@/lib/forsight/types";
import { formatMetric, metricReason, toMetricValue } from "@/lib/forsight/values";
import { weekRow } from "@/lib/forsight/weekly";

/**
 * A client moved between source types must not see their numbers change
 * meaning. These build the same week two ways — once as Airtable would return
 * it, once as the core adapter computes it — and compare.
 */

const SPEND = 700;
const APPLICATIONS = 40;
const BOOKED = 6;
const HELD = 4;
const CLOSED = 1;
const REVENUE = 8500;

/** What Airtable's formula fields return for that week, as text. */
function airtableWeek(): ForsightRecord {
  return {
    id: "recW1",
    fields: {
      Week: "Week of 8/18",
      "Week Start Date": "2026-08-18",
      "Total Spend": SPEND,
      "Applications Submitted": APPLICATIONS,
      Qualified: 14,
      "Audits Booked": BOOKED,
      "Audits Held": HELD,
      "Closed Won": CLOSED,
      "Revenue Closed": REVENUE,
      "Cost per Application": "17.5",
      "Cost per Booked Call": "116.67",
      "Cost per Audit Held": "175",
      CAC: "700",
      ROAS: "12.14",
    },
  };
}

/** The same week, computed the way the core adapter computes it. */
function coreWeek() {
  const spend = toMetricValue(SPEND);
  const applications = toMetricValue(APPLICATIONS);
  const booked = toMetricValue(BOOKED);
  const held = toMetricValue(HELD);
  const closed = toMetricValue(CLOSED);
  const revenue = toMetricValue(REVENUE);

  return {
    costPerApplication: costPerApplication(spend, applications),
    costPerBookedCall: costPerBookedCall(spend, booked),
    costPerAuditHeld: costPerAuditHeld(spend, held),
    cac: cac(spend, closed),
    roas: roas(revenue, spend),
  };
}

describe("both adapters produce the same numbers", () => {
  const airtable = weekRow(airtableWeek());
  const core = coreWeek();

  it("agrees on every cost metric", () => {
    expect(formatMetric(core.costPerApplication, "currency")).toBe(
      formatMetric(airtable.costPerApplication, "currency")
    );
    expect(formatMetric(core.costPerBookedCall, "currency")).toBe(
      formatMetric(airtable.costPerBookedCall, "currency")
    );
    expect(formatMetric(core.costPerAuditHeld, "currency")).toBe(
      formatMetric(airtable.costPerAuditHeld, "currency")
    );
    expect(formatMetric(core.cac, "currency")).toBe(formatMetric(airtable.cac, "currency"));
  });

  it("agrees on ROAS, including the rounding", () => {
    expect(formatMetric(core.roas, "ratio")).toBe(formatMetric(airtable.roas, "ratio"));
    expect(formatMetric(core.roas, "ratio")).toBe("12.14×");
  });
});

describe("the zero-denominator branches match the base's formulas", () => {
  const spend = toMetricValue(700);
  const nothing = toMetricValue(0);

  it("says No audits yet rather than zero when money went out and nothing was held", () => {
    const value = costPerAuditHeld(spend, nothing);
    expect(value).toEqual({ kind: "text", text: NO_AUDITS_YET });
    expect(formatMetric(value, "currency")).toBe(NO_AUDITS_YET);
  });

  it("says No closes yet rather than zero on CAC", () => {
    expect(cac(spend, nothing)).toEqual({ kind: "text", text: NO_CLOSES_YET });
  });

  it("goes blank, not zero, when there was no spend either", () => {
    expect(costPerAuditHeld(toMetricValue(0), nothing).kind).toBe("absent");
    expect(cac(toMetricValue(0), nothing).kind).toBe("absent");
  });

  it("has no text branch on the cost metrics the base leaves blank", () => {
    expect(costPerBookedCall(spend, nothing).kind).toBe("absent");
    expect(costPerApplication(spend, nothing).kind).toBe("absent");
  });

  it("does not divide by zero spend for ROAS", () => {
    expect(roas(toMetricValue(8500), toMetricValue(0)).kind).toBe("absent");
  });

  it("matches the base's CTR formula, percent and all", () => {
    expect(ctrPercent(toMetricValue(173), toMetricValue(9000))).toEqual({
      kind: "number",
      value: 1.92,
      raw: "1.92",
    });
    expect(ctrPercent(toMetricValue(0), toMetricValue(0)).kind).toBe("absent");
  });

  it("rounds the way ROUND(x, 2) rounds", () => {
    expect(costPerAuditHeld(toMetricValue(700), toMetricValue(6))).toMatchObject({
      value: 116.67,
    });
  });
});

describe("a metric the source cannot produce", () => {
  const noSpend = spendUnavailable();

  it("reads as unavailable with a reason, never as zero", () => {
    const value = costPerAuditHeld(noSpend, toMetricValue(4));
    expect(value.kind).toBe("unavailable");
    expect(metricReason(value)).toBe(NO_AD_SPEND);
    expect(formatMetric(value, "currency")).toBe("Unavailable");
    expect(formatMetric(value, "currency")).not.toBe("$0");
  });

  it("carries through every metric that divides by spend", () => {
    for (const value of [
      costPerAuditHeld(noSpend, toMetricValue(4)),
      cac(noSpend, toMetricValue(1)),
      costPerApplication(noSpend, toMetricValue(40)),
      costPerBookedCall(noSpend, toMetricValue(6)),
      roas(toMetricValue(8500), noSpend),
    ]) {
      expect(value.kind).toBe("unavailable");
      expect(metricReason(value)).toBe(NO_AD_SPEND);
    }
  });

  it("does not infect the counts, which core knows perfectly well", () => {
    expect(toMetricValue(40).kind).toBe("number");
  });
});

describe("core describes a lead the way Airtable does", () => {
  it("uses the same touch status buckets the base's formula produces", () => {
    expect(touchStatus(0, null)).toBe("🔴 No human contact");
    expect(touchStatus(0, 3)).toBe("🔴 No human contact");
    expect(touchStatus(2, 40)).toBe("⚫ Ghosted 30d+");
    expect(touchStatus(2, 20)).toBe("🟠 Ghosted 14d+");
    expect(touchStatus(2, 9)).toBe("🟡 Going quiet");
    expect(touchStatus(2, 1)).toBe("🟢 Active");
  });

  it("puts the boundaries where the base puts them", () => {
    expect(touchStatus(1, 30)).toBe("🟠 Ghosted 14d+");
    expect(touchStatus(1, 31)).toBe("⚫ Ghosted 30d+");
    expect(touchStatus(1, 14)).toBe("🟡 Going quiet");
    expect(touchStatus(1, 15)).toBe("🟠 Ghosted 14d+");
  });
});

describe("a closed lead is closed in either vocabulary", () => {
  it("recognises core's underscored statuses as well as Airtable's wording", () => {
    for (const stage of ["Closed Won", "closed_won", "Closed Lost", "closed_lost", "Disqualified"]) {
      expect(isClosedStage(stage)).toBe(true);
    }
  });

  it("leaves a lead that is still in play alone", () => {
    for (const stage of ["Qualified - Not Booked", "call_booked", "working", "Manual Review"]) {
      expect(isClosedStage(stage)).toBe(false);
    }
  });

  it("keeps a closed core lead out of the queues that ask someone to chase it", () => {
    const closed: LeadRow = {
      id: "l1",
      name: "Closed already",
      stage: "closed_won",
      qualificationResult: "Qualified",
      readinessScore: 100,
      humanTouches: 0,
      optInDate: "2026-08-01",
      daysSinceTouch: 40,
      touchStatus: "⚫ Ghosted 30d+",
      nextAction: "",
      debriefMissing: false,
    };

    expect(neverContacted([closed])).toEqual([]);
    expect(goingQuiet([closed]).ghosted30).toEqual([]);
  });
});

describe("a creative row is the same shape whoever built it", () => {
  it("keeps the text states through the Airtable mapper", () => {
    const row = creativeRow({
      id: "recA",
      fields: {
        "Creative Name": "DA-01",
        Spend: 210,
        "Cost per Audit Held": NO_AUDITS_YET,
        CAC: NO_CLOSES_YET,
      },
    });
    expect(row.costPerAuditHeld).toEqual({ kind: "text", text: NO_AUDITS_YET });
    expect(row.cac).toEqual({ kind: "text", text: NO_CLOSES_YET });
  });
});
