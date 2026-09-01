import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetForsightCache } from "@/lib/forsight/cache";
import { syncWorkspaceSpend } from "@/lib/forsight/meta-sync";
import type { ForsightDb } from "@/lib/forsight/sources";

/**
 * The whole sync, run against a fake Airtable and a fake Meta.
 *
 * The claim this file exists to prove is that running the same period twice
 * writes the same values twice. Everything the sync sends is captured so a
 * second run can be compared to the first byte for byte.
 */

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TODAY = new Date("2026-09-02T09:00:00Z");

type Write = { method: string; table: string; body: { records: Array<Record<string, unknown>> } };

function airtableRecord(id: string, fields: Record<string, unknown>) {
  return { id, fields };
}

/** Only the query shapes the sync actually uses. */
function fakeDb(state: { runs: Array<Record<string, unknown>> }): ForsightDb {
  const sources = [
    {
      id: "src-airtable",
      org_id: ORG_ID,
      source_type: "airtable",
      status: "active",
      label: "DA Pipeline",
      airtable_base_id: "appDaPipeline",
      airtable_leads_table: "Leads",
      airtable_creatives_table: "Creatives",
      airtable_weekly_summary_table: "Weekly Summary",
      airtable_touches_table: "Touches",
      meta_ad_account_id: null,
      ghl_calendar_id: null,
      last_verified_at: null,
      last_error: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "src-meta",
      org_id: ORG_ID,
      source_type: "meta_ads",
      status: "active",
      label: "DA ad account",
      airtable_base_id: null,
      airtable_leads_table: null,
      airtable_creatives_table: null,
      airtable_weekly_summary_table: null,
      airtable_touches_table: null,
      meta_ad_account_id: "act_1234567890",
      ghl_calendar_id: null,
      last_verified_at: null,
      last_error: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ];

  const chain = (result: { data: unknown; error: null }) => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) {
      self[method] = () => self;
    }
    self.maybeSingle = async () => result;
    self.single = async () => result;
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return self;
  };

  return {
    from(table: string) {
      if (table === "forsight_sources") return chain({ data: sources, error: null });
      if (table === "organizations") {
        return chain({ data: { name: "Divine Acquisition" }, error: null });
      }
      if (table === "forsight_sync_runs") {
        const succeeded = state.runs
          .filter((run) => run.status === "succeeded" && run.period_end)
          .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))[0];
        return {
          ...chain({ data: succeeded ? { period_end: succeeded.period_end } : null, error: null }),
          insert(row: Record<string, unknown>) {
            const created = { ...row, id: `run-${state.runs.length + 1}` };
            state.runs.push(created);
            return chain({ data: { id: created.id }, error: null });
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_column: string, id: string) {
                const run = state.runs.find((entry) => entry.id === id);
                if (run) Object.assign(run, patch);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }
      return chain({ data: null, error: null });
    },
  } as unknown as ForsightDb;
}

/** Airtable and Meta, both answering from fixed data. */
function fakeFetch(writes: Write[]) {
  const creatives = [
    airtableRecord("recA", { "Creative Name": "DA-01 Scenario Cut" }),
    airtableRecord("recB", { "Creative Name": "DA-02 Direct Cold Cut" }),
  ];
  const weekly = [
    airtableRecord("recW1", {
      Week: "TEST - Week 1",
      "Week Start Date": "2026-08-18",
      "Total Spend": 700,
      "Applications Submitted": 40,
      "Audits Held": 4,
      Notes: "creative fatigue, swapped hook Thursday",
    }),
  ];

  return async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    if (url.hostname === "graph.facebook.com") {
      const lifetime = url.searchParams.get("date_preset") === "maximum";
      if (lifetime) {
        return json({
          data: [
            { ad_name: "DA-01 Scenario Cut", spend: "420.5", impressions: "9000", clicks: "173" },
            { ad_name: "DA-02 Direct Cold Cut", spend: "380", impressions: "7100", clicks: "75" },
            { ad_name: "DA-99 Ad With No Creative", spend: "60", impressions: "900", clicks: "4" },
          ],
        });
      }
      const range = JSON.parse(url.searchParams.get("time_range") ?? "{}") as { since?: string };
      const perWeek: Record<string, number> = { "2026-08-18": 700, "2026-08-25": 655, "2026-09-01": 210 };
      return json({
        data: [{ ad_name: "DA-01 Scenario Cut", spend: String(perWeek[range.since ?? ""] ?? 0) }],
      });
    }

    const table = decodeURIComponent(url.pathname.split("/").pop() ?? "");

    if (!init?.method || init.method === "GET") {
      return json({ records: table === "Creatives" ? creatives : weekly });
    }

    writes.push({
      method: init.method,
      table,
      body: JSON.parse(String(init.body)) as Write["body"],
    });
    return json({ records: [{ id: "recNew" }] });
  };
}

beforeEach(() => {
  resetForsightCache();
  process.env.AIRTABLE_API_KEY = "key-test";
  process.env.META_ACCESS_TOKEN = "token-test";
});

afterEach(() => {
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.META_ACCESS_TOKEN;
});

async function run(state: { runs: Array<Record<string, unknown>> }) {
  const writes: Write[] = [];
  const outcome = await syncWorkspaceSpend(fakeDb(state), ORG_ID, {
    now: TODAY,
    fetchImpl: fakeFetch(writes) as unknown as typeof fetch,
  });
  return { outcome, writes };
}

describe("the Meta spend sync", () => {
  it("writes lifetime totals onto the creatives it can match by name", async () => {
    const { writes } = await run({ runs: [] });
    const creativePatch = writes.find((write) => write.table === "Creatives");

    expect(creativePatch?.method).toBe("PATCH");
    expect(creativePatch?.body.records).toEqual([
      { id: "recA", fields: { Spend: 420.5, Impressions: 9000, Clicks: 173 } },
      { id: "recB", fields: { Spend: 380, Impressions: 7100, Clicks: 75 } },
    ]);
  });

  it("reports an ad with no creative of the same name instead of creating one", async () => {
    const { outcome, writes } = await run({ runs: [] });

    expect(outcome.unmatchedAds).toEqual(["DA-99 Ad With No Creative"]);
    // Nothing was created in Creatives to paper over the naming mistake.
    expect(writes.filter((write) => write.table === "Creatives" && write.method === "POST")).toEqual(
      []
    );
  });

  it("establishes only the current period on a first run", async () => {
    const { outcome, writes } = await run({ runs: [] });

    expect(outcome.periodStart).toBe("2026-09-01");
    expect(outcome.weeksWritten).toBe(1);
    // No reaching back through history that nobody asked for.
    expect(writes.filter((write) => write.table === "Weekly Summary")).toHaveLength(1);
  });

  it("writes only spend onto a week a person has already filled in", async () => {
    const state = {
      runs: [{ id: "run-0", status: "succeeded", period_end: "2026-08-20" }] as Array<
        Record<string, unknown>
      >,
    };
    const { writes } = await run(state);
    const patch = writes.find(
      (write) => write.table === "Weekly Summary" && write.method === "PATCH"
    );

    for (const record of patch?.body.records ?? []) {
      expect(Object.keys(record.fields as object)).toEqual(["Total Spend"]);
    }
    expect(patch?.body.records).toContainEqual({
      id: "recW1",
      fields: { "Total Spend": 700 },
    });
  });

  it("creates a missing week on the base's own Tuesday cadence", async () => {
    const { writes } = await run({ runs: [] });
    const created = writes.find(
      (write) => write.table === "Weekly Summary" && write.method === "POST"
    );

    expect(created?.body.records).toEqual([
      {
        fields: {
          Week: "Week of 9/1",
          "Week Start Date": "2026-09-01",
          "Total Spend": 210,
        },
      },
    ]);
  });

  it("writes exactly the same thing when the same period is synced twice", async () => {
    // Two independent starting states, so both runs cover the same weeks. This
    // is the claim the whole design rests on: same inputs, same writes.
    const seed = () => ({
      runs: [{ id: "run-0", status: "succeeded", period_end: "2026-08-20" }] as Array<
        Record<string, unknown>
      >,
    });

    const first = await run(seed());
    const second = await run(seed());

    expect(second.writes).toEqual(first.writes);
    expect(second.outcome).toEqual(first.outcome);
  });

  it("sets the week's spend rather than adding to it", async () => {
    const seed = () => ({
      runs: [{ id: "run-0", status: "succeeded", period_end: "2026-08-20" }] as Array<
        Record<string, unknown>
      >,
    });

    const spends = async () => {
      const { writes } = await run(seed());
      return writes
        .filter((write) => write.table === "Weekly Summary")
        .flatMap((write) => write.body.records)
        .map((record) => (record.fields as Record<string, number>)["Total Spend"])
        .sort((a, b) => a - b);
    };

    // 700 is already on the existing 8/18 row. A second sync of that week
    // writes 700 again, not 1400.
    expect(await spends()).toEqual([210, 655, 700]);
    expect(await spends()).toEqual([210, 655, 700]);
  });

  it("moves on to the current week once a period is done", async () => {
    const state = { runs: [] as Array<Record<string, unknown>> };
    await run(state);
    const { outcome } = await run(state);

    expect(outcome.periodStart).toBe("2026-09-01");
    expect(outcome.weeksWritten).toBe(1);
  });

  it("records the run, the period, and what did not match", async () => {
    const state = { runs: [] as Array<Record<string, unknown>> };
    await run(state);

    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toMatchObject({
      org_id: ORG_ID,
      source_type: "meta_ads",
      status: "succeeded",
      period_end: "2026-09-02",
      unmatched_ads: ["DA-99 Ad With No Creative"],
    });
  });

  it("leaves a failed period unrecorded so the next run redoes it", async () => {
    const state = { runs: [] as Array<Record<string, unknown>> };

    await expect(
      syncWorkspaceSpend(fakeDb(state), ORG_ID, {
        now: TODAY,
        fetchImpl: (async () =>
          new Response(JSON.stringify({ error: { message: "Base is down" } }), {
            status: 500,
            headers: { "content-type": "application/json" },
          })) as unknown as typeof fetch,
      })
    ).rejects.toThrow();

    expect(state.runs[0]).toMatchObject({ status: "failed" });
    expect(state.runs[0].period_end).toBeUndefined();

    // The next run starts from scratch and completes the same period.
    const recovered = await run(state);
    expect(recovered.outcome.periodEnd).toBe("2026-09-02");
    expect(state.runs[1]).toMatchObject({ status: "succeeded" });
  });

  it("only syncs weeks from the last clean run onward", async () => {
    const state = {
      runs: [
        { id: "run-0", status: "succeeded", period_end: "2026-09-01" },
      ] as Array<Record<string, unknown>>,
    };
    const { outcome } = await run(state);
    expect(outcome.periodStart).toBe("2026-09-01");
    expect(outcome.weeksWritten).toBe(1);
  });
});
