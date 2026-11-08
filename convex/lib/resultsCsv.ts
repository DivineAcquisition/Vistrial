/**
 * Reads a results file a business exports from its own tools (ad platforms, CRM, email, booking) and keeps
 * only totals: sums per campaign or channel, and the dates covered. No row is kept, no customer is kept.
 * Columns that hold personal data are ignored by name and never read; a file that looks like a customer
 * list instead of results is refused. Pure: no database, no network.
 */

export const MAX_ROWS = 50_000;
export const MAX_BYTES = 5 * 1024 * 1024;
/** The largest campaigns or channels kept, by spend (or by conversions when there is no spend). */
export const MAX_GROUPS = 20;
const MAX_NAME = 120;

export const METRICS = ["spend", "impressions", "clicks", "conversions", "revenue"] as const;
export type Metric = (typeof METRICS)[number];
export type Figures = Partial<Record<Metric, number>>;

export type ResultsSummary = {
  rows: number;
  dateStart: string | null;
  dateStop: string | null;
  /** The metrics the file has, in a fixed order. */
  metrics: Metric[];
  totals: Figures;
  /** The header the groups come from ("Campaign name"), or null when the file has no such column. */
  groupBy: string | null;
  groups: ({ name: string } & Figures)[];
  /** Groups beyond MAX_GROUPS, folded into the totals but not listed. */
  otherGroups: number;
  /** Header names of personal-data columns that were ignored. Names only, never a value. */
  ignoredColumns: string[];
};

export type ResultsRefusal =
  | "empty"
  | "too_many_rows"
  | "personal_data"
  | "no_metrics";

export type ResultsOutcome = { ok: true; summary: ResultsSummary } | { ok: false; code: ResultsRefusal; ignoredColumns: string[] };

/** Lower-case words only, so "Amount spent (USD)" and "amount_spent_usd" read the same. */
export function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(usd|eur|gbp|cad|aud)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<Metric | "date" | "group", string[]> = {
  date: ["date", "day", "week", "month", "reporting starts", "reporting start", "date start", "start date", "period"],
  group: ["campaign", "campaign name", "ad set", "ad set name", "ad group", "ad group name", "channel", "source", "source medium", "medium", "ad name"],
  spend: ["spend", "cost", "amount spent", "ad spend", "total spend", "spent", "media cost"],
  impressions: ["impressions", "impr", "impressions total"],
  clicks: ["clicks", "link clicks", "clicks all", "total clicks"],
  conversions: ["conversions", "results", "leads", "purchases", "sales", "bookings", "orders", "sign ups", "signups", "appointments", "jobs booked"],
  revenue: ["revenue", "conversion value", "conv value", "all conv value", "sales value", "purchase value", "purchases conversion value", "total revenue", "value", "income"],
};

/** Headers that name a person or how to reach them. The column is skipped, unread. */
const PERSONAL = [
  /\be ?mail\b/,
  /\bphone\b/,
  /\bmobile\b/,
  /\bcell\b/,
  /^(first|last|full|given|family) name$/,
  /^name$/,
  /^(customer|client|contact|lead|patient|guest)( name)?$/,
  /\baddress\b/,
  /\bstreet\b/,
  /^(zip|zip code|postcode|postal code)$/,
  /^ip( address)?$/,
  /\b(dob|birth ?date|date of birth|birthday)\b/,
  /\bssn\b/,
];

export function isPersonalHeader(header: string) {
  const name = normalizeHeader(header);
  return PERSONAL.some((pattern) => pattern.test(name));
}

/** "$1,234.50" → 1234.5. Blank, "-", "n/a" and anything unreadable → null. Percentages are not read. */
export function readNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  if (!text || text.endsWith("%")) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const digits = text.replace(/[^0-9.]/g, "");
  if (!digits || digits === "." || (digits.match(/\./g) ?? []).length > 1) return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** A day as YYYY-MM-DD, or null. Month-only values ("2026-10") read as the first of the month. */
export function readDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(text);
  if (monthOnly) return `${monthOnly[1]}-${monthOnly[2]}-01`;
  const time = Date.parse(text);
  if (Number.isNaN(time)) return null;
  const day = new Date(time);
  const year = day.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return day.toISOString().slice(0, 10);
}

function findColumn(headers: string[], aliases: string[], taken: Set<string>) {
  for (const alias of aliases) {
    const hit = headers.find((header) => !taken.has(header) && normalizeHeader(header) === alias);
    if (hit) return hit;
  }
  return null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Summarizes parsed rows (header row already taken as keys). */
export function summarizeResults(headers: string[], rows: Record<string, string | undefined>[]): ResultsOutcome {
  const ignoredColumns = headers.filter(isPersonalHeader);
  const usable = headers.filter((header) => !isPersonalHeader(header));
  if (rows.length === 0) return { ok: false, code: "empty", ignoredColumns };
  if (rows.length > MAX_ROWS) return { ok: false, code: "too_many_rows", ignoredColumns };

  const taken = new Set<string>();
  const columns: Partial<Record<Metric, string>> = {};
  for (const metric of METRICS) {
    const column = findColumn(usable, ALIASES[metric], taken);
    if (column) {
      columns[metric] = column;
      taken.add(column);
    }
  }
  const metrics = METRICS.filter((metric) => columns[metric]);
  if (metrics.length === 0) {
    // Contact details and nothing to count: a customer list, not results.
    return { ok: false, code: ignoredColumns.length > 0 ? "personal_data" : "no_metrics", ignoredColumns };
  }
  const dateColumn = findColumn(usable, ALIASES.date, taken);
  if (dateColumn) taken.add(dateColumn);
  const groupColumn = findColumn(usable, ALIASES.group, taken);

  const totals: Figures = {};
  const groups = new Map<string, Figures>();
  let dateStart: string | null = null;
  let dateStop: string | null = null;
  for (const row of rows) {
    const day = dateColumn ? readDay(row[dateColumn]) : null;
    if (day) {
      if (!dateStart || day < dateStart) dateStart = day;
      if (!dateStop || day > dateStop) dateStop = day;
    }
    const name = groupColumn ? (row[groupColumn] ?? "").trim().slice(0, MAX_NAME) : "";
    const group = groupColumn && name ? (groups.get(name) ?? {}) : null;
    for (const metric of metrics) {
      const value = readNumber(row[columns[metric]!]);
      if (value === null) continue;
      totals[metric] = (totals[metric] ?? 0) + value;
      if (group) group[metric] = (group[metric] ?? 0) + value;
    }
    if (group && groupColumn && name) groups.set(name, group);
  }

  const rank: Metric = metrics.includes("spend") ? "spend" : metrics.includes("conversions") ? "conversions" : metrics[0];
  const ranked = [...groups.entries()].sort(([, a], [, b]) => (b[rank] ?? 0) - (a[rank] ?? 0));
  const kept = ranked.slice(0, MAX_GROUPS).map(([name, figures]) => {
    const rounded: Figures = {};
    for (const metric of metrics) if (figures[metric] !== undefined) rounded[metric] = round(figures[metric]!);
    return { name, ...rounded };
  });
  const roundedTotals: Figures = {};
  for (const metric of metrics) if (totals[metric] !== undefined) roundedTotals[metric] = round(totals[metric]!);

  return {
    ok: true,
    summary: {
      rows: rows.length,
      dateStart,
      dateStop,
      metrics,
      totals: roundedTotals,
      groupBy: groupColumn,
      groups: kept,
      otherGroups: Math.max(0, ranked.length - MAX_GROUPS),
      ignoredColumns,
    },
  };
}
