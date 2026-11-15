/**
 * Google Business Profile, read-only by practice (docs/rebuild/integrations-setup.md, section 4). Google offers
 * no read-only permission, so Vistrial only makes read requests: the accounts and locations a person manages,
 * and for the chosen location the Performance API's daily metrics (views on Search and Maps, calls, direction
 * requests, website clicks) for 28 days, and last month's search keywords. It never edits the listing,
 * posts, or replies to reviews. These APIs answer only after Google approves the project's access, so a
 * refusal before then is shown as waiting for that approval. Pure: the calls are in googleData.ts.
 */

import type { Choice } from "./analytics";

export const PROFILE = {
  accounts: "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
  locations: (account: string) => `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title,storefrontAddress&pageSize=100`,
  daily: (location: string, query: string) => `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries?${query}`,
  keywords: (location: string, query: string) => `https://businessprofileperformance.googleapis.com/v1/${location}/searchkeywords/impressions/monthly?${query}`,
  accountsRead: 10,
  days: 28,
  top: 10,
} as const;

export const VIEW_METRICS = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"] as const;
export const ACTION_METRICS = ["CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "WEBSITE_CLICKS"] as const;

export const isAccountName = (value: string) => /^accounts\/\d+$/.test(value);
export const isLocationName = (value: string) => /^locations\/\d+$/.test(value);

export function accountNames(body: unknown) {
  const accounts = ((body as { accounts?: { name?: unknown }[] } | null)?.accounts ?? []) as { name?: unknown }[];
  return accounts
    .map((row) => (typeof row.name === "string" && isAccountName(row.name) ? row.name : null))
    .filter((name): name is string => !!name)
    .slice(0, PROFILE.accountsRead);
}

/** The locations in one account's answer, named by their title and town. */
export function locationChoices(body: unknown): Choice[] {
  const rows = ((body as { locations?: unknown[] } | null)?.locations ?? []) as { name?: unknown; title?: unknown; storefrontAddress?: { locality?: unknown } }[];
  return rows
    .filter((row) => typeof row.name === "string" && isLocationName(row.name))
    .map((row) => {
      const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Business listing";
      const town = typeof row.storefrontAddress?.locality === "string" && row.storefrontAddress.locality.trim() ? `, ${row.storefrontAddress.locality.trim()}` : "";
      return { id: row.name as string, label: `${title}${town}`.slice(0, 160) };
    });
}

const DAY = 86_400_000;
const parts = (at: number) => {
  const d = new Date(at);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
const iso = (p: { year: number; month: number; day: number }) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;

/** The two queries: 28 days of daily metrics ending yesterday, and last calendar month's search keywords. */
export function profileQueries(now: number) {
  const end = parts(now - DAY);
  const start = parts(now - PROFILE.days * DAY);
  const daily = new URLSearchParams();
  for (const metric of [...VIEW_METRICS, ...ACTION_METRICS]) daily.append("dailyMetrics", metric);
  daily.set("dailyRange.start_date.year", String(start.year));
  daily.set("dailyRange.start_date.month", String(start.month));
  daily.set("dailyRange.start_date.day", String(start.day));
  daily.set("dailyRange.end_date.year", String(end.year));
  daily.set("dailyRange.end_date.month", String(end.month));
  daily.set("dailyRange.end_date.day", String(end.day));
  const today = new Date(now);
  const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const month = { year: lastMonth.getUTCFullYear(), month: lastMonth.getUTCMonth() + 1 };
  const keywords = new URLSearchParams({
    "monthlyRange.start_month.year": String(month.year),
    "monthlyRange.start_month.month": String(month.month),
    "monthlyRange.end_month.year": String(month.year),
    "monthlyRange.end_month.month": String(month.month),
    pageSize: "100",
  });
  return { daily: daily.toString(), keywords: keywords.toString(), from: iso(start), to: iso(end), month: `${month.year}-${String(month.month).padStart(2, "0")}` };
}

export type ProfileSnapshot = {
  from: string;
  to: string;
  month: string;
  totals: { views: number; searchViews: number; mapsViews: number; calls: number; directions: number; websiteClicks: number };
  days: { date: string; views: number; actions: number }[];
  /** Search terms that showed the listing last month. A term with fewer than Google's threshold shows as "fewer than N". */
  keywords: { term: string; count: number | null; fewerThan: number | null }[];
};

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export function summarizeProfile(dailyBody: unknown, keywordsBody: unknown, range: { from: string; to: string; month: string }): ProfileSnapshot {
  const totals = { views: 0, searchViews: 0, mapsViews: 0, calls: 0, directions: 0, websiteClicks: 0 };
  const byDay = new Map<string, { date: string; views: number; actions: number }>();
  const groups = ((dailyBody as { multiDailyMetricTimeSeries?: unknown[] } | null)?.multiDailyMetricTimeSeries ?? []) as {
    dailyMetricTimeSeries?: { dailyMetric?: unknown; timeSeries?: { datedValues?: { date?: { year?: number; month?: number; day?: number }; value?: unknown }[] } }[];
  }[];
  for (const group of groups) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const metric = typeof series.dailyMetric === "string" ? series.dailyMetric : "";
      const isView = (VIEW_METRICS as readonly string[]).includes(metric);
      const isAction = (ACTION_METRICS as readonly string[]).includes(metric);
      if (!isView && !isAction) continue;
      for (const point of series.timeSeries?.datedValues ?? []) {
        const date = point.date?.year && point.date.month && point.date.day ? iso({ year: point.date.year, month: point.date.month, day: point.date.day }) : null;
        const value = num(point.value);
        if (!date || !value) continue;
        if (isView) {
          totals.views += value;
          if (metric.endsWith("_SEARCH")) totals.searchViews += value;
          else totals.mapsViews += value;
        }
        if (metric === "CALL_CLICKS") totals.calls += value;
        if (metric === "BUSINESS_DIRECTION_REQUESTS") totals.directions += value;
        if (metric === "WEBSITE_CLICKS") totals.websiteClicks += value;
        const day = byDay.get(date) ?? { date, views: 0, actions: 0 };
        if (isView) day.views += value;
        else day.actions += value;
        byDay.set(date, day);
      }
    }
  }
  const words = ((keywordsBody as { searchKeywordsCounts?: unknown[] } | null)?.searchKeywordsCounts ?? []) as { searchKeyword?: unknown; insightsValue?: { value?: unknown; threshold?: unknown } }[];
  const keywords = words
    .filter((row) => typeof row.searchKeyword === "string" && row.searchKeyword.trim())
    .map((row) => ({
      term: (row.searchKeyword as string).replace(/\s+/g, " ").trim().slice(0, 120),
      count: row.insightsValue?.value !== undefined ? num(row.insightsValue.value) : null,
      fewerThan: row.insightsValue?.value === undefined && row.insightsValue?.threshold !== undefined ? num(row.insightsValue.threshold) : null,
    }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, PROFILE.top);
  return { from: range.from, to: range.to, month: range.month, totals, days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)), keywords };
}

const n = (value: number) => value.toLocaleString("en-US");

export function profileLine(snapshot: ProfileSnapshot) {
  const t = snapshot.totals;
  if (!t.views && !t.calls && !t.directions && !t.websiteClicks) return `No views or actions on the listing from ${snapshot.from} to ${snapshot.to}.`;
  const top = snapshot.keywords[0];
  return `${n(t.views)} views (${n(t.searchViews)} on Search, ${n(t.mapsViews)} on Maps), ${n(t.calls)} calls, ${n(t.directions)} direction requests and ${n(t.websiteClicks)} website clicks from ${snapshot.from} to ${snapshot.to}${top ? `; top search term last month "${top.term}"` : ""}. As reported by Google Business Profile.`;
}
