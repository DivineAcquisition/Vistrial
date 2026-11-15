/**
 * Search Console, read-only (docs/rebuild/integrations-setup.md, section 3): the sites a person can open, and
 * for the chosen one Search Analytics only: clicks, impressions, click rate and average position by day, and
 * the top queries and pages, over 28 days ending three days ago (Search Console's data arrives 2 to 3 days
 * late). Totals and the top rows only, as Google returns them. Pure: the calls are in googleData.ts.
 */

import type { Choice } from "./analytics";

export const SEARCH = {
  sites: "https://www.googleapis.com/webmasters/v3/sites",
  query: (site: string) => `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
  days: 28,
  lagDays: 3,
  top: 10,
} as const;

const DAY = 86_400_000;
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);

/** A site the person can read: a URL-prefix property or a domain property. Never an unverified one. */
export function isSiteId(id: string) {
  return /^sc-domain:[a-z0-9.-]+$/i.test(id) || /^https?:\/\/[^\s]+\/$/.test(id);
}

export function searchChoices(body: unknown): Choice[] {
  const rows = ((body as { siteEntry?: unknown[] } | null)?.siteEntry ?? []) as { siteUrl?: unknown; permissionLevel?: unknown }[];
  return rows
    .filter((row) => typeof row.siteUrl === "string" && isSiteId(row.siteUrl) && row.permissionLevel !== "siteUnverifiedUser")
    .map((row) => ({ id: row.siteUrl as string, label: (row.siteUrl as string).replace(/^sc-domain:/, "").slice(0, 160) }))
    .slice(0, 200);
}

/** The three queries, for 28 days ending three days before `now`. */
export function searchRequests(now: number) {
  const end = now - SEARCH.lagDays * DAY;
  const range = { startDate: iso(end - (SEARCH.days - 1) * DAY), endDate: iso(end) };
  return {
    days: { ...range, dimensions: ["date"], rowLimit: 100 },
    queries: { ...range, dimensions: ["query"], rowLimit: SEARCH.top },
    pages: { ...range, dimensions: ["page"], rowLimit: SEARCH.top },
  };
}

type Row = { key: string; clicks: number; impressions: number; position: number };

function rows(body: unknown): Row[] {
  const list = ((body as { rows?: unknown[] } | null)?.rows ?? []) as { keys?: unknown[]; clicks?: unknown; impressions?: unknown; position?: unknown }[];
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return list.map((row) => ({ key: typeof row.keys?.[0] === "string" ? (row.keys[0] as string) : "", clicks: num(row.clicks), impressions: num(row.impressions), position: num(row.position) }));
}

export type SearchRow = { name: string; clicks: number; impressions: number; ctr: number | null; position: number | null };

export type SearchSnapshot = {
  from: string;
  to: string;
  totals: { clicks: number; impressions: number; ctr: number | null; position: number | null };
  days: { date: string; clicks: number; impressions: number }[];
  queries: SearchRow[];
  pages: SearchRow[];
};

const clip = (text: string, max = 200) => text.replace(/\s+/g, " ").trim().slice(0, max);
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function asRow(row: Row): SearchRow {
  return {
    name: clip(row.key || "(not set)"),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions ? round(row.clicks / row.impressions, 4) : null,
    position: row.impressions ? round(row.position, 1) : null,
  };
}

/** Condenses the answers. Average position over the period is weighted by each day's impressions. */
export function summarizeSearch(answers: { days: unknown; queries: unknown; pages: unknown }, range: { startDate: string; endDate: string }): SearchSnapshot {
  const days = rows(answers.days)
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  const clicks = days.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = days.reduce((sum, row) => sum + row.impressions, 0);
  const weighted = days.reduce((sum, row) => sum + row.position * row.impressions, 0);
  return {
    from: range.startDate,
    to: range.endDate,
    totals: { clicks, impressions, ctr: impressions ? round(clicks / impressions, 4) : null, position: impressions ? round(weighted / impressions, 1) : null },
    days: days.map((row) => ({ date: row.key, clicks: row.clicks, impressions: row.impressions })),
    queries: rows(answers.queries).map(asRow).slice(0, SEARCH.top),
    pages: rows(answers.pages).map(asRow).slice(0, SEARCH.top),
  };
}

const n = (value: number) => value.toLocaleString("en-US");
export const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

export function searchLine(snapshot: SearchSnapshot) {
  if (!snapshot.totals.impressions) return `No search impressions from ${snapshot.from} to ${snapshot.to}.`;
  const top = snapshot.queries[0];
  return `${n(snapshot.totals.clicks)} clicks from ${n(snapshot.totals.impressions)} impressions (click rate ${pct(snapshot.totals.ctr)}, average position ${snapshot.totals.position ?? "n/a"}) from ${snapshot.from} to ${snapshot.to}${top ? `; top query "${top.name}" (${n(top.clicks)} clicks)` : ""}. As reported by Search Console.`;
}
