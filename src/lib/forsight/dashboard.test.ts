import { describe, expect, it } from "vitest";

import { readCached, resetForsightCache } from "@/lib/forsight/cache";
import {
  comparableByCostPerAuditHeld,
  creativesByCostPerAuditHeld,
  totalSpend,
} from "@/lib/forsight/creatives";
import { plainText } from "@/lib/forsight/fields";
import { daysSince, leadRow, pipelineHealth } from "@/lib/forsight/pipeline";
import type { ForsightRecord } from "@/lib/forsight/types";
import {
  compareMetricAscending,
  formatMetric,
  movement,
  toMetricValue,
} from "@/lib/forsight/values";
import { weeklyPulse } from "@/lib/forsight/weekly";

function record(id: string, fields: Record<string, unknown>): ForsightRecord {
  return { id, fields };
}

describe("the three states an Airtable formula field can be in", () => {
  it("reads a numeric string as a number", () => {
    expect(toMetricValue("175")).toEqual({ kind: "number", value: 175, raw: "175" });
    expect(toMetricValue("12.14")).toEqual({ kind: "number", value: 12.14, raw: "12.14" });
    expect(toMetricValue(700)).toEqual({ kind: "number", value: 700, raw: "700" });
  });

  it("keeps an informative text state as text", () => {
    expect(toMetricValue("No audits yet")).toEqual({ kind: "text", text: "No audits yet" });
    expect(toMetricValue("No closes yet")).toEqual({ kind: "text", text: "No closes yet" });
  });

  it("treats an omitted or blank field as absent, which is not the same as text", () => {
    expect(toMetricValue(undefined).kind).toBe("absent");
    expect(toMetricValue(null).kind).toBe("absent");
    expect(toMetricValue("").kind).toBe("absent");
    expect(toMetricValue("   ").kind).toBe("absent");
  });

  it("tolerates a formula that starts returning a currency symbol", () => {
    expect(toMetricValue("$1,750.50")).toMatchObject({ kind: "number", value: 1750.5 });
  });

  it("shows each state the way a reader needs it", () => {
    expect(formatMetric(toMetricValue("175"), "currency")).toBe("$175");
    expect(formatMetric(toMetricValue("12.14"), "ratio")).toBe("12.14×");
    expect(formatMetric(toMetricValue("1.85"), "percent")).toBe("1.85%");
    expect(formatMetric(toMetricValue("No closes yet"), "currency")).toBe("No closes yet");
    expect(formatMetric(toMetricValue(undefined), "currency")).toBe("—");
  });
});

describe("week over week", () => {
  it("calls a falling cost good and a rising cost bad", () => {
    const better = movement(toMetricValue("150"), toMetricValue("175"), {
      format: "currency",
      lowerIsBetter: true,
    });
    expect(better).toEqual({ direction: "down", amount: "$25", isGood: true });

    const worse = movement(toMetricValue("200"), toMetricValue("175"), {
      format: "currency",
      lowerIsBetter: true,
    });
    expect(worse).toMatchObject({ direction: "up", isGood: false });
  });

  it("calls a rising ROAS good", () => {
    expect(
      movement(toMetricValue("14"), toMetricValue("12"), {
        format: "ratio",
        lowerIsBetter: false,
      })
    ).toEqual({ direction: "up", amount: "2×", isGood: true });
  });

  it("gives no direction when either week is a text state", () => {
    expect(
      movement(toMetricValue("No closes yet"), toMetricValue("700"), {
        format: "currency",
        lowerIsBetter: true,
      })
    ).toBeNull();
    expect(
      movement(toMetricValue("700"), toMetricValue(undefined), {
        format: "currency",
        lowerIsBetter: true,
      })
    ).toBeNull();
  });
});

describe("weekly pulse", () => {
  const weeks = [
    record("w2", { Week: "Week of 8/25", "Week Start Date": "2026-08-25", "Total Spend": 900 }),
    record("w1", { Week: "Week of 8/18", "Week Start Date": "2026-08-18", "Total Spend": 700 }),
  ];

  it("orders weeks oldest to newest and picks the latest as current", () => {
    const pulse = weeklyPulse(weeks);
    expect(pulse.weeks.map((week) => week.week)).toEqual(["Week of 8/18", "Week of 8/25"]);
    expect(pulse.current?.week).toBe("Week of 8/25");
    expect(pulse.previous?.week).toBe("Week of 8/18");
    expect(pulse.hasTrend).toBe(true);
  });

  it("says there is no trend on a workspace with one week, which is today's DA base", () => {
    const pulse = weeklyPulse([weeks[0]]);
    expect(pulse.hasTrend).toBe(false);
    expect(pulse.previous).toBeNull();
    expect(pulse.current?.week).toBe("Week of 8/25");
  });

  it("handles no weeks at all without inventing one", () => {
    const pulse = weeklyPulse([]);
    expect(pulse.current).toBeNull();
    expect(pulse.hasTrend).toBe(false);
  });
});

describe("creative performance", () => {
  const creatives = [
    record("c1", { "Creative Name": "DA-01 Scenario Cut", Spend: 300 }),
    record("c2", {
      "Creative Name": "DA-02 Direct Cold Cut",
      Spend: 450,
      "Cost per Audit Held": "150",
    }),
    record("c3", {
      "Creative Name": "DA-03 Arithmetic Cut",
      Spend: 200,
      "Cost per Audit Held": "No audits yet",
    }),
    record("c4", {
      "Creative Name": "DA-04 Proof Cut",
      Spend: 100,
      "Cost per Audit Held": "90",
    }),
  ];

  it("puts the cheapest audit on top and text states below every real number", () => {
    const rows = creativesByCostPerAuditHeld(creatives);
    expect(rows.map((row) => row.name)).toEqual([
      "DA-04 Proof Cut",
      "DA-02 Direct Cold Cut",
      "DA-03 Arithmetic Cut",
      "DA-01 Scenario Cut",
    ]);
  });

  it("never sorts a creative with no audits yet as if it cost nothing", () => {
    const rows = creativesByCostPerAuditHeld(creatives);
    expect(rows[0].name).not.toBe("DA-03 Arithmetic Cut");
    expect(compareMetricAscending(toMetricValue("No audits yet"), toMetricValue("0"))).toBe(1);
  });

  it("compares only the creatives that have a real cost per audit held", () => {
    expect(comparableByCostPerAuditHeld(creativesByCostPerAuditHeld(creatives))).toEqual([
      { label: "DA-04 Proof Cut", value: 90 },
      { label: "DA-02 Direct Cold Cut", value: 150 },
    ]);
  });

  it("totals spend for the footer without deriving anything", () => {
    expect(totalSpend(creativesByCostPerAuditHeld(creatives))).toMatchObject({ value: 1050 });
    expect(totalSpend([]).kind).toBe("absent");
  });

  it("survives a base that has creatives but no spend or cost recorded, as DA's does today", () => {
    const rows = creativesByCostPerAuditHeld([record("c1", { "Creative Name": "DA-01" })]);
    expect(rows).toHaveLength(1);
    expect(formatMetric(rows[0].costPerAuditHeld, "currency")).toBe("—");
  });
});

describe("pipeline health", () => {
  const leads = [
    record("l1", {
      "Lead Name": "TEST - Qualified, No Contact",
      Stage: "Qualified - Not Booked",
      "Qualification Result": "Qualified",
      "Readiness Score": 100,
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "🔴 CALL NOW - qualified, never contacted",
      "Opt-In Date": "2026-08-20",
    }),
    record("l2", {
      "Lead Name": "TEST - Borderline",
      Stage: "Manual Review",
      "Qualification Result": "Qualified",
      "Readiness Score": 65,
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "🔴 CALL NOW - qualified, never contacted",
    }),
    record("l3", {
      "Lead Name": "TEST - Disqualified",
      Stage: "Disqualified",
      "Qualification Result": "Disqualified",
      "Human Touches": 0,
      "Days Since Touch": 999,
      "Touch Status": "🔴 No human contact",
      "Next Action": "✓ Closed",
    }),
    record("l4", {
      "Lead Name": "TEST - Closed Won",
      Stage: "Closed Won",
      "Qualification Result": "Qualified",
      "Human Touches": 5,
      "Days Since Touch": 44,
      "Touch Status": "⚫ Ghosted 30d+",
      "Debrief Missing": "📄 DEBRIEF MISSING",
    }),
    record("l5", {
      "Lead Name": "Drifting",
      Stage: "Proposal Out",
      "Qualification Result": "Qualified",
      "Human Touches": 3,
      "Days Since Touch": 18,
      "Touch Status": "🟠 Ghosted 14d+",
      "Next Action": "💰 CLOSE - proposal going cold",
    }),
    record("l6", {
      "Lead Name": "Long gone",
      Stage: "Audit Booked",
      "Qualification Result": "Qualified",
      "Human Touches": 2,
      "Days Since Touch": 40,
      "Touch Status": "⚫ Ghosted 30d+",
    }),
  ];

  const health = pipelineHealth(leads);

  it("lists qualified leads nobody has spoken to, best score first", () => {
    expect(health.neverContacted.map((lead) => lead.name)).toEqual([
      "TEST - Qualified, No Contact",
      "TEST - Borderline",
    ]);
  });

  it("leaves closed and disqualified leads out of every section", () => {
    expect(health.neverContacted.map((lead) => lead.name)).not.toContain("TEST - Disqualified");
    const quiet = [...health.goingQuiet.ghosted30, ...health.goingQuiet.ghosted14];
    expect(quiet.map((lead) => lead.name)).not.toContain("TEST - Closed Won");
  });

  it("groups the quiet leads by the buckets Airtable already sorted them into", () => {
    expect(health.goingQuiet.ghosted30.map((lead) => lead.name)).toEqual(["Long gone"]);
    expect(health.goingQuiet.ghosted14.map((lead) => lead.name)).toEqual(["Drifting"]);
  });

  it("does not double-count a never-contacted lead as going quiet", () => {
    const quiet = [...health.goingQuiet.ghosted30, ...health.goingQuiet.ghosted14];
    expect(quiet.map((lead) => lead.name)).not.toContain("TEST - Qualified, No Contact");
  });

  it("finds held calls with no debrief from the field built for it", () => {
    expect(health.debriefsMissing.map((lead) => lead.name)).toEqual(["TEST - Closed Won"]);
  });

  it("reads 999 days since touch as never, not as nearly three years", () => {
    const lead = leadRow(leads[0]);
    expect(lead.daysSinceTouch).toBeNull();
    expect(leadRow(leads[4]).daysSinceTouch).toBe(18);
  });

  it("carries the Next Action Airtable wrote, rather than writing its own", () => {
    expect(health.neverContacted[0].nextAction).toBe(
      "🔴 CALL NOW - qualified, never contacted"
    );
  });

  it("still finds the bucket if someone changes the emoji in the base", () => {
    const renamed = pipelineHealth([
      record("l7", {
        "Lead Name": "Renamed icon",
        Stage: "Audit Booked",
        "Qualification Result": "Qualified",
        "Human Touches": 1,
        "Days Since Touch": 35,
        "Touch Status": "🟣 Ghosted 30d+",
      }),
    ]);
    expect(renamed.goingQuiet.ghosted30.map((lead) => lead.name)).toEqual(["Renamed icon"]);
    expect(plainText("⚫ Ghosted 30d+")).toBe("ghosted 30d+");
  });

  it("reads an empty leads table as an empty pipeline, not a broken one", () => {
    const none = pipelineHealth([]);
    expect(none.totalLeads).toBe(0);
    expect(none.neverContacted).toEqual([]);
    expect(none.debriefsMissing).toEqual([]);
  });

  it("counts days waiting from the opt-in date", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    expect(daysSince("2026-08-20", now)).toBe(5);
    expect(daysSince("2026-08-25", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("the read cache", () => {
  it("serves a repeat page load without going back to Airtable", async () => {
    resetForsightCache();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return [record("r1", {})];
    };
    const key = { orgId: "org-a", sourceId: "src-a", dataset: "leads" as const };

    const first = await readCached(key, load, () => 0);
    const second = await readCached(key, load, () => 60_000);

    expect(calls).toBe(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.fetchedAt).toEqual(first.fetchedAt);
  });

  it("re-reads once the hold expires", async () => {
    resetForsightCache();
    let calls = 0;
    const load = async () => {
      calls += 1;
      return [];
    };
    const key = { orgId: "org-a", sourceId: "src-a", dataset: "leads" as const };

    await readCached(key, load, () => 0);
    await readCached(key, load, () => 10 * 60_000);
    expect(calls).toBe(2);
  });

  it("never serves one workspace's rows to another", async () => {
    resetForsightCache();
    const key = { sourceId: "src-a", dataset: "leads" as const };

    const mine = await readCached({ ...key, orgId: "org-a" }, async () => [record("mine", {})]);
    const theirs = await readCached({ ...key, orgId: "org-b" }, async () => [
      record("theirs", {}),
    ]);

    expect(mine.records[0].id).toBe("mine");
    expect(theirs.records[0].id).toBe("theirs");
  });

  it("does not cache a failed read, so a broken base never looks like an empty one", async () => {
    resetForsightCache();
    const key = { orgId: "org-a", sourceId: "src-a", dataset: "leads" as const };

    await expect(
      readCached(key, async () => {
        throw new Error("unreachable");
      })
    ).rejects.toThrow("unreachable");

    const after = await readCached(key, async () => [record("live", {})]);
    expect(after.fromCache).toBe(false);
    expect(after.records[0].id).toBe("live");
  });
});
