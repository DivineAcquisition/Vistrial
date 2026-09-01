import { describe, expect, it } from "vitest";

import { creativesByCostPerAuditHeld, totalSpend } from "@/lib/forsight/creatives";
import { pipelineHealth } from "@/lib/forsight/pipeline";
import type { ForsightRecord } from "@/lib/forsight/types";
import { formatMetric } from "@/lib/forsight/values";
import { weeklyPulse } from "@/lib/forsight/weekly";

/**
 * The rows that were actually in `DA Pipeline — ClientAcquisition`
 * (`apprsfnMvzEAfsg39`) when these pages were written, keyed by field name the
 * way the REST API returns them.
 *
 * Fields the base left empty are omitted here rather than set to null, because
 * that is exactly what Airtable does: an empty formula result never appears in
 * the payload at all. Half the states these pages have to handle only exist
 * because of that, so a fixture that filled them in would test nothing.
 */

const WEEKLY_SUMMARY: ForsightRecord[] = [
  {
    id: "recamNI4D0QnkGqsy",
    fields: {
      Week: "TEST - Week 1",
      "Week Start Date": "2026-08-18",
      "Total Spend": 700,
      "Applications Submitted": 40,
      Qualified: 14,
      "Audits Booked": 6,
      "Audits Held": 4,
      "Closed Won": 1,
      "Revenue Closed": 8500,
      "Cost per Application": "17.5",
      "Cost per Booked Call": "116.67",
      "Cost per Audit Held": "175",
      CAC: "700",
      ROAS: "12.14",
    },
  },
];

const CREATIVES: ForsightRecord[] = [
  {
    id: "recPgMHZYwaNx1thH",
    fields: {
      "Creative Name": "DA-03 Arithmetic Cut",
      Status: "Testing",
      Campaign: "DA - Audit Bookings - Leads",
      "Lead Count": 1,
      "Qualified Count": 1,
      "Audits Booked": 0,
      "Audits Held": 0,
      "Closed Won Count": 0,
    },
  },
  {
    id: "recfjyfdTGbgDArHd",
    fields: {
      "Creative Name": "DA-02 Direct Cold Cut",
      Status: "Testing",
      Campaign: "DA - Audit Bookings - Leads",
      Spend: 0,
      "Lead Count": 1,
      "Qualified Count": 1,
      "Audits Booked": 0,
      "Audits Held": 0,
      "Closed Won Count": 0,
    },
  },
  {
    id: "recmFhzWv1hhdz1CM",
    fields: {
      "Creative Name": "DA-01 Scenario Cut",
      Status: "Testing",
      Campaign: "DA - Audit Bookings - Leads",
      "Lead Count": 1,
      "Qualified Count": 0,
      "Audits Booked": 0,
      "Audits Held": 0,
      "Closed Won Count": 0,
    },
  },
];

const LEADS: ForsightRecord[] = [
  {
    id: "recJXISXwRcJJaNVv",
    fields: {
      "Lead Name": "Tes",
      "Readiness Score": 0,
      "Qualification Result": "Disqualified",
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "⚫ DECIDE - recycle or close out",
    },
  },
  {
    id: "recQJi7GmA5tAi51b",
    fields: {
      "Lead Name": "TEST - Disqualified",
      Stage: "Disqualified",
      "Opt-In Date": "2026-08-19",
      "Readiness Score": 12,
      "Qualification Result": "Disqualified",
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "✓ Closed",
    },
  },
  {
    id: "recTfyb3Q81gglu7W",
    fields: {
      "Lead Name": "TEST - Not Sure Answer",
      Stage: "Manual Review",
      "Opt-In Date": "2026-08-25",
      "Readiness Score": 60,
      "Qualification Result": "Qualified",
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "🔴 CALL NOW - qualified, never contacted",
    },
  },
  {
    id: "recbhuwRMsnk618TH",
    fields: {
      "Lead Name": "TEST - Closed Won (DM)",
      Stage: "Closed Won",
      "Opt-In Date": "2026-07-15",
      "Readiness Score": 100,
      "Qualification Result": "Qualified",
      "Human Touches": 5,
      "Days Since Touch": 44,
      "Touch Status": "⚫ Ghosted 30d+",
      "Next Action": "✓ Closed",
      "Debrief Missing": "📄 DEBRIEF MISSING",
    },
  },
  {
    id: "recmHuCFcxtHMfK19",
    fields: {
      "Lead Name": "TEST - Borderline",
      Stage: "Manual Review",
      "Opt-In Date": "2026-08-18",
      "Readiness Score": 65,
      "Qualification Result": "Qualified",
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "🔴 CALL NOW - qualified, never contacted",
    },
  },
  {
    id: "recsGCP9YvsZMeKmX",
    fields: {
      "Lead Name": "TEST - Qualified, No Contact",
      Stage: "Qualified - Not Booked",
      "Opt-In Date": "2026-08-20",
      "Readiness Score": 100,
      "Qualification Result": "Qualified",
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "🔴 CALL NOW - qualified, never contacted",
    },
  },
];

describe("Weekly Pulse against the live DA base", () => {
  const pulse = weeklyPulse(WEEKLY_SUMMARY);

  it("reads the headline numbers straight off the row", () => {
    const week = pulse.current;
    expect(week?.week).toBe("TEST - Week 1");
    expect(formatMetric(week!.spend, "currency")).toBe("$700");
    expect(formatMetric(week!.costPerAuditHeld, "currency")).toBe("$175");
    expect(formatMetric(week!.cac, "currency")).toBe("$700");
    expect(formatMetric(week!.roas, "ratio")).toBe("12.14×");
    expect(formatMetric(week!.costPerApplication, "currency")).toBe("$17.50");
    expect(formatMetric(week!.costPerBookedCall, "currency")).toBe("$116.67");
  });

  it("reads the funnel counts", () => {
    const week = pulse.current!;
    expect([
      formatMetric(week.applications, "number"),
      formatMetric(week.qualified, "number"),
      formatMetric(week.booked, "number"),
      formatMetric(week.held, "number"),
      formatMetric(week.closed, "number"),
    ]).toEqual(["40", "14", "6", "4", "1"]);
  });

  it("knows the base has only one week, so no trend is drawn today", () => {
    expect(pulse.hasTrend).toBe(false);
  });
});

describe("Creative Performance against the live DA base", () => {
  const rows = creativesByCostPerAuditHeld(CREATIVES);

  it("lists all three creatives without a cost between them", () => {
    expect(rows.map((row) => row.name)).toEqual([
      "DA-01 Scenario Cut",
      "DA-02 Direct Cold Cut",
      "DA-03 Arithmetic Cut",
    ]);
    for (const row of rows) {
      expect(formatMetric(row.costPerAuditHeld, "currency")).toBe("—");
      expect(row.status).toBe("Testing");
    }
  });

  it("shows the one recorded spend and leaves the unrecorded ones blank", () => {
    const spends = rows.map((row) => formatMetric(row.spend, "currency"));
    expect(spends).toEqual(["—", "$0", "—"]);
    expect(formatMetric(totalSpend(rows), "currency")).toBe("$0");
  });
});

describe("Pipeline Health against the live DA base", () => {
  const health = pipelineHealth(LEADS);

  it("finds the three qualified leads nobody has called", () => {
    expect(health.neverContacted.map((lead) => lead.name)).toEqual([
      "TEST - Qualified, No Contact",
      "TEST - Borderline",
      "TEST - Not Sure Answer",
    ]);
  });

  it("does not chase the disqualified lead that has no stage set at all", () => {
    expect(health.neverContacted.map((lead) => lead.name)).not.toContain("Tes");
  });

  it("leaves the closed-won lead out of going quiet despite its ghosted status", () => {
    expect(health.goingQuiet.ghosted30).toEqual([]);
    expect(health.goingQuiet.ghosted14).toEqual([]);
  });

  it("still reports its missing debrief", () => {
    expect(health.debriefsMissing.map((lead) => lead.name)).toEqual(["TEST - Closed Won (DM)"]);
  });
});
