import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeMetaAdAccountId } from "@/lib/forsight/env";
import { fetchMetaAdInsights } from "@/lib/forsight/meta";
import { sourceFromRow } from "@/lib/forsight/sources";
import { implicitCoreSource, metricsSourceFor } from "@/lib/forsight/types";
import type { Tables } from "@/types/database";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function sourceRow(overrides: Partial<Tables<"forsight_sources">> = {}) {
  return {
    id: "src-1",
    org_id: ORG_ID,
    source_type: "vistrial_core",
    status: "active",
    label: "DA Pipeline — Client Acquisition",
    meta_ad_account_id: null,
    ghl_calendar_id: null,
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
  delete process.env.META_ACCESS_TOKEN;
  vi.restoreAllMocks();
});

describe("source records", () => {
  it("reads a core source off its row", () => {
    const source = sourceFromRow(sourceRow());
    expect(source.type).toBe("vistrial_core");
    expect(source.orgId).toBe(ORG_ID);
  });

  it("reads a Meta source off its row", () => {
    const source = sourceFromRow(
      sourceRow({ id: "src-meta", source_type: "meta_ads", meta_ad_account_id: "act_1" })
    );
    expect(source.type).toBe("meta_ads");
    if (source.type === "meta_ads") expect(source.adAccountId).toBe("act_1");
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

describe("every workspace is a Forsight workspace", () => {
  it("reads this workspace's own tables when no metrics source was provisioned", () => {
    const source = metricsSourceFor([], ORG_ID);
    expect(source).toEqual(implicitCoreSource(ORG_ID));
    expect(source.type).toBe("vistrial_core");
  });

  it("keeps the provisioned core source when one exists", () => {
    const core = sourceFromRow(sourceRow());
    expect(metricsSourceFor([core], ORG_ID)).toBe(core);
  });

  it("does not let a Meta source stand in for weekly metrics", () => {
    const meta = sourceFromRow(
      sourceRow({ id: "src-meta", source_type: "meta_ads", meta_ad_account_id: "act_1" })
    );
    expect(metricsSourceFor([meta], ORG_ID).type).toBe("vistrial_core");
  });
});
