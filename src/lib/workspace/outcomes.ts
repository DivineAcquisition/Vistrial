import { COMPARISON_MIN, METRICS } from "@/lib/metrics/definitions";
import type { Summary, WorkspaceFacts } from "@/lib/metrics/load";
import type { OutcomeMetricId } from "../../../convex/homeRules";

/**
 * The outcome strip. Every tile is built from metric ids already in the one
 * metric catalog; two tiles add two existing metrics together and say so in
 * their explanation. A tile the workspace does not track is left out, never
 * shown as zero.
 */

export type OutcomeDefinition = {
  id: OutcomeMetricId;
  label: string;
  explain: string;
  sources: string[];
  unit: "count" | "duration" | "money";
  measure: "count" | "median" | "sum";
  /** A count of right now, so it has no trend and no comparison. */
  now: boolean;
  lowerIsBetter: boolean;
  href: string;
};

function drill(metric: string): string {
  return `/app/results/leads?${new URLSearchParams({ metric, range: "last_7_days" }).toString()}`;
}

const DEFINITIONS: Record<OutcomeMetricId, Omit<OutcomeDefinition, "id">> = {
  first_touch_time: {
    label: "Speed to first response",
    explain: METRICS.first_touch_time.explain,
    sources: ["first_touch_time"],
    unit: "duration",
    measure: "median",
    now: false,
    lowerIsBetter: true,
    href: drill("first_touch_time"),
  },
  leads_waiting: {
    label: "Leads waiting for a reply",
    explain: `${METRICS.missed_now.explain} ${METRICS.at_risk_now.explain}`,
    sources: [],
    unit: "count",
    measure: "count",
    now: true,
    lowerIsBetter: true,
    href: drill("missed_now"),
  },
  bookings: {
    label: "Booked this week",
    explain: METRICS.bookings.explain,
    sources: ["bookings"],
    unit: "count",
    measure: "count",
    now: false,
    lowerIsBetter: false,
    href: drill("bookings"),
  },
  relay_approved: {
    label: "Follow-ups approved",
    explain: `${METRICS.relay_approved_unchanged.explain} Plus: ${METRICS.relay_edited.explain.charAt(0).toLowerCase()}${METRICS.relay_edited.explain.slice(1)}`,
    sources: ["relay_approved_unchanged", "relay_edited"],
    unit: "count",
    measure: "count",
    now: false,
    lowerIsBetter: false,
    href: drill("relay_approved_unchanged"),
  },
  new_leads: {
    label: "New leads",
    explain: METRICS.new_leads.explain,
    sources: ["new_leads"],
    unit: "count",
    measure: "count",
    now: false,
    lowerIsBetter: false,
    href: drill("new_leads"),
  },
  relay_sent: {
    label: "Follow-ups marked sent",
    explain: METRICS.relay_sent.explain,
    sources: ["relay_sent"],
    unit: "count",
    measure: "count",
    now: false,
    lowerIsBetter: false,
    href: drill("relay_sent"),
  },
  hot_open: {
    label: "Ready now",
    explain: METRICS.hot_open.explain,
    sources: ["hot_open"],
    unit: "count",
    measure: "count",
    now: true,
    lowerIsBetter: false,
    href: drill("hot_open"),
  },
  revenue: {
    label: "Revenue",
    explain: METRICS.revenue.explain,
    sources: ["revenue"],
    unit: "money",
    measure: "sum",
    now: false,
    lowerIsBetter: false,
    href: drill("revenue"),
  },
};

function tracked(id: OutcomeMetricId, facts: WorkspaceFacts | null): boolean {
  if (!facts) return false;
  switch (id) {
    case "first_touch_time":
    case "leads_waiting":
      return facts.has_response;
    case "bookings":
      return facts.has_bookings;
    case "relay_approved":
    case "relay_sent":
      return facts.has_relay;
    case "new_leads":
      return facts.has_leads;
    case "hot_open":
      return facts.has_bands;
    case "revenue":
      return facts.has_revenue && facts.can_see_money;
  }
}

/** What this person may pick and see. Operators never get revenue or workspace tiles. */
export function outcomeCatalog(input: { facts: WorkspaceFacts | null; canSeeMoney: boolean; operator: boolean }): Map<OutcomeMetricId, OutcomeDefinition> {
  const out = new Map<OutcomeMetricId, OutcomeDefinition>();
  if (input.operator) return out;
  for (const [id, definition] of Object.entries(DEFINITIONS) as Array<[OutcomeMetricId, Omit<OutcomeDefinition, "id">]>) {
    if (id === "revenue" && !input.canSeeMoney) continue;
    if (!tracked(id, input.facts)) continue;
    out.set(id, { id, ...definition });
  }
  return out;
}

export function outcomeChoices(canSeeMoney: boolean): Array<{ id: OutcomeMetricId; label: string }> {
  return (Object.entries(DEFINITIONS) as Array<[OutcomeMetricId, Omit<OutcomeDefinition, "id">]>)
    .filter(([id]) => id !== "revenue" || canSeeMoney)
    .map(([id, definition]) => ({ id, label: definition.label }));
}

export type OutcomeTile = {
  id: OutcomeMetricId;
  label: string;
  explain: string;
  href: string;
  unit: OutcomeDefinition["unit"];
  value: number | null;
  /** Seven daily values, oldest first. Null for "right now" tiles. */
  trend: Array<number | null> | null;
  change: { previous: number; better: boolean } | null;
  /** Shown when the sample is too small to compare. */
  compareNote: string | null;
};

function pick(summary: Summary, definition: OutcomeDefinition, side: "current" | "previous"): { value: number | null; rows: number } {
  let total = 0;
  let rows = 0;
  let any = false;
  for (const source of definition.sources) {
    const entry = summary[source];
    if (!entry || entry.hidden) return { value: null, rows: 0 };
    const aggregate = side === "current" ? entry.current : entry.previous;
    if (!aggregate) return { value: null, rows: 0 };
    any = true;
    rows += aggregate.count;
    if (definition.measure === "median") {
      if (aggregate.median === null) return { value: null, rows };
      total = aggregate.median;
    } else if (definition.measure === "sum") {
      total += aggregate.sum ?? 0;
    } else {
      total += aggregate.count;
    }
  }
  return { value: any ? total : null, rows };
}

export function outcomeValue(
  definition: OutcomeDefinition,
  data: { week: Summary; live: Summary; daily: Summary[] }
): OutcomeTile | null {
  const base = { id: definition.id, label: definition.label, explain: definition.explain, href: definition.href, unit: definition.unit };
  if (definition.id === "leads_waiting") {
    const missed = data.live.missed_now;
    const atRisk = data.live.at_risk_now;
    if (!missed || missed.hidden || !atRisk || atRisk.hidden) return null;
    return { ...base, value: missed.current.count + atRisk.current.count, trend: null, change: null, compareNote: null };
  }
  const current = pick(data.week, definition, "current");
  if (current.value === null) return null;
  const trend = definition.now ? null : data.daily.map((day) => pick(day, definition, "current").value);
  const previous = definition.now ? { value: null, rows: 0 } : pick(data.week, definition, "previous");
  const comparable = previous.value !== null && current.rows >= COMPARISON_MIN && previous.rows >= COMPARISON_MIN;
  return {
    ...base,
    value: current.value,
    trend,
    change: comparable
      ? { previous: previous.value!, better: definition.lowerIsBetter ? current.value < previous.value! : current.value > previous.value! }
      : null,
    compareNote: definition.now || comparable ? null : "Not enough data to compare yet.",
  };
}

/** An Operator's own numbers, through the Compass self-scope (leads assigned to them only). */
export const OPERATOR_NUMBERS = [
  { id: "new_leads", label: "New leads assigned to you", unit: "count" as const },
  { id: "first_touch_time", label: "Your speed to first response", unit: "duration" as const },
  { id: "bookings", label: "Bookings from your leads", unit: "count" as const },
];
