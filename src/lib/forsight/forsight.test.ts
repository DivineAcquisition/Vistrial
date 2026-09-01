import { afterEach, describe, expect, it, vi } from "vitest";

import { listAirtableRecords } from "@/lib/forsight/airtable";
import { normalizeMetaAdAccountId } from "@/lib/forsight/env";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { fetchMetaAdInsights } from "@/lib/forsight/meta";
import { airtableProvider } from "@/lib/forsight/provider";
import { availableDatasets, missingDatasets, sourceFromRow } from "@/lib/forsight/sources";
import type { ForsightAirtableSource } from "@/lib/forsight/types";
import type { Tables } from "@/types/database";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function airtableRow(overrides: Partial<Tables<"forsight_sources">> = {}) {
  return {
    id: "src-1",
    org_id: ORG_ID,
    source_type: "airtable",
    status: "active",
    label: "DA Pipeline — Client Acquisition",
    airtable_base_id: "appDaPipeline",
    airtable_leads_table: "Leads",
    airtable_creatives_table: "Creatives",
    airtable_weekly_summary_table: "Weekly Summary",
    airtable_touches_table: "Touches",
    meta_ad_account_id: null,
    last_verified_at: null,
    last_error: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as Tables<"forsight_sources">;
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

afterEach(() => {
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.META_ACCESS_TOKEN;
  vi.restoreAllMocks();
});

describe("source records", () => {
  it("reads the four datasets off an Airtable source", () => {
    const source = sourceFromRow(airtableRow());
    expect(source.type).toBe("airtable");
    expect(availableDatasets(source)).toEqual(["leads", "creatives", "weeklySummary", "touches"]);
    expect(missingDatasets(source)).toEqual([]);
  });

  it("treats a table the base does not have as unavailable, not as zero", () => {
    const source = sourceFromRow(airtableRow({ airtable_creatives_table: null }));
    expect(availableDatasets(source)).toEqual(["leads", "weeklySummary", "touches"]);
    expect(missingDatasets(source)).toEqual(["creatives"]);
  });
});

describe("airtable reads", () => {
  it("follows every page of offsets without the caller knowing", async () => {
    process.env.AIRTABLE_API_KEY = "key-test";
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      seen.push(url.searchParams.get("offset") ?? "");
      if (!url.searchParams.get("offset")) {
        return jsonResponse({ records: [{ id: "rec1", fields: { Name: "A" } }], offset: "page2" });
      }
      return jsonResponse({ records: [{ id: "rec2", fields: { Name: "B" } }] });
    });

    const records = await listAirtableRecords({
      orgId: ORG_ID,
      baseId: "appDaPipeline",
      table: "Leads",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(records.map((record) => record.id)).toEqual(["rec1", "rec2"]);
    expect(seen).toEqual(["", "page2"]);
  });

  it("throws with the workspace named when the credential is rejected", async () => {
    process.env.AIRTABLE_API_KEY = "key-test";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { type: "UNAUTHORIZED", message: "Invalid token" } }, { status: 401 })
    );

    await expect(
      listAirtableRecords({
        orgId: ORG_ID,
        orgLabel: "Divine Acquisition",
        baseId: "appDaPipeline",
        table: "Leads",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({
      name: "ForsightSourceError",
      reason: "credential_rejected",
      orgId: ORG_ID,
    });
  });

  it("never answers an unreachable base with empty data", async () => {
    process.env.AIRTABLE_API_KEY = "key-test";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { type: "NOT_FOUND", message: "Base not found" } }, { status: 404 })
    );

    const error = await listAirtableRecords({
      orgId: ORG_ID,
      orgLabel: "Client Co",
      baseId: "appMissing",
      table: "Leads",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForsightSourceError);
    expect((error as ForsightSourceError).message).toContain("Client Co");
    expect((error as ForsightSourceError).message).toContain(ORG_ID);
  });

  it("retries a rate limit before giving up", async () => {
    process.env.AIRTABLE_API_KEY = "key-test";
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({}, { status: 429, headers: { "retry-after": "0" } });
      return jsonResponse({ records: [{ id: "rec1", fields: {} }] });
    });

    const records = await listAirtableRecords({
      orgId: ORG_ID,
      baseId: "appDaPipeline",
      table: "Leads",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });

    expect(calls).toBe(2);
    expect(records).toHaveLength(1);
  });

  it("refuses to read without a platform credential", async () => {
    await expect(
      listAirtableRecords({
        orgId: ORG_ID,
        baseId: "appDaPipeline",
        table: "Leads",
        fetchImpl: (async () => jsonResponse({ records: [] })) as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ reason: "credential_missing" });
  });
});

describe("provider interface", () => {
  const source: ForsightAirtableSource = sourceFromRow(
    airtableRow({ airtable_touches_table: null })
  ) as ForsightAirtableSource;

  it("reports a missing table instead of calling the source", async () => {
    const provider = airtableProvider(
      sourceFromRow(airtableRow({ airtable_creatives_table: null })) as ForsightAirtableSource,
      "Divine Acquisition"
    );
    const result = await provider.creatives();
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toContain("Creatives");
  });

  it("lists only the datasets this base has", () => {
    const provider = airtableProvider(source, "Divine Acquisition");
    expect(provider.availableDatasets()).toEqual(["leads", "creatives", "weeklySummary"]);
    expect(provider.sourceType).toBe("airtable");
  });
});

describe("meta ad spend", () => {
  it("normalizes an ad account id operators paste bare", () => {
    expect(normalizeMetaAdAccountId("1234567890")).toBe("act_1234567890");
    expect(normalizeMetaAdAccountId("act_1234567890")).toBe("act_1234567890");
  });

  it("totals spend across every page of ad-level insights", async () => {
    process.env.META_ACCESS_TOKEN = "token-test";
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({
          data: [{ ad_id: "1", spend: "12.50", impressions: "100", clicks: "4" }],
          paging: { next: "https://graph.facebook.com/next-page" },
        });
      }
      return jsonResponse({
        data: [{ ad_id: "2", spend: "7.50", impressions: "50", clicks: "1" }],
      });
    });

    const result = await fetchMetaAdInsights({
      orgId: ORG_ID,
      adAccountId: "1234567890",
      since: "2026-08-01",
      until: "2026-08-07",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.adAccountId).toBe("act_1234567890");
    expect(result.rows).toHaveLength(2);
    expect(result.totalSpend).toBe(20);
    expect(result.totalImpressions).toBe(150);
    expect(result.totalClicks).toBe(5);
  });

  it("fails loudly on a graph error rather than reporting zero spend", async () => {
    process.env.META_ACCESS_TOKEN = "token-test";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "Invalid OAuth access token" } }, { status: 401 })
    );

    await expect(
      fetchMetaAdInsights({
        orgId: ORG_ID,
        orgLabel: "Divine Acquisition",
        adAccountId: "act_1234567890",
        since: "2026-08-01",
        until: "2026-08-07",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ reason: "credential_rejected", sourceType: "meta_ads" });
  });
});
