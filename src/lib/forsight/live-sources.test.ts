import { describe, expect, it, vi } from "vitest";

import { countAppointments, countMessages } from "@/lib/forsight/ghl";
import {
  CREATIVE_WRITABLE,
  MAX_CATCHUP_WEEKS,
  WEEKLY_SUMMARY_MANUAL,
  WEEKLY_SUMMARY_WRITABLE,
  assertWritable,
  totalsByAdName,
} from "@/lib/forsight/meta-sync";
import { reconcileAppointments, reconciliationSentence } from "@/lib/forsight/reconcile";
import { toMetricValue } from "@/lib/forsight/values";
import {
  mondayOf,
  weekCadence,
  weekEnd,
  weekLabel,
  weekStartsBetween,
} from "@/lib/forsight/weeks";

describe("weeks follow the base, not the calendar", () => {
  it("continues the Tuesday cadence the DA base already uses", () => {
    const cadence = weekCadence(["2026-08-18"], "2026-09-01");
    expect(cadence.weekStartFor("2026-08-18")).toBe("2026-08-18");
    expect(cadence.weekStartFor("2026-08-24")).toBe("2026-08-18");
    expect(cadence.weekStartFor("2026-08-25")).toBe("2026-08-25");
    expect(cadence.weekStartFor("2026-09-01")).toBe("2026-09-01");
  });

  it("anchors on the earliest recorded week so later rows cannot shift the grid", () => {
    const cadence = weekCadence(["2026-08-25", "2026-08-18"], "2026-09-01");
    expect(cadence.anchor).toBe("2026-08-18");
  });

  it("falls back to Monday only when the base has no weeks at all", () => {
    const cadence = weekCadence([], "2026-09-03");
    expect(cadence.anchor).toBe(mondayOf("2026-09-03"));
    expect(mondayOf("2026-09-03")).toBe("2026-08-31");
  });

  it("names a new week the way the base's own field description does", () => {
    expect(weekLabel("2026-08-25")).toBe("Week of 8/25");
    expect(weekEnd("2026-08-25")).toBe("2026-08-31");
  });

  it("lists every week from the last sync through today", () => {
    const cadence = weekCadence(["2026-08-18"], "2026-09-01");
    expect(weekStartsBetween(cadence, "2026-08-19", "2026-09-02", MAX_CATCHUP_WEEKS)).toEqual([
      "2026-08-18",
      "2026-08-25",
      "2026-09-01",
    ]);
  });

  it("catches up on the most recent weeks rather than the oldest after a long outage", () => {
    const cadence = weekCadence(["2026-01-06"], "2026-09-01");
    const weeks = weekStartsBetween(cadence, "2026-01-06", "2026-09-01", MAX_CATCHUP_WEEKS);
    expect(weeks).toHaveLength(MAX_CATCHUP_WEEKS);
    expect(weeks[weeks.length - 1]).toBe(cadence.weekStartFor("2026-09-01"));
  });
});

describe("the spend sync cannot touch what it does not own", () => {
  it("refuses to write a field outside its allowlist", () => {
    expect(() =>
      assertWritable({ "Audits Held": 4 }, WEEKLY_SUMMARY_WRITABLE, "Weekly Summary")
    ).toThrow(/does not own/);
    expect(() =>
      assertWritable({ "Cost per Audit Held": 1 }, CREATIVE_WRITABLE, "Creatives")
    ).toThrow(/does not own/);
  });

  it("leaves every manually entered Weekly Summary field out of the allowlist", () => {
    for (const field of WEEKLY_SUMMARY_MANUAL) {
      expect(WEEKLY_SUMMARY_WRITABLE.has(field)).toBe(false);
    }
    expect([...WEEKLY_SUMMARY_MANUAL]).toEqual([
      "Applications Submitted",
      "Qualified",
      "Audits Booked",
      "Audits Held",
      "Closed Won",
      "Revenue Closed",
      "Notes",
    ]);
  });

  it("never writes a formula field, because Airtable owns every calculation", () => {
    expect([...CREATIVE_WRITABLE]).toEqual(["Spend", "Impressions", "Clicks"]);
    expect(CREATIVE_WRITABLE.has("CAC")).toBe(false);
    expect(CREATIVE_WRITABLE.has("CTR %")).toBe(false);
  });

  it("permits spend and the two fields that identify a week it had to create", () => {
    expect(() =>
      assertWritable(
        { "Total Spend": 700, Week: "Week of 8/25", "Week Start Date": "2026-08-25" },
        WEEKLY_SUMMARY_WRITABLE,
        "Weekly Summary"
      )
    ).not.toThrow();
  });
});

describe("folding Meta's rows before writing them", () => {
  it("sums a per-day breakdown into one total per ad", () => {
    const totals = totalsByAdName([
      { adName: "DA-01 Scenario Cut", spend: 100, impressions: 900, clicks: 12 },
      { adName: "DA-01 Scenario Cut", spend: 50.5, impressions: 400, clicks: 5 },
      { adName: "DA-02 Direct Cold Cut", spend: 20, impressions: 100, clicks: 1 },
    ].map(asInsight));

    expect(totals.get("DA-01 Scenario Cut")).toEqual({
      spend: 150.5,
      impressions: 1300,
      clicks: 17,
    });
    expect(totals.get("DA-02 Direct Cold Cut")?.spend).toBe(20);
  });

  it("is a set rather than an add, so folding the same rows twice is the same answer", () => {
    const rows = [asInsight({ adName: "DA-01", spend: 100, impressions: 10, clicks: 1 })];
    expect(totalsByAdName(rows)).toEqual(totalsByAdName(rows));
  });

  it("ignores an ad with no name rather than inventing a key for it", () => {
    expect(totalsByAdName([asInsight({ adName: null, spend: 40, impressions: 1, clicks: 0 })]).size).toBe(0);
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

describe("Airtable against LeadConnector", () => {
  const ghl = { booked: 6, showed: 4, noShowed: 1, cancelled: 0 };

  it("says so plainly when both systems agree", () => {
    const result = reconcileAppointments(ghl, {
      booked: toMetricValue(6),
      held: toMetricValue(4),
    });
    expect(result.disagrees).toBe(false);
    expect(reconciliationSentence(result)).toContain("Both systems agree");
  });

  it("names the gap and points at the likely cause when they do not", () => {
    const result = reconcileAppointments(ghl, {
      booked: toMetricValue(4),
      held: toMetricValue(4),
    });
    expect(result.disagrees).toBe(true);
    expect(result.lines[0]).toMatchObject({ label: "Booked", ghl: 6, airtable: 4, gap: 2 });
    const sentence = reconciliationSentence(result);
    expect(sentence).toContain("2 fewer booked in Airtable");
    expect(sentence).toContain("workflow step stopped writing");
  });

  it("picks no winner — it reports both numbers and the difference", () => {
    const result = reconcileAppointments(ghl, {
      booked: toMetricValue(4),
      held: toMetricValue(9),
    });
    expect(result.lines.map((line) => [line.ghl, line.airtable])).toEqual([
      [6, 4],
      [4, 9],
    ]);
    expect(reconciliationSentence(result)).toContain("5 more showed in Airtable");
  });

  it("does not manufacture a disagreement when Airtable has no counts yet", () => {
    const result = reconcileAppointments(ghl, {
      booked: toMetricValue(undefined),
      held: toMetricValue(undefined),
    });
    expect(result.incomparable).toBe(true);
    expect(result.disagrees).toBe(false);
    expect(reconciliationSentence(result)).toContain("nothing to compare against");
  });
});

function asInsight(row: {
  adName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
}) {
  return {
    adId: null,
    adName: row.adName,
    campaignId: null,
    campaignName: null,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    dateStart: null,
    dateStop: null,
  };
}

describe("the Airtable write path", () => {
  it("batches at ten records and sets fields rather than merging them", async () => {
    process.env.AIRTABLE_API_KEY = "key-test";
    const { updateAirtableRecords } = await import("@/lib/forsight/airtable-write");

    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await updateAirtableRecords(
      {
        orgId: "org-a",
        baseId: "appTest",
        table: "Creatives",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      Array.from({ length: 23 }, (_, index) => ({
        id: `rec${index}`,
        fields: { Spend: index },
      }))
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect((bodies[0] as { records: unknown[] }).records).toHaveLength(10);
    expect((bodies[2] as { records: unknown[] }).records).toHaveLength(3);
    // No typecast: a value Airtable would have to coerce is a bug worth seeing.
    expect(bodies[0]).not.toHaveProperty("typecast");

    delete process.env.AIRTABLE_API_KEY;
  });

  it("throws rather than half-writing when Airtable rejects the credential", async () => {
    process.env.AIRTABLE_API_KEY = "key-test";
    const { updateAirtableRecords } = await import("@/lib/forsight/airtable-write");

    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );

    await expect(
      updateAirtableRecords(
        {
          orgId: "org-a",
          orgLabel: "Divine Acquisition",
          baseId: "appTest",
          table: "Creatives",
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
        [{ id: "rec1", fields: { Spend: 1 } }]
      )
    ).rejects.toMatchObject({ reason: "credential_rejected" });

    delete process.env.AIRTABLE_API_KEY;
  });

  it("does nothing at all when there is nothing to write", async () => {
    const { updateAirtableRecords } = await import("@/lib/forsight/airtable-write");
    const fetchImpl = vi.fn();
    await updateAirtableRecords(
      { orgId: "org-a", baseId: "appTest", table: "Creatives", fetchImpl: fetchImpl as unknown as typeof fetch },
      []
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
