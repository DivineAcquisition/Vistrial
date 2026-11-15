/**
 * Google Ads, read-only by practice (docs/rebuild/integrations-setup.md, section 1). Google offers no
 * read-only permission for Ads, so Vistrial only ever calls the two read methods: listAccessibleCustomers and
 * googleAds:search (GAQL). It never calls a mutate method. No developer token: Google retired them on
 * 2026-09-09, and access follows the Cloud project. For the chosen account it keeps, for the last 30 days,
 * campaign names, status and type, with spend, impressions, clicks, conversions and conversion value, by
 * campaign and by day. Pure: builds requests and condenses answers; the calls are in googleData.ts.
 */

import type { Choice } from "./analytics";

/**
 * The API version in the address. Google moves it forward a few times a year and retires old ones; the
 * deployment can set GOOGLE_ADS_API_VERSION to move it without a code change. That this default is current
 * is not verified; the first live test confirms it.
 */
export function adsVersion(env: Record<string, string | undefined> = process.env) {
  const value = env.GOOGLE_ADS_API_VERSION?.trim();
  return value && /^v\d{2}$/.test(value) ? value : "v22";
}

const base = () => `https://googleads.googleapis.com/${adsVersion()}`;

export const ADS = {
  customers: () => `${base()}/customers:listAccessibleCustomers`,
  search: (customerId: string) => `${base()}/customers/${customerId}/googleAds:search`,
  /** At most this many accounts are named on the chooser; each name is one small read. */
  accounts: 20,
  pages: 5,
  top: 10,
} as const;

/** A Google Ads customer id: digits only. */
export const isCustomerId = (id: string) => /^\d{6,12}$/.test(id);

/** The ids in a listAccessibleCustomers answer. */
export function customerIds(body: unknown) {
  const names = ((body as { resourceNames?: unknown[] } | null)?.resourceNames ?? []) as unknown[];
  return names
    .map((name) => (typeof name === "string" ? (/^customers\/(\d+)$/.exec(name)?.[1] ?? null) : null))
    .filter((id): id is string => !!id && isCustomerId(id))
    .slice(0, ADS.accounts);
}

/** The one query that names an account. */
export const ACCOUNT_QUERY = "SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code FROM customer LIMIT 1";

/** An account the chooser can offer, from its ACCOUNT_QUERY answer. Manager accounts have no ads of their own, so they are left out. */
export function accountChoice(id: string, body: unknown): Choice | null {
  const customer = ((body as { results?: { customer?: { descriptiveName?: unknown; manager?: unknown } }[] } | null)?.results ?? [])[0]?.customer;
  if (!customer || customer.manager === true) return null;
  const name = typeof customer.descriptiveName === "string" && customer.descriptiveName.trim() ? customer.descriptiveName.trim() : "Google Ads account";
  return { id, label: `${name} (${id.replace(/^(\d{3})(\d{3})(\d+)$/, "$1-$2-$3")})`.slice(0, 160) };
}

/** Campaign results by day for the last 30 days. Read fields only. */
export const CAMPAIGN_QUERY = [
  "SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date,",
  "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value",
  "FROM campaign WHERE segments.date DURING LAST_30_DAYS",
].join(" ");

type Result = {
  customer?: { currencyCode?: unknown };
  campaign?: { id?: unknown; name?: unknown; status?: unknown; advertisingChannelType?: unknown };
  segments?: { date?: unknown };
  metrics?: { costMicros?: unknown; impressions?: unknown; clicks?: unknown; conversions?: unknown; conversionsValue?: unknown };
};

/** One page's rows, and the token for the next page. */
export function searchPage(body: unknown): { rows: Result[]; next: string | null } {
  const value = body as { results?: Result[]; nextPageToken?: unknown } | null;
  return { rows: value?.results ?? [], next: typeof value?.nextPageToken === "string" && value.nextPageToken ? value.nextPageToken : null };
}

export type AdsCampaign = { id: string; name: string; status: string; type: string; spend: number; impressions: number; clicks: number; conversions: number; value: number };

export type AdsSnapshot = {
  currency: string;
  from: string;
  to: string;
  totals: { spend: number; impressions: number; clicks: number; conversions: number; value: number; campaigns: number; active: number };
  days: { date: string; spend: number; clicks: number; conversions: number }[];
  campaigns: AdsCampaign[];
  /** True when there were more pages than were read. */
  truncated: boolean;
};

// Google sends 64-bit numbers as strings.
const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (micros: unknown) => Math.round(num(micros) / 10_000) / 100;
const round = (value: number) => Math.round(value * 100) / 100;
const word = (value: unknown) => (typeof value === "string" ? value.replace(/_/g, " ").toLowerCase() : "unknown");

/** Condenses the rows: totals, by day, and the campaigns with the most spend. */
export function summarizeAds(rows: Result[], truncated: boolean): AdsSnapshot {
  const currency = rows.find((row) => typeof row.customer?.currencyCode === "string")?.customer?.currencyCode as string | undefined;
  const byCampaign = new Map<string, AdsCampaign>();
  const byDay = new Map<string, { date: string; spend: number; clicks: number; conversions: number }>();
  for (const row of rows) {
    const id = typeof row.campaign?.id === "string" || typeof row.campaign?.id === "number" ? String(row.campaign.id) : null;
    const date = typeof row.segments?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.segments.date) ? row.segments.date : null;
    if (!id || !date) continue;
    const spend = money(row.metrics?.costMicros);
    const clicks = num(row.metrics?.clicks);
    const conversions = num(row.metrics?.conversions);
    const campaign = byCampaign.get(id) ?? {
      id,
      name: (typeof row.campaign?.name === "string" ? row.campaign.name : "Campaign").replace(/\s+/g, " ").slice(0, 120),
      status: word(row.campaign?.status),
      type: word(row.campaign?.advertisingChannelType),
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      value: 0,
    };
    campaign.spend = round(campaign.spend + spend);
    campaign.impressions += num(row.metrics?.impressions);
    campaign.clicks += clicks;
    campaign.conversions = round(campaign.conversions + conversions);
    campaign.value = round(campaign.value + num(row.metrics?.conversionsValue));
    byCampaign.set(id, campaign);
    const day = byDay.get(date) ?? { date, spend: 0, clicks: 0, conversions: 0 };
    day.spend = round(day.spend + spend);
    day.clicks += clicks;
    day.conversions = round(day.conversions + conversions);
    byDay.set(date, day);
  }
  const campaigns = [...byCampaign.values()].sort((a, b) => b.spend - a.spend || b.clicks - a.clicks);
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sum = (key: "spend" | "impressions" | "clicks" | "conversions" | "value") => round(campaigns.reduce((total, row) => total + row[key], 0));
  return {
    currency: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    from: days[0]?.date ?? "",
    to: days.at(-1)?.date ?? "",
    totals: {
      spend: sum("spend"),
      impressions: sum("impressions"),
      clicks: sum("clicks"),
      conversions: sum("conversions"),
      value: sum("value"),
      campaigns: campaigns.length,
      active: campaigns.filter((row) => row.status === "enabled").length,
    },
    days,
    campaigns: campaigns.slice(0, ADS.top),
    truncated,
  };
}

export function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const n = (value: number) => value.toLocaleString("en-US");

export function adsLine(snapshot: AdsSnapshot) {
  if (!snapshot.campaigns.length) return "No campaign activity in the last 30 days.";
  const top = snapshot.campaigns[0];
  return `${fmtMoney(snapshot.totals.spend, snapshot.currency)} spent, ${n(snapshot.totals.clicks)} clicks and ${n(snapshot.totals.conversions)} conversions (value ${fmtMoney(snapshot.totals.value, snapshot.currency)}) from ${snapshot.from} to ${snapshot.to}, across ${snapshot.totals.campaigns} campaigns; most spend on ${top.name} (${fmtMoney(top.spend, snapshot.currency)}). As reported by Google Ads.`;
}
