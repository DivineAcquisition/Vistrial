import "server-only";

import { canViewReporting } from "@/lib/auth/permissions";
import type { AuthContext } from "@/lib/auth/types";
import {
  bookedCalls,
  compare,
  costPerBookedCall,
  firstReplyTime,
  formatCents,
  formatReplyTime,
  noShowsRebooked,
  quietLeadsRecovered,
  revenueBooked,
  type CallRow,
  type Comparison,
  type CostPerBookedCall,
  type HomeMetricId,
  type RevenueLifecycle,
  type RevenueRow,
  type TouchRow,
} from "@/lib/home/metrics";
import { resolveHomePeriod, type HomePeriod, type HomePeriodKey, type PeriodRange } from "@/lib/home/periods";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

const DAY = 86_400_000;
/** How far before the earliest window a no-show can sit and still be rebooked inside it. */
const NO_SHOW_LOOKBACK_DAYS = 60;
/** How far before the earliest window a Vistrial message can be and still recover a lead inside it. */
const SEND_LOOKBACK_DAYS = 14;
const PAGE = 1000;
const CHUNK = 200;

export type HomeNumbers = {
  period: HomePeriod;
  workspaceName: string;
  /** No leads have ever arrived. The screen shows an invitation instead of zeros. */
  isEmpty: boolean;
  canSeeMoney: boolean;
  bookedCalls: { count: number; comparison: Comparison | null };
  /** Null when this person may not see money. */
  costPerBookedCall: CostPerBookedCall | null;
  quietLeadsRecovered: { count: number; comparison: Comparison | null };
  firstReply: {
    medianMinutes: number | null;
    measured: number;
    waiting: number;
    comparison: Comparison | null;
  };
  noShowsRebooked: { count: number; comparison: Comparison | null };
  revenueBooked: {
    netCents: number;
    byLifecycle: Record<RevenueLifecycle | "unclassified", number>;
    comparison: Comparison | null;
  } | null;
};

export type MetricLeadRow = { leadId: string; name: string; detail: string };

type Inputs = {
  testLeadIds: Set<string>;
  calls: CallRow[];
  arrivals: Array<{ id: string; optedInAt: string }>;
  arrivalsById: Map<string, string>;
  firstTouchAt: Map<string, string>;
  sends: Array<{ leadId: string; sentAt: string }>;
  sendTouches: TouchRow[];
  revenue: RevenueRow[] | null;
  spendCents: { current: number | null; previous: number | null } | null;
  earliestLeadCreatedAt: string | null;
};

async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await run(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK) out.push(items.slice(index, index + CHUNK));
  return out;
}

function shift(iso: string, days: number): string {
  return new Date(Date.parse(iso) - days * DAY).toISOString();
}

async function readSpend(db: Db, orgId: string, range: PeriodRange): Promise<number> {
  const rows = await pageAll<{ spend_cents: number }>((from, to) =>
    db
      .from("ad_spend_days")
      .select("spend_cents")
      .eq("org_id", orgId)
      .gte("spend_date", range.fromDate)
      .lte("spend_date", range.toDate)
      .order("id")
      .range(from, to)
  );
  return rows.reduce((sum, row) => sum + Number(row.spend_cents ?? 0), 0);
}

async function loadInputs(db: Db, ctx: AuthContext, period: HomePeriod, canSeeMoney: boolean): Promise<Inputs> {
  const orgId = ctx.org.id;
  const windowFrom = period.previous.from < period.from ? period.previous.from : period.from;
  const callsFrom = shift(windowFrom, NO_SHOW_LOOKBACK_DAYS);
  const sendsFrom = shift(windowFrom, SEND_LOOKBACK_DAYS);

  const [testLeads, calls, arrivals, sends, earliest] = await Promise.all([
    pageAll<{ id: string }>((from, to) =>
      db.from("leads").select("id").eq("org_id", orgId).eq("is_test", true).order("id").range(from, to)
    ),
    pageAll<{ id: string; lead_id: string; scheduled_at: string | null; created_at: string; outcome: string | null }>(
      (from, to) =>
        db
          .from("calls")
          .select("id, lead_id, scheduled_at, created_at, outcome")
          .eq("org_id", orgId)
          .gte("created_at", callsFrom)
          .lt("created_at", period.to)
          .order("created_at")
          .range(from, to)
    ),
    pageAll<{ id: string; opted_in_at: string }>((from, to) =>
      db
        .from("leads")
        .select("id, opted_in_at")
        .eq("org_id", orgId)
        .gte("opted_in_at", windowFrom)
        .lt("opted_in_at", period.to)
        .order("opted_in_at")
        .range(from, to)
    ),
    // Every row in ghl_dispatches is a message Vistrial sent, approved or automatic.
    pageAll<{ lead_id: string; sent_at: string | null }>((from, to) =>
      db
        .from("ghl_dispatches")
        .select("lead_id, sent_at")
        .eq("org_id", orgId)
        .eq("status", "sent")
        .gte("sent_at", sendsFrom)
        .lt("sent_at", period.to)
        .order("sent_at")
        .range(from, to)
    ),
    db.from("leads").select("created_at").eq("org_id", orgId).order("created_at").limit(1).maybeSingle(),
  ]);

  const arrivalIds = arrivals.map((row) => row.id);
  const firstTouchAt = new Map<string, string>();
  for (const ids of chunks(arrivalIds)) {
    const rows = await pageAll<{ lead_id: string; occurred_at: string }>((from, to) =>
      db
        .from("touches")
        .select("lead_id, occurred_at")
        .eq("org_id", orgId)
        .eq("direction", "outbound")
        .in("lead_id", ids)
        .gte("occurred_at", shift(windowFrom, 1))
        .order("occurred_at")
        .range(from, to)
    );
    for (const row of rows) {
      if (!firstTouchAt.has(row.lead_id)) firstTouchAt.set(row.lead_id, row.occurred_at);
    }
  }

  const sendRows = sends
    .filter((row): row is { lead_id: string; sent_at: string } => Boolean(row.sent_at))
    .map((row) => ({ leadId: row.lead_id, sentAt: row.sent_at }));
  const sendLeadIds = [...new Set(sendRows.map((row) => row.leadId))];
  const sendTouches: TouchRow[] = [];
  const arrivalsById = new Map(arrivals.map((row) => [row.id, row.opted_in_at]));
  for (const ids of chunks(sendLeadIds)) {
    const [touches, leads] = await Promise.all([
      pageAll<{ lead_id: string; occurred_at: string; direction: "inbound" | "outbound" }>((from, to) =>
        db
          .from("touches")
          .select("lead_id, occurred_at, direction")
          .eq("org_id", orgId)
          .in("lead_id", ids)
          // 48 hours of silence is the only thing looked for before a send.
          .gte("occurred_at", shift(sendsFrom, 3))
          .lt("occurred_at", period.to)
          .order("occurred_at")
          .range(from, to)
      ),
      db.from("leads").select("id, opted_in_at").eq("org_id", orgId).in("id", ids),
    ]);
    for (const touch of touches) {
      sendTouches.push({ leadId: touch.lead_id, occurredAt: touch.occurred_at, direction: touch.direction });
    }
    for (const lead of leads.data ?? []) arrivalsById.set(lead.id, lead.opted_in_at);
  }

  let revenue: RevenueRow[] | null = null;
  let spendCents: Inputs["spendCents"] = null;
  if (canSeeMoney) {
    const [revenueRows, connection] = await Promise.all([
      pageAll<{
        lead_id: string | null;
        amount_cents: number;
        kind: RevenueRow["kind"];
        lifecycle: RevenueRow["lifecycle"];
        occurred_at: string;
      }>((from, to) =>
        db
          .from("revenue_log")
          .select("lead_id, amount_cents, kind, lifecycle, occurred_at")
          .eq("org_id", orgId)
          .gte("occurred_at", windowFrom)
          .lt("occurred_at", period.to)
          .order("occurred_at")
          .range(from, to)
      ),
      // The same test the owner portal uses: an active Meta or Google Ads source.
      db
        .from("source_connections")
        .select("kind")
        .eq("org_id", orgId)
        .in("kind", ["meta_ads", "google_ads"])
        .eq("status", "active")
        .limit(1),
    ]);
    revenue = revenueRows.map((row) => ({
      leadId: row.lead_id,
      amountCents: Number(row.amount_cents),
      kind: row.kind,
      lifecycle: row.lifecycle ?? null,
      occurredAt: row.occurred_at,
    }));
    if ((connection.data ?? []).length > 0) {
      const [current, previous] = await Promise.all([
        readSpend(db, orgId, period),
        readSpend(db, orgId, period.previous),
      ]);
      spendCents = { current, previous };
    } else {
      spendCents = { current: null, previous: null };
    }
  }

  return {
    testLeadIds: new Set(testLeads.map((row) => row.id)),
    calls: calls.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      outcome: row.outcome,
    })),
    arrivals: arrivals.map((row) => ({ id: row.id, optedInAt: row.opted_in_at })),
    arrivalsById,
    firstTouchAt,
    sends: sendRows,
    sendTouches,
    revenue,
    spendCents,
    earliestLeadCreatedAt: earliest.data?.created_at ?? null,
  };
}

function compute(inputs: Inputs, range: PeriodRange) {
  const booked = bookedCalls(inputs.calls, range, inputs.testLeadIds);
  return {
    booked,
    quiet: quietLeadsRecovered({
      sends: inputs.sends,
      touches: inputs.sendTouches,
      bookings: inputs.calls.filter((call) => call.scheduledAt),
      arrivals: inputs.arrivalsById,
      period: range,
      testLeadIds: inputs.testLeadIds,
    }),
    firstReply: firstReplyTime({
      arrivals: inputs.arrivals,
      firstTouchAt: inputs.firstTouchAt,
      period: range,
      testLeadIds: inputs.testLeadIds,
    }),
    rebooked: noShowsRebooked(inputs.calls, range, inputs.testLeadIds),
    revenue: inputs.revenue ? revenueBooked(inputs.revenue, range, inputs.testLeadIds) : null,
  };
}

export async function loadHomeNumbers(ctx: AuthContext, periodKey: HomePeriodKey): Promise<HomeNumbers> {
  const db = await createClient();
  const period = resolveHomePeriod(periodKey, { timeZone: ctx.org.timezone });
  const canSeeMoney = canViewReporting(ctx.role, ctx.isStaff);
  const inputs = await loadInputs(db, ctx, period, canSeeMoney);
  const current = compute(inputs, period);
  const previous = compute(inputs, period.previous);

  // Vistrial has to have been recording for the whole previous window, or the
  // comparison would credit this period with data that simply was not there.
  const hasPreviousData =
    inputs.earliestLeadCreatedAt !== null && inputs.earliestLeadCreatedAt <= period.previous.from;
  const versus = (currentValue: number | null, previousValue: number | null, extra?: Partial<Parameters<typeof compare>[0]>) =>
    compare({
      current: currentValue,
      previous: previousValue,
      hasPreviousData,
      comparisonLabel: period.comparisonLabel,
      ...extra,
    });

  return {
    period,
    workspaceName: ctx.org.name,
    isEmpty: inputs.earliestLeadCreatedAt === null,
    canSeeMoney,
    bookedCalls: {
      count: current.booked.count,
      comparison: versus(current.booked.count, previous.booked.count),
    },
    costPerBookedCall: inputs.spendCents
      ? costPerBookedCall(inputs.spendCents.current, current.booked.count)
      : null,
    quietLeadsRecovered: {
      count: current.quiet.count,
      comparison: versus(current.quiet.count, previous.quiet.count),
    },
    firstReply: {
      medianMinutes: current.firstReply.medianMinutes,
      measured: current.firstReply.measured,
      waiting: current.firstReply.waiting,
      comparison: versus(current.firstReply.medianMinutes, previous.firstReply.medianMinutes, {
        lowerIsBetter: true,
        format: formatReplyTime,
      }),
    },
    noShowsRebooked: {
      count: current.rebooked.count,
      comparison: versus(current.rebooked.count, previous.rebooked.count),
    },
    revenueBooked:
      current.revenue && previous.revenue
        ? {
            netCents: current.revenue.netCents,
            byLifecycle: current.revenue.byLifecycle,
            comparison: versus(current.revenue.netCents, previous.revenue.netCents, {
              format: (cents) => formatCents(cents),
            }),
          }
        : null,
  };
}

function shortDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

function leadName(row: { first_name: string | null; last_name: string | null; email: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "Unnamed lead";
}

/**
 * The leads behind one number, computed with the same function as the card,
 * so the list length always equals the figure.
 */
export async function loadMetricLeads(
  ctx: AuthContext,
  metric: HomeMetricId,
  periodKey: HomePeriodKey
): Promise<{ period: HomePeriod; rows: MetricLeadRow[] } | null> {
  const canSeeMoney = canViewReporting(ctx.role, ctx.isStaff);
  if (metric === "revenue_booked" && !canSeeMoney) return null;
  const db = await createClient();
  const period = resolveHomePeriod(periodKey, { timeZone: ctx.org.timezone });
  const inputs = await loadInputs(db, ctx, period, canSeeMoney);
  const result = compute(inputs, period);
  const tz = ctx.org.timezone;

  let ids: string[] = [];
  let detail: (leadId: string) => string = () => "";
  if (metric === "booked_calls") {
    // One row per booking: a lead booked twice appears twice.
    const callsById = new Map(inputs.calls.map((call) => [call.id, call]));
    const bookings = result.booked.callIds.map((id) => callsById.get(id)).filter((call): call is CallRow => Boolean(call));
    const names = await readNames(db, ctx.org.id, [...new Set(bookings.map((call) => call.leadId))]);
    return {
      period,
      rows: bookings.map((call) => ({
        leadId: call.leadId,
        name: names.get(call.leadId) ?? "Unnamed lead",
        detail: `Booked ${shortDate(call.createdAt, tz)}${call.scheduledAt ? ` · call ${shortDate(call.scheduledAt, tz)}` : ""}`,
      })),
    };
  }
  if (metric === "no_shows_rebooked") {
    const callsById = new Map(inputs.calls.map((call) => [call.id, call]));
    const names = await readNames(db, ctx.org.id, result.rebooked.leadIds);
    return {
      period,
      rows: result.rebooked.pairs.map((pair) => {
        const missed = callsById.get(pair.noShowId);
        const rebook = callsById.get(pair.rebookId);
        return {
          leadId: pair.leadId,
          name: names.get(pair.leadId) ?? "Unnamed lead",
          detail: `Missed ${missed ? shortDate(missed.scheduledAt ?? missed.createdAt, tz) : "earlier"} · rebooked ${
            rebook ? shortDate(rebook.createdAt, tz) : ""
          }`,
        };
      }),
    };
  }
  if (metric === "quiet_leads_recovered") {
    ids = result.quiet.leadIds;
    detail = (leadId) => {
      const at = result.quiet.recoveredAt.get(leadId);
      return at ? `Came back ${shortDate(at, tz)}` : "Came back";
    };
  } else if (metric === "first_reply_time") {
    ids = result.firstReply.leadIds;
    detail = (leadId) => {
      const minutes = result.firstReply.minutesByLead.get(leadId);
      return minutes === undefined ? "" : `First reply in ${formatReplyTime(minutes)}`;
    };
  } else if (metric === "revenue_booked" && result.revenue) {
    const revenue = result.revenue;
    ids = revenue.leadIds;
    detail = (leadId) => formatCents(revenue.centsByLead.get(leadId) ?? 0);
  }

  const names = await readNames(db, ctx.org.id, ids);
  return {
    period,
    rows: ids.map((leadId) => ({ leadId, name: names.get(leadId) ?? "Unnamed lead", detail: detail(leadId) })),
  };
}

async function readNames(db: Db, orgId: string, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const part of chunks(ids)) {
    const { data } = await db
      .from("leads")
      .select("id, first_name, last_name, email")
      .eq("org_id", orgId)
      .in("id", part);
    for (const row of data ?? []) names.set(row.id, leadName(row));
  }
  return names;
}
