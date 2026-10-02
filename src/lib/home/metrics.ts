import { inRange, type PeriodRange } from "@/lib/home/periods";

/**
 * Every number on the home screen, defined once.
 *
 * Each calculator takes rows Vistrial already stores and returns the figure
 * plus the leads behind it, so the card and the list a card opens can never
 * disagree. Reports should import these rather than restate them.
 *
 * Nothing here invents a value. When the data a number needs is missing, the
 * calculator says so and the screen shows that instead of a zero.
 */

export const HOME_METRIC_IDS = [
  "booked_calls",
  "quiet_leads_recovered",
  "first_reply_time",
  "no_shows_rebooked",
  "revenue_booked",
] as const;
export type HomeMetricId = (typeof HOME_METRIC_IDS)[number];

export function isHomeMetricId(value: unknown): value is HomeMetricId {
  return typeof value === "string" && (HOME_METRIC_IDS as readonly string[]).includes(value);
}

export const HOME_METRIC_DEFINITIONS: Record<HomeMetricId, { label: string; definition: string }> = {
  booked_calls: {
    label: "Booked calls",
    definition:
      "Appointments booked during the period. Counted when the booking arrived from the CRM, not when the call happens.",
  },
  quiet_leads_recovered: {
    label: "Quiet leads recovered",
    definition:
      "Leads with no activity for 48 hours or more who replied or booked during the period, after a message Vistrial sent.",
  },
  first_reply_time: {
    label: "First reply time",
    definition:
      "For leads who arrived during the period, the median time from arriving to the first message or call of any kind, system or person.",
  },
  no_shows_rebooked: {
    label: "No-shows rebooked",
    definition: "Missed appointments that were booked again into a new appointment during the period.",
  },
  revenue_booked: {
    label: "Revenue booked",
    definition:
      "Revenue recorded against leads during the period, net of refunds and chargebacks, split by new, repeat, recurring, and reactivation.",
  },
};

/** The silence that makes a lead quiet. */
export const QUIET_AFTER_HOURS = 48;

/* ---------------------------------------------------------------------------
 * Input rows. Loaders map database rows into these.
 * ------------------------------------------------------------------------- */

export type CallRow = {
  id: string;
  leadId: string;
  scheduledAt: string | null;
  createdAt: string;
  outcome: string | null;
};

export type TouchRow = {
  leadId: string;
  occurredAt: string;
  direction: "inbound" | "outbound";
};

export type SentFollowUpRow = { leadId: string; sentAt: string };

export type LeadArrivalRow = { id: string; optedInAt: string };

export type RevenueRow = {
  leadId: string | null;
  amountCents: number;
  kind: "sale" | "refund" | "chargeback" | "failed";
  lifecycle: "new" | "repeat" | "recurring" | "reactivation" | null;
  occurredAt: string;
};

export type MetricResult = {
  /** Distinct leads behind the number, in the order the list should show them. */
  leadIds: string[];
};

function ms(iso: string): number {
  return Date.parse(iso);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/* ---------------------------------------------------------------------------
 * Booked calls
 * ------------------------------------------------------------------------- */

/** A booking is a call row with an appointment time. Its row is created when the booking arrives. */
export function isBooking(call: CallRow): boolean {
  return Boolean(call.scheduledAt);
}

export function bookedCalls(
  calls: CallRow[],
  period: Pick<PeriodRange, "from" | "to">,
  testLeadIds: ReadonlySet<string> = new Set()
): MetricResult & { count: number; callIds: string[] } {
  const booked = calls
    .filter((call) => isBooking(call) && !testLeadIds.has(call.leadId) && inRange(call.createdAt, period))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  return {
    count: booked.length,
    callIds: booked.map((call) => call.id),
    leadIds: unique(booked.map((call) => call.leadId)),
  };
}

/* ---------------------------------------------------------------------------
 * Cost per booked call
 * ------------------------------------------------------------------------- */

export type CostPerBookedCall =
  | { state: "not_connected" }
  | { state: "no_bookings"; spendCents: number }
  | { state: "ok"; cents: number; spendCents: number };

/** Ad spend in the period divided by booked calls in the period. */
export function costPerBookedCall(spendCents: number | null, booked: number): CostPerBookedCall {
  if (spendCents === null) return { state: "not_connected" };
  if (booked <= 0) return { state: "no_bookings", spendCents };
  return { state: "ok", cents: Math.round(spendCents / booked), spendCents };
}

/* ---------------------------------------------------------------------------
 * Quiet leads recovered
 * ------------------------------------------------------------------------- */

/**
 * A lead counts once, the first time it recovers inside the period.
 *
 * Recovered means: Vistrial sent a message at time T; before T the lead had
 * gone at least 48 hours with nothing (no touch either way, no booking, and
 * not freshly arrived); after T the lead replied or booked, and that reply or
 * booking happened inside the period. The send itself can be before the
 * period. The touch the send itself produced is not counted as activity.
 */
export function quietLeadsRecovered(args: {
  sends: SentFollowUpRow[];
  touches: TouchRow[];
  bookings: Array<{ leadId: string; createdAt: string }>;
  arrivals: Map<string, string>;
  period: Pick<PeriodRange, "from" | "to">;
  testLeadIds?: ReadonlySet<string>;
  quietHours?: number;
}): MetricResult & { count: number; recoveredAt: Map<string, string> } {
  const quietMs = (args.quietHours ?? QUIET_AFTER_HOURS) * 3_600_000;
  const test = args.testLeadIds ?? new Set<string>();
  const touchesByLead = groupBy(args.touches, (row) => row.leadId);
  const bookingsByLead = groupBy(args.bookings, (row) => row.leadId);
  const recoveredAt = new Map<string, number>();

  const sends = [...args.sends].sort((a, b) => ms(a.sentAt) - ms(b.sentAt));
  for (const send of sends) {
    if (test.has(send.leadId)) continue;
    const sentAt = ms(send.sentAt);
    if (!Number.isFinite(sentAt)) continue;
    const touches = touchesByLead.get(send.leadId) ?? [];
    const bookings = bookingsByLead.get(send.leadId) ?? [];

    // The send's own outbound touch lands within a minute of it.
    const before = [
      ...touches
        .filter((touch) => {
          const at = ms(touch.occurredAt);
          return at < sentAt && !(touch.direction === "outbound" && sentAt - at < 60_000);
        })
        .map((touch) => ms(touch.occurredAt)),
      ...bookings.map((booking) => ms(booking.createdAt)).filter((at) => at < sentAt),
    ];
    const arrived = args.arrivals.get(send.leadId);
    if (arrived) before.push(ms(arrived));
    const lastActivity = before.length ? Math.max(...before) : null;
    if (lastActivity !== null && sentAt - lastActivity < quietMs) continue;

    const responses = [
      ...touches.filter((touch) => touch.direction === "inbound").map((touch) => ms(touch.occurredAt)),
      ...bookings.map((booking) => ms(booking.createdAt)),
    ]
      .filter((at) => at > sentAt && at >= ms(args.period.from) && at < ms(args.period.to))
      .sort((a, b) => a - b);
    if (!responses.length) continue;
    const existing = recoveredAt.get(send.leadId);
    if (existing === undefined || responses[0] < existing) recoveredAt.set(send.leadId, responses[0]);
  }

  const leadIds = [...recoveredAt.entries()].sort((a, b) => b[1] - a[1]).map(([leadId]) => leadId);
  return {
    count: leadIds.length,
    leadIds,
    recoveredAt: new Map([...recoveredAt.entries()].map(([leadId, at]) => [leadId, new Date(at).toISOString()])),
  };
}

/* ---------------------------------------------------------------------------
 * First reply time
 * ------------------------------------------------------------------------- */

export type FirstReplyResult = MetricResult & {
  /** Null when no lead in the period has been touched yet. */
  medianMinutes: number | null;
  measured: number;
  /** Arrived in the period and still untouched. Excluded from the median. */
  waiting: number;
  minutesByLead: Map<string, number>;
};

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * `firstTouchAt` is each lead's earliest outbound touch, system or person.
 * Inbound messages from the lead are not a reply to them.
 */
export function firstReplyTime(args: {
  arrivals: LeadArrivalRow[];
  firstTouchAt: Map<string, string>;
  period: Pick<PeriodRange, "from" | "to">;
  testLeadIds?: ReadonlySet<string>;
}): FirstReplyResult {
  const test = args.testLeadIds ?? new Set<string>();
  const minutesByLead = new Map<string, number>();
  let waiting = 0;
  const arrived = args.arrivals
    .filter((lead) => !test.has(lead.id) && inRange(lead.optedInAt, args.period))
    .sort((a, b) => ms(b.optedInAt) - ms(a.optedInAt));
  for (const lead of arrived) {
    const touched = args.firstTouchAt.get(lead.id);
    if (!touched) {
      waiting += 1;
      continue;
    }
    minutesByLead.set(lead.id, Math.max(0, (ms(touched) - ms(lead.optedInAt)) / 60_000));
  }
  return {
    medianMinutes: median([...minutesByLead.values()]),
    measured: minutesByLead.size,
    waiting,
    minutesByLead,
    leadIds: arrived.filter((lead) => minutesByLead.has(lead.id)).map((lead) => lead.id),
  };
}

/** "4 min", "1.5 hr". Minutes below an hour, hours above. */
export function formatReplyTime(minutes: number): string {
  if (minutes < 1) return "under 1 min";
  if (minutes <= 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)} hr`;
}

/* ---------------------------------------------------------------------------
 * No-shows rebooked
 * ------------------------------------------------------------------------- */

/**
 * A no-show is rebooked when the same lead gets a new appointment created
 * after the missed one. The new booking has to land inside the period; the
 * missed appointment can be older. Each new booking rebooks at most one
 * no-show, oldest first.
 */
export function noShowsRebooked(
  calls: CallRow[],
  period: Pick<PeriodRange, "from" | "to">,
  testLeadIds: ReadonlySet<string> = new Set()
): MetricResult & { count: number; pairs: Array<{ noShowId: string; rebookId: string; leadId: string }> } {
  const byLead = groupBy(
    calls.filter((call) => !testLeadIds.has(call.leadId)),
    (call) => call.leadId
  );
  const pairs: Array<{ noShowId: string; rebookId: string; leadId: string; at: number }> = [];
  for (const [leadId, leadCalls] of byLead) {
    const noShows = leadCalls
      .filter((call) => call.outcome === "no_show")
      .sort((a, b) => missedAt(a) - missedAt(b));
    const used = new Set<string>();
    for (const noShow of noShows) {
      const rebook = leadCalls
        .filter(
          (call) =>
            call.id !== noShow.id &&
            !used.has(call.id) &&
            isBooking(call) &&
            ms(call.createdAt) > Math.max(ms(noShow.createdAt), missedAt(noShow)) &&
            inRange(call.createdAt, period)
        )
        .sort((a, b) => ms(a.createdAt) - ms(b.createdAt))[0];
      if (!rebook) continue;
      used.add(rebook.id);
      pairs.push({ noShowId: noShow.id, rebookId: rebook.id, leadId, at: ms(rebook.createdAt) });
    }
  }
  pairs.sort((a, b) => b.at - a.at);
  return {
    count: pairs.length,
    pairs: pairs.map(({ noShowId, rebookId, leadId }) => ({ noShowId, rebookId, leadId })),
    leadIds: unique(pairs.map((pair) => pair.leadId)),
  };
}

/** When the appointment was missed: its slot, or when it was recorded if it has none. */
function missedAt(call: CallRow): number {
  return ms(call.scheduledAt ?? call.createdAt);
}

/* ---------------------------------------------------------------------------
 * Revenue booked
 * ------------------------------------------------------------------------- */

export const REVENUE_LIFECYCLES = ["new", "repeat", "recurring", "reactivation"] as const;
export type RevenueLifecycle = (typeof REVENUE_LIFECYCLES)[number];

export const REVENUE_LIFECYCLE_LABELS: Record<RevenueLifecycle | "unclassified", string> = {
  new: "New",
  repeat: "Repeat",
  recurring: "Recurring",
  reactivation: "Reactivation",
  unclassified: "Not classified yet",
};

export function netRevenueCents(row: Pick<RevenueRow, "amountCents" | "kind">): number {
  if (row.kind === "refund" || row.kind === "chargeback") return -row.amountCents;
  if (row.kind === "failed") return 0;
  return row.amountCents;
}

export function revenueBooked(
  rows: RevenueRow[],
  period: Pick<PeriodRange, "from" | "to">,
  testLeadIds: ReadonlySet<string> = new Set()
): MetricResult & {
  netCents: number;
  byLifecycle: Record<RevenueLifecycle | "unclassified", number>;
  centsByLead: Map<string, number>;
} {
  const byLifecycle: Record<RevenueLifecycle | "unclassified", number> = {
    new: 0,
    repeat: 0,
    recurring: 0,
    reactivation: 0,
    unclassified: 0,
  };
  const centsByLead = new Map<string, number>();
  let netCents = 0;
  for (const row of rows) {
    if (!row.leadId || testLeadIds.has(row.leadId) || !inRange(row.occurredAt, period)) continue;
    const cents = netRevenueCents(row);
    netCents += cents;
    byLifecycle[row.lifecycle ?? "unclassified"] += cents;
    centsByLead.set(row.leadId, (centsByLead.get(row.leadId) ?? 0) + cents);
  }
  const leadIds = [...centsByLead.entries()].sort((a, b) => b[1] - a[1]).map(([leadId]) => leadId);
  return { netCents, byLifecycle, centsByLead, leadIds };
}

/* ---------------------------------------------------------------------------
 * Comparison line
 * ------------------------------------------------------------------------- */

export type Comparison = {
  direction: "up" | "down" | "flat";
  /** True when the change is an improvement. Faster first replies improve by going down. */
  improved: boolean | null;
  text: string;
};

/**
 * "up 3 from last week". Null when there is nothing honest to compare with,
 * which the screen shows by leaving the line out rather than printing zero.
 */
export function compare(args: {
  current: number | null;
  previous: number | null;
  hasPreviousData: boolean;
  comparisonLabel: string;
  lowerIsBetter?: boolean;
  format?: (delta: number) => string;
}): Comparison | null {
  if (!args.hasPreviousData || args.current === null || args.previous === null) return null;
  const delta = args.current - args.previous;
  const format = args.format ?? ((value: number) => String(Math.round(value)));
  if (Math.abs(delta) < 1e-9 || format(Math.abs(delta)) === format(0)) {
    return { direction: "flat", improved: null, text: `same as ${args.comparisonLabel.replace(/^from /, "")}` };
  }
  const direction = delta > 0 ? "up" : "down";
  const improved = args.lowerIsBetter ? delta < 0 : delta > 0;
  return { direction, improved, text: `${direction} ${format(Math.abs(delta))} ${args.comparisonLabel}` };
}

/* ---------------------------------------------------------------------------
 * Money
 * ------------------------------------------------------------------------- */

export function formatCents(cents: number, currency = "USD"): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(dollars) >= 1000 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(dollars);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
