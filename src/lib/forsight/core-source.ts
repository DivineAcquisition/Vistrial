import "server-only";

import type { CreativeRow } from "@/lib/forsight/creatives";
import {
  cac,
  costPerApplication,
  costPerAuditHeld,
  costPerBookedCall,
  roas,
  spendUnavailable,
} from "@/lib/forsight/formulas";
import { fetchMetaAdInsights } from "@/lib/forsight/meta";
import type { LeadRow, PipelineHealth } from "@/lib/forsight/pipeline";
import { debriefsMissing, goingQuiet, neverContacted } from "@/lib/forsight/pipeline";
import type { ForsightDb } from "@/lib/forsight/sources";
import type {
  ForsightCoreSource,
  ForsightMetaSource,
  ForsightMetricsProvider,
  ForsightResult,
} from "@/lib/forsight/types";
import { toMetricValue, type MetricValue } from "@/lib/forsight/values";
import { isoDate, weekCadence, weekEnd, weekLabel } from "@/lib/forsight/weeks";
import type { WeekRow, WeeklyPulse } from "@/lib/forsight/weekly";
import { coreMonthly } from "@/lib/forsight/report/core";

/**
 * Vistrial's own core tables, presented in the shape the Airtable adapter
 * presents.
 *
 * Clients whose lead, touch and outcome activity is already logged in the main
 * app have all of this in our database. Making them reach it through an
 * Airtable base would mean copying our own data out and back in.
 *
 * Every read goes through the caller's Supabase client, so the same row-level
 * security that scopes the rest of the app scopes this. There is no
 * service-role escape hatch here.
 */

/** How many weeks of history the dashboard shows. */
const WEEKS_OF_HISTORY = 12;

/**
 * Airtable's `Qualification Result` has no column in core. The nearest thing
 * with the same meaning is the readiness threshold, which defaults to 60 —
 * the same score the base's own formula uses for "Qualified".
 */
const DEFAULT_READY_THRESHOLD = 60;

type CoreLead = {
  id: string;
  name: string;
  optedInAt: string;
  status: string;
  currentScore: number | null;
  hasNetClose: boolean;
  lastTouchAt: string | null;
};

export function coreProvider(
  db: ForsightDb,
  source: ForsightCoreSource,
  context: { orgName?: string | null; meta: ForsightMetaSource | null; now?: Date }
): ForsightMetricsProvider {
  const now = context.now ?? new Date();

  return {
    sourceType: "vistrial_core",
    orgId: source.orgId,
    sourceId: source.id,
    availableDatasets: () => ["weeklySummary", "leads", "touches"],

    weeks: () => coreWeeks(db, source, context.meta, now, context.orgName),

    /**
     * Core has no per-ad-creative performance anywhere: `ad_spend_days` is
     * campaign by day, with no ad name, impressions, or clicks. Rather than
     * invent a creative table, the page says this workspace does not track it.
     */
    async creatives(): Promise<ForsightResult<CreativeRow[]>> {
      return {
        available: false,
        reason:
          "Creative performance comes from ad-level data, which this workspace's source does not hold. Connecting an Airtable base with a Creatives table would add it.",
      };
    },

    pipeline: () => corePipeline(db, source.orgId, now),

    monthly: (period) => coreMonthly(db, source.orgId, period),
  };
}

/* ---------------------------------------------------------------------------
 * Weeks
 * ------------------------------------------------------------------------- */

async function coreWeeks(
  db: ForsightDb,
  source: ForsightCoreSource,
  meta: ForsightMetaSource | null,
  now: Date,
  orgName?: string | null
): Promise<ForsightResult<WeeklyPulse>> {
  const today = isoDate(now);
  const cadence = weekCadence([], today);
  const firstWeek = cadence.weekStartFor(today);
  const starts: string[] = [];
  for (let index = WEEKS_OF_HISTORY - 1; index >= 0; index -= 1) {
    starts.push(shiftWeeks(firstWeek, -index));
  }
  const from = starts[0];

  const threshold = await readyThreshold(db, source.orgId);
  const [leads, calls, revenue] = await Promise.all([
    readLeads(db, source.orgId, from),
    readCalls(db, source.orgId, from),
    readRevenue(db, source.orgId, from),
  ]);

  const spendByWeek = await readSpendByWeek(db, meta, starts, source.orgId, orgName);

  const weeks: WeekRow[] = starts.map((weekStart) => {
    const end = weekEnd(weekStart);
    const inWeek = (date: string | null) =>
      Boolean(date) && (date as string).slice(0, 10) >= weekStart && (date as string).slice(0, 10) <= end;

    // A lead belongs to the week it opted in, never the week it closed. That
    // is the cohorting the rest of Vistrial's reporting already uses.
    const cohort = leads.filter((lead) => inWeek(lead.optedInAt));
    const cohortIds = new Set(cohort.map((lead) => lead.id));

    const applications = cohort.length;
    const qualified = cohort.filter(
      (lead) => (lead.currentScore ?? 0) >= threshold
    ).length;
    const booked = new Set(
      calls.filter((call) => call.scheduledAt && cohortIds.has(call.leadId)).map((call) => call.leadId)
    ).size;
    const held = new Set(
      calls.filter((call) => call.outcome === "held" && cohortIds.has(call.leadId)).map((call) => call.leadId)
    ).size;
    const closed = cohort.filter((lead) => lead.hasNetClose).length;

    // Revenue is counted when the money arrived, which is how a week's ROAS
    // compares like with like against that week's spend.
    const revenueCents = revenue
      .filter((entry) => inWeek(entry.occurredAt))
      .reduce((sum, entry) => sum + entry.netCents, 0);

    const spend = spendByWeek.get(weekStart) ?? spendUnavailable();
    const revenueValue = toMetricValue(revenueCents / 100);
    const applicationsValue = toMetricValue(applications);
    const bookedValue = toMetricValue(booked);
    const heldValue = toMetricValue(held);
    const closedValue = toMetricValue(closed);

    return {
      id: `core:${weekStart}`,
      week: weekLabel(weekStart),
      weekStart,
      spend,
      applications: applicationsValue,
      qualified: toMetricValue(qualified),
      booked: bookedValue,
      held: heldValue,
      closed: closedValue,
      revenue: revenueValue,
      costPerApplication: costPerApplication(spend, applicationsValue),
      costPerBookedCall: costPerBookedCall(spend, bookedValue),
      costPerAuditHeld: costPerAuditHeld(spend, heldValue),
      cac: cac(spend, closedValue),
      roas: roas(revenueValue, spend),
    };
  });

  return {
    available: true,
    data: {
      weeks,
      current: weeks[weeks.length - 1] ?? null,
      previous: weeks[weeks.length - 2] ?? null,
      hasTrend: weeks.length >= 2,
    },
  };
}

/**
 * Spend is the one figure core cannot produce. `ad_spend_days` exists, but it
 * belongs to the owner-portal integration with its own sync lifecycle and a
 * rolling window, and quietly borrowing another subsystem's numbers is how a
 * dashboard ends up confidently wrong. Forsight uses its own Meta source or
 * says it does not know.
 */
async function readSpendByWeek(
  db: ForsightDb,
  meta: ForsightMetaSource | null,
  starts: string[],
  orgId: string,
  orgName?: string | null
): Promise<Map<string, MetricValue>> {
  void db;
  const byWeek = new Map<string, MetricValue>();
  if (!meta) return byWeek;

  for (const weekStart of starts) {
    try {
      const insights = await fetchMetaAdInsights({
        orgId,
        orgLabel: orgName,
        adAccountId: meta.adAccountId,
        since: weekStart,
        until: weekEnd(weekStart),
      });
      byWeek.set(weekStart, toMetricValue(insights.totalSpend));
    } catch {
      // One unreadable week does not make the others unknowable.
      byWeek.set(weekStart, spendUnavailable());
    }
  }

  return byWeek;
}

/* ---------------------------------------------------------------------------
 * Pipeline health
 * ------------------------------------------------------------------------- */

async function corePipeline(
  db: ForsightDb,
  orgId: string,
  now: Date
): Promise<ForsightResult<PipelineHealth>> {
  const threshold = await readyThreshold(db, orgId);

  const { data: rows, error } = await db
    .from("leads")
    .select(
      "id, first_name, last_name, opted_in_at, status, current_score, has_net_close, last_touch_at, is_test"
    )
    .eq("org_id", orgId)
    .eq("is_test", false)
    .order("opted_in_at", { ascending: false })
    .limit(2000);

  if (error) return { available: false, reason: `Could not read leads: ${error.message}` };

  const leadIds = (rows ?? []).map((row) => row.id);
  const [humanTouches, actions, awaitingDebrief] = await Promise.all([
    countHumanTouches(db, orgId, leadIds),
    readNextActions(db, orgId, leadIds),
    readAwaitingDebrief(db, orgId, leadIds),
  ]);

  const leads: LeadRow[] = (rows ?? []).map((row) => {
    const score = row.current_score;
    const days = daysBetween(row.last_touch_at, now);
    return {
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead",
      stage: row.status,
      // Airtable's wording, so both adapters describe a lead the same way.
      qualificationResult: (score ?? 0) >= threshold ? "Qualified" : "Manual Review",
      readinessScore: score,
      humanTouches: humanTouches.get(row.id) ?? 0,
      optInDate: row.opted_in_at ? row.opted_in_at.slice(0, 10) : null,
      daysSinceTouch: days,
      touchStatus: touchStatus(humanTouches.get(row.id) ?? 0, days),
      nextAction: actions.get(row.id) ?? "",
      debriefMissing: awaitingDebrief.has(row.id),
    };
  });

  return {
    available: true,
    data: {
      neverContacted: neverContacted(leads),
      goingQuiet: goingQuiet(leads),
      debriefsMissing: debriefsMissing(leads),
      totalLeads: leads.length,
    },
  };
}

/** The same buckets the base's Touch Status formula produces. */
export function touchStatus(humanTouches: number, daysSinceTouch: number | null): string {
  if (humanTouches === 0) return "🔴 No human contact";
  if (daysSinceTouch === null) return "🔴 No human contact";
  if (daysSinceTouch > 30) return "⚫ Ghosted 30d+";
  if (daysSinceTouch > 14) return "🟠 Ghosted 14d+";
  if (daysSinceTouch > 7) return "🟡 Going quiet";
  return "🟢 Active";
}

async function countHumanTouches(
  db: ForsightDb,
  orgId: string,
  leadIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (leadIds.length === 0) return counts;

  const { data } = await db
    .from("touches")
    .select("lead_id")
    .eq("org_id", orgId)
    .eq("type", "human")
    .in("lead_id", leadIds);

  for (const row of data ?? []) {
    counts.set(row.lead_id, (counts.get(row.lead_id) ?? 0) + 1);
  }
  return counts;
}

async function readNextActions(
  db: ForsightDb,
  orgId: string,
  leadIds: string[]
): Promise<Map<string, string>> {
  const actions = new Map<string, string>();
  if (leadIds.length === 0) return actions;

  const { data } = await db
    .from("next_actions")
    .select("lead_id, action_text, created_at")
    .eq("org_id", orgId)
    .is("completed_at", null)
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  for (const row of data ?? []) {
    if (!actions.has(row.lead_id)) actions.set(row.lead_id, row.action_text);
  }
  return actions;
}

/** Held a call, nobody wrote it up — core's equivalent of Debrief Missing. */
async function readAwaitingDebrief(
  db: ForsightDb,
  orgId: string,
  leadIds: string[]
): Promise<Set<string>> {
  const awaiting = new Set<string>();
  if (leadIds.length === 0) return awaiting;

  const { data: held } = await db
    .from("calls")
    .select("id, lead_id")
    .eq("org_id", orgId)
    .eq("outcome", "held")
    .in("lead_id", leadIds);

  const callIds = (held ?? []).map((call) => call.id);
  if (callIds.length === 0) return awaiting;

  const { data: written } = await db
    .from("call_extractions")
    .select("call_id")
    .eq("org_id", orgId)
    .in("call_id", callIds);

  const done = new Set((written ?? []).map((row) => row.call_id));
  for (const call of held ?? []) {
    if (!done.has(call.id) && call.lead_id) awaiting.add(call.lead_id);
  }
  return awaiting;
}

/* ---------------------------------------------------------------------------
 * Core reads
 * ------------------------------------------------------------------------- */

async function readyThreshold(db: ForsightDb, orgId: string): Promise<number> {
  const { data } = await db
    .from("score_configs")
    .select("ready_threshold")
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.ready_threshold ?? DEFAULT_READY_THRESHOLD;
}

async function readLeads(db: ForsightDb, orgId: string, from: string): Promise<CoreLead[]> {
  const { data } = await db
    .from("leads")
    .select("id, first_name, last_name, opted_in_at, status, current_score, has_net_close, last_touch_at")
    .eq("org_id", orgId)
    .eq("is_test", false)
    .gte("opted_in_at", `${from}T00:00:00Z`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    optedInAt: row.opted_in_at,
    status: row.status,
    currentScore: row.current_score,
    hasNetClose: Boolean(row.has_net_close),
    lastTouchAt: row.last_touch_at,
  }));
}

async function readCalls(
  db: ForsightDb,
  orgId: string,
  from: string
): Promise<Array<{ leadId: string; scheduledAt: string | null; outcome: string | null }>> {
  const { data } = await db
    .from("calls")
    .select("lead_id, scheduled_at, occurred_at, outcome")
    .eq("org_id", orgId)
    .or(`scheduled_at.gte.${from}T00:00:00Z,occurred_at.gte.${from}T00:00:00Z`);

  return (data ?? []).map((row) => ({
    leadId: row.lead_id,
    scheduledAt: row.scheduled_at,
    outcome: row.outcome,
  }));
}

/** Sales net of refunds and chargebacks, the way core already defines a close. */
async function readRevenue(
  db: ForsightDb,
  orgId: string,
  from: string
): Promise<Array<{ occurredAt: string; netCents: number }>> {
  const { data } = await db
    .from("revenue_log")
    .select("amount_cents, kind, occurred_at")
    .eq("org_id", orgId)
    .gte("occurred_at", `${from}T00:00:00Z`);

  return (data ?? []).map((row) => ({
    occurredAt: row.occurred_at,
    netCents:
      row.kind === "refund" || row.kind === "chargeback"
        ? -row.amount_cents
        : row.kind === "failed"
          ? 0
          : row.amount_cents,
  }));
}

function shiftWeeks(weekStart: string, weeks: number): string {
  const day = Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * 86_400_000;
  return new Date(day).toISOString().slice(0, 10);
}

function daysBetween(from: string | null, now: Date): number | null {
  if (!from) return null;
  const then = Date.parse(from);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}
