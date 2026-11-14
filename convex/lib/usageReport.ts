/**
 * The usage page's arithmetic, kept free of the database so it can be tested on its own. Every amount in
 * and out is credits (1 credit = 1 cent of balance). docs/rebuild/usage-page.md, sections 5 and 6.
 */

export const PERIODS = ["7d", "30d", "month", "90d"] as const;
export type Period = (typeof PERIODS)[number];

export const DIMENSIONS = ["skill", "agent", "client", "model", "person", "organization"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** One rollup row as the report reads it: a piece of work's credits on one day on one model. */
export type UsageRow = {
  workspaceId: string;
  source: "run" | "followup" | "intake" | "file" | "creative" | "page";
  ref: string;
  day: string;
  model: string;
  priceCents: number;
  firstAt: number;
  lastAt: number;
  startedBy?: string;
  agentSlug?: string;
  skillSlug?: string;
  clientId?: string;
  title?: string;
};

export type Filters = Partial<Record<Dimension, string>>;

/** The key a row has in one breakdown. Rows with nothing to say there fall in one "none" bucket. */
export const NONE = "none";
export function keyOf(row: UsageRow, dimension: Dimension): string {
  switch (dimension) {
    case "skill":
      return row.skillSlug ?? NONE;
    case "agent":
      return row.agentSlug ?? NONE;
    case "client":
      return row.clientId ?? NONE;
    case "model":
      return row.model || NONE;
    case "person":
      return row.startedBy ?? NONE;
    case "organization":
      return row.workspaceId;
  }
}

export function matches(row: UsageRow, filters: Filters, except?: Dimension): boolean {
  for (const dimension of DIMENSIONS) {
    if (dimension === except) continue;
    const wanted = filters[dimension];
    if (wanted !== undefined && wanted !== "" && keyOf(row, dimension) !== wanted) return false;
  }
  return true;
}

const DAY_MS = 86_400_000;

export function dayOf(at: number) {
  return new Date(at).toISOString().slice(0, 10);
}

/** The days a period covers, oldest first, ending today (UTC). "month" starts on the plan's reset day when known. */
export function periodDays(period: Period, now: number, monthStart?: number | null): string[] {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  let count: number;
  if (period === "7d") count = 7;
  else if (period === "30d") count = 30;
  else if (period === "90d") count = 90;
  else {
    const start = monthStart && monthStart <= now ? monthStart : Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
    const startDay = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate());
    count = Math.max(1, Math.round((today - startDay) / DAY_MS) + 1);
  }
  return Array.from({ length: count }, (_, index) => dayOf(today - (count - 1 - index) * DAY_MS));
}

export type Slice = { key: string; credits: number; share: number; items: number };

/** Credits per key of one breakdown, largest first, with each one's share of the total and how many pieces of work. */
export function breakdown(rows: UsageRow[], dimension: Dimension): Slice[] {
  const credits = new Map<string, number>();
  const work = new Map<string, Set<string>>();
  let total = 0;
  for (const row of rows) {
    const key = keyOf(row, dimension);
    credits.set(key, (credits.get(key) ?? 0) + row.priceCents);
    if (!work.has(key)) work.set(key, new Set());
    work.get(key)!.add(`${row.source}:${row.ref}`);
    total += row.priceCents;
  }
  return [...credits.entries()]
    .map(([key, value]) => ({ key, credits: value, share: total > 0 ? value / total : 0, items: work.get(key)?.size ?? 0 }))
    .sort((a, b) => b.credits - a.credits || a.key.localeCompare(b.key));
}

export type DailyBar = { day: string; total: number; parts: { key: string; credits: number }[] };

/** One bar per day of the period, split by agent, in the same agent order every day. Empty days are zero, not missing. */
export function daily(rows: UsageRow[], days: string[], stackBy: Dimension = "agent"): { bars: DailyBar[]; keys: string[] } {
  const keys = breakdown(rows, stackBy).map((slice) => slice.key);
  const byDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!byDay.has(row.day)) byDay.set(row.day, new Map());
    const day = byDay.get(row.day)!;
    const key = keyOf(row, stackBy);
    day.set(key, (day.get(key) ?? 0) + row.priceCents);
  }
  const bars = days.map((day) => {
    const parts = keys.map((key) => ({ key, credits: byDay.get(day)?.get(key) ?? 0 })).filter((part) => part.credits > 0);
    return { day, total: parts.reduce((sum, part) => sum + part.credits, 0), parts };
  });
  return { bars, keys };
}

export type WorkItem = {
  source: UsageRow["source"];
  ref: string;
  workspaceId: string;
  title?: string;
  startedBy?: string;
  agentSlug?: string;
  skillSlug?: string;
  clientId?: string;
  models: string[];
  credits: number;
  firstAt: number;
  lastAt: number;
};

/** The rows folded per piece of work (a run across its days and models), newest first. */
export function workItems(rows: UsageRow[]): WorkItem[] {
  const items = new Map<string, WorkItem>();
  for (const row of rows) {
    const key = `${row.workspaceId}:${row.source}:${row.ref}`;
    const item = items.get(key);
    if (!item) {
      items.set(key, {
        source: row.source,
        ref: row.ref,
        workspaceId: row.workspaceId,
        title: row.title,
        startedBy: row.startedBy,
        agentSlug: row.agentSlug,
        skillSlug: row.skillSlug,
        clientId: row.clientId,
        models: row.model ? [row.model] : [],
        credits: row.priceCents,
        firstAt: row.firstAt,
        lastAt: row.lastAt,
      });
      continue;
    }
    item.credits += row.priceCents;
    item.firstAt = Math.min(item.firstAt, row.firstAt);
    item.lastAt = Math.max(item.lastAt, row.lastAt);
    if (row.model && !item.models.includes(row.model)) item.models.push(row.model);
    item.title ??= row.title;
  }
  // Newest first; work charged in the same millisecond goes larger first, so the order never depends on the read.
  return [...items.values()].sort((a, b) => b.lastAt - a.lastAt || b.credits - a.credits || a.ref.localeCompare(b.ref));
}

/** The value below which `share` of the sorted numbers fall, read between neighbours. */
export function quantile(sorted: number[], share: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * share;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

export type Typical = { key: string; source: UsageRow["source"]; count: number; low: number; median: number; high: number };

/** The fewest pieces of work a typical range is stated from. Fewer is "not enough yet". */
export const TYPICAL_MIN = 3;

/**
 * What each kind of work typically uses, from this account's own pieces of work: the middle half (25th to
 * 75th percentile) and the median, in whole credits. Runs are grouped by skill; chats, follow-ups, images,
 * file and page reads each by their kind, so a short chat never pulls down what a research run uses.
 */
export function typicalUse(rows: UsageRow[]): Typical[] {
  const groups = new Map<string, { source: UsageRow["source"]; credits: number[] }>();
  for (const item of workItems(rows)) {
    const key = item.source === "run" && item.skillSlug ? item.skillSlug : `source:${item.source}`;
    if (!groups.has(key)) groups.set(key, { source: item.source, credits: [] });
    groups.get(key)!.credits.push(item.credits);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const sorted = [...group.credits].sort((a, b) => a - b);
      return { key, source: group.source, count: sorted.length, low: Math.round(quantile(sorted, 0.25)), median: Math.round(quantile(sorted, 0.5)), high: Math.round(quantile(sorted, 0.75)) };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export type Forecast = { kind: "until"; at: number } | { kind: "pastReset" } | { kind: "none" };

/**
 * When the balance runs out at the pace of the last 14 days. "pastReset" when it lasts beyond the next reset,
 * "none" when nothing was used to measure a pace by or the balance is already empty.
 */
export function forecast(args: { balance: number; usedLast14Days: number; now: number; resetAt: number | null }): Forecast {
  const perDay = args.usedLast14Days / 14;
  if (perDay <= 0 || args.balance <= 0) return { kind: "none" };
  const at = args.now + (args.balance / perDay) * DAY_MS;
  if (args.resetAt && at >= args.resetAt) return { kind: "pastReset" };
  return { kind: "until", at };
}
