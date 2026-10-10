import type { BreakdownDimension, BreakdownRow, WorkspaceFacts } from "@/lib/metrics/load";
import { metricDefinition, type MetricId, type ShareId } from "@/lib/metrics/definitions";

/**
 * What Results shows, in order. Each section appears only when the workspace
 * has the data behind it, so nothing reads as a zero it never tracked. The
 * export writes the same sections.
 */

type FactFlag = {
  [K in keyof WorkspaceFacts]: WorkspaceFacts[K] extends boolean ? K : never;
}[keyof WorkspaceFacts];

export type SectionCard = { metric: MetricId } | { share: ShareId };

export type SectionBreakdown = {
  metric: MetricId;
  dimension: BreakdownDimension;
  title: string;
  /** Per-person rows: owners and the Vistrial team only. */
  people?: boolean;
  /** Only for ranges up to this many days, so a day list stays readable. */
  maxDays?: number;
  needs?: FactFlag;
};

export type ResultsSection = {
  id: string;
  title: string;
  hint: string;
  fact: FactFlag;
  money?: boolean;
  cards: SectionCard[];
  breakdowns: SectionBreakdown[];
};

export const RESULTS_SECTIONS: ResultsSection[] = [
  {
    id: "leads",
    title: "Leads",
    hint: "New leads in the range, where they came from, and who has them.",
    fact: "has_leads",
    cards: [{ metric: "new_leads" }, { metric: "open_leads" }],
    breakdowns: [
      { metric: "new_leads", dimension: "source", title: "New leads by source" },
      { metric: "new_leads", dimension: "day", title: "New leads by day", maxDays: 31 },
      { metric: "new_leads", dimension: "person", title: "New leads by person", people: true },
    ],
  },
  {
    id: "speed",
    title: "Speed to lead",
    hint: "How fast new leads heard from a person, measured against your response window.",
    fact: "has_response",
    cards: [
      { share: "response_rate" },
      { metric: "first_touch_time" },
      { metric: "response_late" },
      { share: "follow_up_rate" },
    ],
    breakdowns: [
      { metric: "first_touch_time", dimension: "person", title: "Typical first response by person", people: true },
      { metric: "response_late", dimension: "source", title: "Late or missed by source" },
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    hint: "How leads moved between stages in the range.",
    fact: "has_stage_changes",
    cards: [{ metric: "stage_moves" }],
    breakdowns: [
      { metric: "stage_moves", dimension: "detail", title: "Most common moves" },
      { metric: "open_leads", dimension: "detail", title: "Open leads by stage right now" },
    ],
  },
  {
    id: "readiness",
    title: "Readiness",
    hint: "Where case files sit in your readiness bands, and how they moved.",
    fact: "has_bands",
    cards: [{ metric: "hot_open" }, { metric: "band_moves" }],
    breakdowns: [
      { metric: "open_leads", dimension: "band", title: "Open leads by band right now" },
      { metric: "band_moves", dimension: "detail", title: "Band changes" },
    ],
  },
  {
    id: "calls",
    title: "Calls booked",
    hint: "Calls booked in the range, counted on the day they were booked.",
    fact: "has_bookings",
    cards: [{ metric: "bookings" }],
    breakdowns: [
      { metric: "bookings", dimension: "source", title: "Calls booked by source" },
      { metric: "bookings", dimension: "person", title: "Calls booked by person", people: true },
    ],
  },
  {
    id: "objections",
    title: "Objections",
    hint: "What leads raised on calls in the range.",
    fact: "has_objections",
    cards: [{ metric: "objections" }],
    breakdowns: [{ metric: "objections", dimension: "detail", title: "Objections by type" }],
  },
  {
    id: "sentry",
    title: "Sentry",
    hint: "Response and follow-up clocks, and the alerts they raised.",
    fact: "has_alerts",
    cards: [
      { metric: "alerts_raised" },
      { metric: "alerts_acknowledged" },
      { metric: "alerts_open_now" },
      { metric: "follow_ups_watched" },
    ],
    breakdowns: [{ metric: "alerts_raised", dimension: "detail", title: "Alerts by kind" }],
  },
  {
    id: "relay",
    title: "Relay",
    hint: "Messages Relay drafted and what people did with them. Every draft waits for a person.",
    fact: "has_relay",
    cards: [
      { metric: "relay_prepared" },
      { share: "approved_unchanged_rate" },
      { metric: "relay_edited" },
      { metric: "relay_rejected" },
      { metric: "relay_sent" },
    ],
    breakdowns: [],
  },
  {
    id: "scribe",
    title: "Scribe",
    hint: "Case files built and kept up to date.",
    fact: "has_case_files",
    cards: [{ metric: "scribe_updated" }, { metric: "scribe_review" }],
    breakdowns: [],
  },
  {
    id: "revenue",
    title: "Revenue",
    hint: "Sales your payment source reported, less refunds and chargebacks.",
    fact: "has_revenue",
    money: true,
    cards: [{ metric: "revenue" }],
    breakdowns: [
      { metric: "revenue", dimension: "source", title: "Revenue by lead source" },
      { metric: "revenue", dimension: "detail", title: "Revenue by kind", needs: "has_typed_revenue" },
      { metric: "revenue", dimension: "person", title: "Revenue by person", people: true },
    ],
  },
];

export function sectionsFor(facts: WorkspaceFacts): ResultsSection[] {
  return RESULTS_SECTIONS.filter((section) => facts[section.fact] && (!section.money || facts.can_see_money));
}

export function breakdownsFor(section: ResultsSection, facts: WorkspaceFacts, rangeDays: number): SectionBreakdown[] {
  return section.breakdowns.filter(
    (row) =>
      (!row.people || facts.can_see_people) &&
      (!row.maxDays || rangeDays <= row.maxDays) &&
      (!row.needs || facts[row.needs])
  );
}

/** Every metric a set of sections reads, for one summary call. */
export function sectionMetrics(sections: ResultsSection[]): string[] {
  const out = new Set<string>();
  for (const section of sections) {
    for (const card of section.cards) {
      if ("metric" in card) out.add(card.metric);
      else if (card.share === "response_rate") out.add("response_within").add("response_decided");
      else if (card.share === "follow_up_rate") out.add("follow_up_on_time").add("follow_up_gaps");
      else out.add("relay_approved_unchanged").add("relay_prepared");
    }
  }
  return [...out];
}

/** The number a breakdown row shows: a median for durations, a total for money, a count otherwise. */
export function breakdownValue(metric: string, row: BreakdownRow): number {
  const def = metricDefinition(metric);
  if (def.measure === "median") return row.median ?? 0;
  if (def.measure === "sum") return row.sum ?? 0;
  if (def.measure === "leads") return row.leads;
  return row.count;
}

/** Objections come back as type:state. The breakdown groups them by type. */
export function mergeObjectionRows(rows: BreakdownRow[]): BreakdownRow[] {
  const byType = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const type = row.key.split(":")[0] ?? "other";
    const current = byType.get(type);
    byType.set(type, {
      key: type,
      label: type,
      count: (current?.count ?? 0) + row.count,
      leads: (current?.leads ?? 0) + row.leads,
      sum: null,
      median: null,
    });
  }
  return [...byType.values()].sort((a, b) => b.count - a.count);
}

export function rangeDays(range: { from: string; to: string }): number {
  return Math.ceil((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000);
}
