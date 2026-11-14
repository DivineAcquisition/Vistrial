/**
 * Google Analytics 4, read-only (docs/rebuild/integrations-setup.md, section 2): the properties a person can
 * open, from the Admin API's account summaries, and for the chosen one the totals Vistrial keeps: sessions,
 * users and key events by day, and the top sources, landing pages and key events, over the last 28 days.
 * Totals only, never a visitor. Pure: builds requests and condenses answers; the calls are in googleData.ts.
 */

export const ANALYTICS = {
  summaries: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
  report: (property: string) => `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`,
  days: 28,
  top: 10,
} as const;

export type Choice = { id: string; label: string };

/** The properties in an accountSummaries answer, as "Account · Property". Only `properties/<number>` ids. */
export function analyticsChoices(body: unknown): Choice[] {
  const accounts = ((body as { accountSummaries?: unknown[] } | null)?.accountSummaries ?? []) as {
    displayName?: unknown;
    propertySummaries?: { property?: unknown; displayName?: unknown }[];
  }[];
  const out: Choice[] = [];
  for (const account of accounts) {
    for (const row of account.propertySummaries ?? []) {
      if (typeof row.property !== "string" || !/^properties\/\d+$/.test(row.property)) continue;
      const name = typeof row.displayName === "string" && row.displayName.trim() ? row.displayName.trim() : row.property;
      const parent = typeof account.displayName === "string" && account.displayName.trim() ? `${account.displayName.trim()} · ` : "";
      out.push({ id: row.property, label: `${parent}${name}`.slice(0, 160) });
    }
  }
  return out.slice(0, 200);
}

const RANGE = [{ startDate: `${ANALYTICS.days}daysAgo`, endDate: "yesterday" }];

/** The four reports, each its own runReport body. */
export function analyticsRequests() {
  return {
    days: {
      dateRanges: RANGE,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 100,
    },
    sources: {
      dateRanges: RANGE,
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: ANALYTICS.top,
    },
    pages: {
      dateRanges: RANGE,
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: ANALYTICS.top,
    },
    events: { dateRanges: RANGE, dimensions: [{ name: "eventName" }], metrics: [{ name: "keyEvents" }], orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }], limit: ANALYTICS.top },
  } as const;
}

type Row = { dims: string[]; values: number[] };

/** A runReport answer's rows as plain strings and numbers. */
export function reportRows(body: unknown): Row[] {
  const rows = ((body as { rows?: unknown[] } | null)?.rows ?? []) as { dimensionValues?: { value?: unknown }[]; metricValues?: { value?: unknown }[] }[];
  return rows.map((row) => ({
    dims: (row.dimensionValues ?? []).map((cell) => (typeof cell.value === "string" ? cell.value : "")),
    values: (row.metricValues ?? []).map((cell) => {
      const n = Number(cell.value);
      return Number.isFinite(n) ? n : 0;
    }),
  }));
}

export type AnalyticsSnapshot = {
  from: string;
  to: string;
  totals: { sessions: number; users: number; keyEvents: number };
  days: { date: string; sessions: number; users: number; keyEvents: number }[];
  sources: { name: string; sessions: number; keyEvents: number }[];
  pages: { path: string; sessions: number; keyEvents: number }[];
  events: { name: string; count: number }[];
};

const clip = (text: string, max = 160) => text.replace(/\s+/g, " ").trim().slice(0, max);
/** GA4 dates come as YYYYMMDD. */
const isoDate = (value: string) => (/^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value);

/**
 * Condenses the four answers. Users summed over days overcount people who came back on several days, so the
 * total users figure is labelled "daily users added up" where it is shown.
 */
export function summarizeAnalytics(answers: { days: unknown; sources: unknown; pages: unknown; events: unknown }): AnalyticsSnapshot {
  const days = reportRows(answers.days)
    .map((row) => ({ date: isoDate(row.dims[0] ?? ""), sessions: row.values[0] ?? 0, users: row.values[1] ?? 0, keyEvents: row.values[2] ?? 0 }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sum = (key: "sessions" | "users" | "keyEvents") => days.reduce((total, row) => total + row[key], 0);
  return {
    from: days[0]?.date ?? "",
    to: days.at(-1)?.date ?? "",
    totals: { sessions: sum("sessions"), users: sum("users"), keyEvents: sum("keyEvents") },
    days,
    sources: reportRows(answers.sources)
      .map((row) => ({ name: clip(row.dims[0] || "(not set)"), sessions: row.values[0] ?? 0, keyEvents: row.values[1] ?? 0 }))
      .slice(0, ANALYTICS.top),
    pages: reportRows(answers.pages)
      .map((row) => ({ path: clip(row.dims[0] || "(not set)", 200), sessions: row.values[0] ?? 0, keyEvents: row.values[1] ?? 0 }))
      .slice(0, ANALYTICS.top),
    events: reportRows(answers.events)
      .map((row) => ({ name: clip(row.dims[0] || "(not set)", 80), count: row.values[0] ?? 0 }))
      .filter((row) => row.count > 0)
      .slice(0, ANALYTICS.top),
  };
}

const n = (value: number) => value.toLocaleString("en-US");

/** One line for research and the card: the period and its totals. */
export function analyticsLine(snapshot: AnalyticsSnapshot) {
  if (!snapshot.days.length) return "No visits recorded in the last 28 days.";
  const top = snapshot.sources[0];
  return `${n(snapshot.totals.sessions)} sessions and ${n(snapshot.totals.keyEvents)} key events from ${snapshot.from} to ${snapshot.to}${top ? `; most sessions from ${top.name} (${n(top.sessions)})` : ""}. As reported by Google Analytics.`;
}
