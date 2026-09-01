import "server-only";

import {
  metaAccessToken,
  metaGraphApiBase,
  normalizeMetaAdAccountId,
} from "@/lib/forsight/env";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { loadForsightSource, type ForsightDb } from "@/lib/forsight/sources";

/**
 * Ad spend comes from the Meta Marketing API. The ad account is a property of
 * the workspace's source record, not a platform singleton, because client
 * workspaces will eventually have their own accounts read the same way. Only
 * the token is platform-wide, and only because DA owns every account involved.
 *
 * Read-only. Forsight never writes to Meta.
 */

const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "clicks",
  "date_start",
  "date_stop",
] as const;

const MAX_PAGES = 100;

export type MetaAdInsight = {
  adId: string | null;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  dateStart: string | null;
  dateStop: string | null;
};

export type MetaInsightsResult = {
  adAccountId: string;
  since: string;
  until: string;
  rows: MetaAdInsight[];
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
};

type GraphInsightsPage = {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
};

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function insightFromRow(row: Record<string, unknown>): MetaAdInsight {
  return {
    adId: text(row.ad_id),
    adName: text(row.ad_name),
    campaignId: text(row.campaign_id),
    campaignName: text(row.campaign_name),
    spend: numeric(row.spend),
    impressions: numeric(row.impressions),
    clicks: numeric(row.clicks),
    dateStart: text(row.date_start),
    dateStop: text(row.date_stop),
  };
}

export function metaFailureReason(status: number) {
  if (status === 401 || status === 403) return "credential_rejected" as const;
  if (status === 429) return "rate_limited" as const;
  return "unreachable" as const;
}

export type MetaInsightsArgs = {
  orgId: string;
  orgLabel?: string | null;
  adAccountId: string;
  since: string;
  until: string;
  /**
   * Meta's own preset, used instead of the date range. `maximum` gives each
   * ad's lifetime totals, which is what Airtable's Creatives row needs: its
   * cost formulas divide spend by lifetime rollups, so a partial-period spend
   * in that field would make every cost on the page wrong.
   */
  datePreset?: "maximum";
  signal?: AbortSignal;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

/** Ad-level insights for a date range, every page of them. */
export async function fetchMetaAdInsights(args: MetaInsightsArgs): Promise<MetaInsightsResult> {
  const token = metaAccessToken();
  const account = normalizeMetaAdAccountId(args.adAccountId);

  const fail = (
    reason: ConstructorParameters<typeof ForsightSourceError>[0]["reason"],
    extra: { httpStatus?: number | null; detail?: string | null } = {}
  ) =>
    new ForsightSourceError({
      orgId: args.orgId,
      orgLabel: args.orgLabel,
      sourceType: "meta_ads",
      reason,
      ...extra,
    });

  if (!token) {
    throw fail("credential_missing", {
      detail: "META_ACCESS_TOKEN is not set on this deployment.",
    });
  }
  if (!account) {
    throw fail("not_configured", { detail: "The source record has no Meta ad account id." });
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const first = new URL(`${metaGraphApiBase()}/${account}/insights`);
  first.searchParams.set("level", "ad");
  first.searchParams.set("fields", INSIGHT_FIELDS.join(","));
  if (args.datePreset) {
    first.searchParams.set("date_preset", args.datePreset);
  } else {
    first.searchParams.set("time_range", JSON.stringify({ since: args.since, until: args.until }));
  }
  first.searchParams.set("time_increment", "all_days");
  first.searchParams.set("limit", "500");

  const rows: MetaAdInsight[] = [];
  let next: string | null = first.toString();
  let pages = 0;

  while (next) {
    if (pages >= MAX_PAGES) {
      throw fail("unreachable", {
        detail: `Stopped after ${MAX_PAGES} pages of insights for ${account}.`,
      });
    }

    const response = await fetchImpl(next, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: args.signal,
      cache: "no-store",
    });

    let json: GraphInsightsPage;
    try {
      json = (await response.json()) as GraphInsightsPage;
    } catch {
      throw fail("malformed_response", {
        httpStatus: response.status,
        detail: `Ad account ${account} did not return JSON.`,
      });
    }

    if (!response.ok || json.error) {
      throw fail(metaFailureReason(response.status), {
        httpStatus: response.status,
        detail: `Ad account ${account}. ${json.error?.message ?? "No detail returned."}`,
      });
    }

    if (!Array.isArray(json.data)) {
      throw fail("malformed_response", {
        httpStatus: response.status,
        detail: `Ad account ${account} returned no data array.`,
      });
    }

    for (const row of json.data) rows.push(insightFromRow(row));
    next = json.paging?.next ?? null;
    pages += 1;
  }

  return {
    adAccountId: account,
    since: args.since,
    until: args.until,
    rows,
    totalSpend: rows.reduce((sum, row) => sum + row.spend, 0),
    totalImpressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    totalClicks: rows.reduce((sum, row) => sum + row.clicks, 0),
  };
}

/**
 * Same read, resolved from the workspace's own source record. This is the call
 * that proves the connection: a real ad account, a real date range, a real
 * spend number, or a loud error naming the workspace.
 */
export async function readWorkspaceAdSpend(
  db: ForsightDb,
  args: { orgId: string; orgName?: string | null; since: string; until: string }
): Promise<MetaInsightsResult> {
  const source = await loadForsightSource(db, args.orgId, "meta_ads");
  if (!source || source.type !== "meta_ads") {
    throw new ForsightSourceError({
      orgId: args.orgId,
      orgLabel: args.orgName,
      sourceType: "meta_ads",
      reason: "not_configured",
      detail: "This workspace has no Meta ad account on file.",
    });
  }

  return fetchMetaAdInsights({
    orgId: args.orgId,
    orgLabel: args.orgName,
    adAccountId: source.adAccountId,
    since: args.since,
    until: args.until,
  });
}
