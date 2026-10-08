import { describe, expect, it } from "vitest";

import { readCached, resetForsightCache } from "@/lib/forsight/cache";
import { touchStatus } from "@/lib/forsight/core-source";
import {
  comparableByCostPerAuditHeld,
  totalSpend,
  type CreativeRow,
} from "@/lib/forsight/creatives";
import {
  daysSince,
  debriefsMissing,
  goingQuiet,
  isClosedStage,
  neverContacted,
  plainText,
  type LeadRow,
} from "@/lib/forsight/pipeline";
import type { ForsightRecord } from "@/lib/forsight/types";
import {
  compareMetricAscending,
  formatMetric,
  movement,
  toMetricValue,
} from "@/lib/forsight/values";

function record(id: string, fields: Record<string, unknown>): ForsightRecord {
  return { id, fields };
}

function creative(name: string, spend: number, costPerAuditHeld: unknown): CreativeRow {
  return {
    id: name,
    name,
    status: "ACTIVE",
    spend: toMetricValue(spend),
    ctr: { kind: "absent" },
    costPerLead: { kind: "absent" },
    costPerQualifiedLead: { kind: "absent" },
    costPerAuditHeld: toMetricValue(costPerAuditHeld),
    cac: { kind: "absent" },
  };
}

function lead(name: string, over: Partial<LeadRow> = {}): LeadRow {
  const humanTouches = over.humanTouches ?? 0;
  const daysSinceTouch = over.daysSinceTouch ?? null;
  return {
    id: name,
    name,
    stage: "qualified",
    qualificationResult: "Qualified",
    readinessScore: 80,
    humanTouches,
    optInDate: "2026-08-20",
    daysSinceTouch,
    touchStatus: touchStatus(humanTouches, daysSinceTouch),
    nextAction: "",
    debriefMissing: false,
    ...over,
  };
}

describe("the three states a metric can be in", () => {
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

  it("tolerates a number that arrives with a currency symbol", () => {
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
      better: "lower",
    });
    expect(better).toEqual({ direction: "down", amount: "$25", isGood: true });

    const worse = movement(toMetricValue("200"), toMetricValue("175"), {
      format: "currency",
      better: "lower",
    });
    expect(worse).toMatchObject({ direction: "up", isGood: false });
  });

  it("calls a rising ROAS good", () => {
    expect(
      movement(toMetricValue("14"), toMetricValue("12"), { format: "ratio", better: "higher" })
    ).toEqual({ direction: "up", amount: "2×", isGood: true });
  });

  it("does not congratulate anyone for spending more, in either direction", () => {
    const up = movement(toMetricValue("700"), toMetricValue("655"), {
      format: "currency",
      better: "neither",
    });
    expect(up).toEqual({ direction: "up", amount: "$45", isGood: undefined });

    const down = movement(toMetricValue("600"), toMetricValue("655"), {
      format: "currency",
      better: "neither",
    });
    expect(down?.isGood).toBeUndefined();
  });

  it("does not call an unchanged number good news", () => {
    expect(
      movement(toMetricValue("175"), toMetricValue("175"), {
        format: "currency",
        better: "lower",
      })
    ).toEqual({ direction: "flat", amount: "$0", isGood: undefined });
  });

  it("gives no direction when either week is a text state", () => {
    expect(
      movement(toMetricValue("No closes yet"), toMetricValue("700"), {
        format: "currency",
        better: "lower",
      })
    ).toBeNull();
    expect(
      movement(toMetricValue("700"), toMetricValue(undefined), {
        format: "currency",
        better: "lower",
      })
    ).toBeNull();
  });
});

describe("creative performance", () => {
  const creatives = [
    creative("DA-04 Proof Cut", 100, "90"),
    creative("DA-02 Direct Cold Cut", 450, "150"),
    creative("DA-03 Arithmetic Cut", 200, "No audits yet"),
    creative("DA-01 Scenario Cut", 300, undefined),
  ];

  it("never sorts a creative with no audits yet as if it cost nothing", () => {
    expect(compareMetricAscending(toMetricValue("No audits yet"), toMetricValue("0"))).toBe(1);
  });

  it("compares only the creatives that have a real cost per audit held", () => {
    expect(comparableByCostPerAuditHeld(creatives)).toEqual([
      { label: "DA-04 Proof Cut", value: 90 },
      { label: "DA-02 Direct Cold Cut", value: 150 },
    ]);
  });

  it("totals spend for the footer without deriving anything", () => {
    expect(totalSpend(creatives)).toMatchObject({ value: 1050 });
    expect(totalSpend([]).kind).toBe("absent");
  });

  it("survives a workspace that has creatives but no cost recorded yet", () => {
    const rows = [creative("DA-01", 0, undefined)];
    expect(formatMetric(rows[0].costPerAuditHeld, "currency")).toBe("—");
    expect(comparableByCostPerAuditHeld(rows)).toEqual([]);
  });
});

describe("pipeline health", () => {
  const leads = [
    lead("Qualified, no contact", { readinessScore: 100, daysSinceTouch: null }),
    lead("Borderline", { stage: "manual_review", readinessScore: 65 }),
    lead("Disqualified", { stage: "disqualified", qualificationResult: "Manual Review" }),
    lead("Closed won", {
      stage: "closed_won",
      humanTouches: 5,
      daysSinceTouch: 44,
      debriefMissing: true,
    }),
    lead("Drifting", { stage: "proposal_out", humanTouches: 3, daysSinceTouch: 18 }),
    lead("Long gone", { stage: "audit_booked", humanTouches: 2, daysSinceTouch: 40 }),
  ];

  it("lists qualified leads nobody has spoken to, best score first", () => {
    expect(neverContacted(leads).map((row) => row.name)).toEqual([
      "Qualified, no contact",
      "Borderline",
    ]);
  });

  it("leaves closed and disqualified leads out of every section", () => {
    expect(neverContacted(leads).map((row) => row.name)).not.toContain("Disqualified");
    const quiet = goingQuiet(leads);
    const names = [...quiet.ghosted30, ...quiet.ghosted14].map((row) => row.name);
    expect(names).not.toContain("Closed won");
  });

  it("groups the quiet leads by how long they have been silent", () => {
    const quiet = goingQuiet(leads);
    expect(quiet.ghosted30.map((row) => row.name)).toEqual(["Long gone"]);
    expect(quiet.ghosted14.map((row) => row.name)).toEqual(["Drifting"]);
  });

  it("does not double-count a never-contacted lead as going quiet", () => {
    const quiet = goingQuiet(leads);
    const names = [...quiet.ghosted30, ...quiet.ghosted14].map((row) => row.name);
    expect(names).not.toContain("Qualified, no contact");
  });

  it("finds held calls with no debrief", () => {
    expect(debriefsMissing(leads).map((row) => row.name)).toEqual(["Closed won"]);
  });

  it("reads a stage the same whether it arrives underscored or written out", () => {
    expect(isClosedStage("closed_won")).toBe(true);
    expect(isClosedStage("Closed Won")).toBe(true);
    expect(isClosedStage("audit_booked")).toBe(false);
  });

  it("still finds the bucket if someone changes the icon on the status", () => {
    const renamed = goingQuiet([
      lead("Renamed icon", {
        stage: "audit_booked",
        humanTouches: 1,
        daysSinceTouch: 35,
        touchStatus: "🟣 Ghosted 30d+",
      }),
    ]);
    expect(renamed.ghosted30.map((row) => row.name)).toEqual(["Renamed icon"]);
    expect(plainText("⚫ Ghosted 30d+")).toBe("ghosted 30d+");
  });

  it("reads an empty leads table as an empty pipeline, not a broken one", () => {
    expect(neverContacted([])).toEqual([]);
    expect(debriefsMissing([])).toEqual([]);
    expect(goingQuiet([])).toEqual({ ghosted30: [], ghosted14: [] });
  });

  it("counts days waiting from the opt-in date", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    expect(daysSince("2026-08-20", now)).toBe(5);
    expect(daysSince("2026-08-25", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("the read cache", () => {
  it("serves a repeat page load without going back to the source", async () => {
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

  it("does not cache a failed read, so a broken source never looks like an empty one", async () => {
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

describe("silence thresholds from configuration", () => {
  it("keeps today's 7/14/30 wording by default", () => {
    expect(touchStatus(2, 20)).toBe("🟠 Ghosted 14d+");
    expect(touchStatus(2, 31)).toBe("⚫ Ghosted 30d+");
  });

  it("buckets and labels by the workspace's own thresholds", () => {
    const thresholds = { quietDays: 4, silentDays: 7, longSilentDays: 21 };
    expect(touchStatus(2, 10, thresholds)).toBe("🟠 Ghosted 7d+");
    const rows = [
      lead("Ana", { humanTouches: 1, daysSinceTouch: 10, touchStatus: touchStatus(1, 10, thresholds) }),
      lead("Ben", { humanTouches: 1, daysSinceTouch: 25, touchStatus: touchStatus(1, 25, thresholds) }),
      lead("Cy", { humanTouches: 1, daysSinceTouch: 5, touchStatus: touchStatus(1, 5, thresholds) }),
    ];
    const buckets = goingQuiet(rows, thresholds);
    expect(buckets.ghosted14.map((row) => row.name)).toEqual(["Ana"]);
    expect(buckets.ghosted30.map((row) => row.name)).toEqual(["Ben"]);
  });
});
