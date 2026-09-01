import "server-only";

import type { ForsightDb } from "@/lib/forsight/sources";
import {
  hoursBetween,
  monthlyFromFacts,
  type MonthFacts,
  type MonthLead,
} from "@/lib/forsight/report/facts";
import type { MonthlyMetrics } from "@/lib/forsight/report/types";
import type { ForsightResult } from "@/lib/forsight/types";

/**
 * A month from Vistrial's own tables, in the same facts shape the Airtable
 * adapter produces. Qualification is the readiness threshold (default 60),
 * which is what the base's formula uses for "Qualified".
 */

const DEFAULT_READY_THRESHOLD = 60;

const OBJECTION_LABEL: Record<string, string> = {
  price: "Price",
  timing: "Timing",
  spouse_partner: "Spouse",
  trust: "Trust",
  fit: "Fit",
  competitor: "Competitor",
  other: "Other",
};

type CoreLeadRow = {
  id: string;
  opted_in_at: string;
  status: string;
  current_score: number | null;
  has_net_close: boolean;
  first_human_touch_at: string | null;
  lead_type: "nurture_track" | "ready_track" | null;
  assigned_setter_id: string | null;
  assigned_closer_id: string | null;
};

type CoreCallRow = {
  id: string;
  lead_id: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  outcome: string | null;
};

export async function coreMonthly(
  db: ForsightDb,
  orgId: string,
  period: { start: string; end: string }
): Promise<ForsightResult<MonthlyMetrics>> {
  const threshold = await readyThreshold(db, orgId);
  const [leads, calls, touches, members, objections, trackChanges, revenue] = await Promise.all([
    readLeads(db, orgId, period.start, period.end),
    readCalls(db, orgId, period.start),
    readHumanTouchCounts(db, orgId),
    readMemberNames(db, orgId),
    readObjections(db, orgId, period.start, period.end),
    readTrackMoves(db, orgId, period.start, period.end),
    readRevenueByLead(db, orgId, period.start, period.end),
  ]);

  const facts = coreMonthFacts({
    leads,
    calls,
    touches,
    members,
    objections,
    trackChanges,
    revenue,
    threshold,
    period,
  });

  return { available: true, data: monthlyFromFacts(facts) };
}

export function coreMonthFacts(args: {
  leads: CoreLeadRow[];
  calls: CoreCallRow[];
  touches: Map<string, number>;
  members: Map<string, string>;
  objections: Array<{ objection: string; count: number }>;
  trackChanges: { poolSize: number; movedIds: string[] };
  revenue: Map<string, number>;
  threshold: number;
  period: { start: string; end: string };
}): MonthFacts {
  const callsByLead = new Map<string, CoreCallRow[]>();
  for (const call of args.calls) {
    const list = callsByLead.get(call.lead_id) ?? [];
    list.push(call);
    callsByLead.set(call.lead_id, list);
  }

  const monthLeads: MonthLead[] = args.leads.map((lead) => {
    const cohortCalls = callsByLead.get(lead.id) ?? [];
    const booked = cohortCalls.some((call) => Boolean(call.scheduled_at));
    const held = cohortCalls.some((call) => call.outcome === "held");
    const noShow = cohortCalls.some((call) => call.outcome === "no_show");
    const rebooked =
      noShow &&
      cohortCalls.some(
        (call) =>
          call.outcome === "held" ||
          call.outcome === "rescheduled" ||
          (Boolean(call.scheduled_at) && call.outcome !== "no_show" && call.outcome !== "cancelled")
      );
    const humanTouches = args.touches.get(lead.id) ?? 0;
    const assignee = lead.assigned_setter_id ?? lead.assigned_closer_id;

    return {
      id: lead.id,
      hoursToFirstHuman: hoursBetween(lead.opted_in_at, lead.first_human_touch_at),
      humanTouches,
      scored: lead.current_score !== null,
      qualified: (lead.current_score ?? 0) >= args.threshold,
      contacted: humanTouches > 0 || Boolean(lead.first_human_touch_at),
      booked,
      held,
      closed: lead.has_net_close || lead.status === "closed_won",
      lost: lead.status === "closed_lost",
      noShow,
      rebooked,
      assignedName: assignee ? (args.members.get(assignee) ?? null) : null,
    };
  });

  const movedRevenue = args.trackChanges.movedIds.reduce(
    (sum, id) => sum + (args.revenue.get(id) ?? 0),
    0
  );

  return {
    leads: monthLeads,
    revenue: {
      newCents: null,
      repeatCents: null,
      recurringCents: null,
      reactivatedCents: null,
    },
    nurture: {
      poolSize: args.trackChanges.poolSize,
      rescoreResponses: null,
      movedToReady: args.trackChanges.movedIds.length,
      revenueFromMovedCents: args.trackChanges.movedIds.length > 0 ? movedRevenue : 0,
    },
    objections: args.objections,
    teamAvailable: true,
    omissions: [],
  };
}

async function readyThreshold(db: ForsightDb, orgId: string): Promise<number> {
  const { data } = await db
    .from("score_configs")
    .select("ready_threshold")
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.ready_threshold ?? DEFAULT_READY_THRESHOLD;
}

async function readLeads(
  db: ForsightDb,
  orgId: string,
  start: string,
  end: string
): Promise<CoreLeadRow[]> {
  const { data, error } = await db
    .from("leads")
    .select(
      "id, opted_in_at, status, current_score, has_net_close, first_human_touch_at, lead_type, assigned_setter_id, assigned_closer_id, is_test"
    )
    .eq("org_id", orgId)
    .eq("is_test", false)
    .gte("opted_in_at", `${start}T00:00:00Z`)
    .lte("opted_in_at", `${end}T23:59:59.999Z`);
  if (error) throw error;
  return (data ?? []) as CoreLeadRow[];
}

async function readCalls(
  db: ForsightDb,
  orgId: string,
  from: string
): Promise<CoreCallRow[]> {
  const { data, error } = await db
    .from("calls")
    .select("id, lead_id, scheduled_at, occurred_at, outcome")
    .eq("org_id", orgId)
    .or(`scheduled_at.gte.${from}T00:00:00Z,occurred_at.gte.${from}T00:00:00Z`);
  if (error) throw error;
  return data ?? [];
}

async function readHumanTouchCounts(db: ForsightDb, orgId: string): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("touches")
    .select("lead_id")
    .eq("org_id", orgId)
    .eq("type", "human");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.lead_id, (counts.get(row.lead_id) ?? 0) + 1);
  }
  return counts;
}

async function readMemberNames(db: ForsightDb, orgId: string): Promise<Map<string, string>> {
  const { data } = await db
    .from("org_members")
    .select("id, display_name, email")
    .eq("org_id", orgId);
  const names = new Map<string, string>();
  for (const row of data ?? []) {
    names.set(row.id, row.display_name?.trim() || row.email);
  }
  return names;
}

async function readObjections(
  db: ForsightDb,
  orgId: string,
  start: string,
  end: string
): Promise<Array<{ objection: string; count: number }>> {
  const { data: held } = await db
    .from("calls")
    .select("id")
    .eq("org_id", orgId)
    .eq("outcome", "held")
    .gte("occurred_at", `${start}T00:00:00Z`)
    .lte("occurred_at", `${end}T23:59:59.999Z`);

  const callIds = (held ?? []).map((row) => row.id);
  if (callIds.length === 0) return [];

  const { data } = await db
    .from("objections")
    .select("type, call_id")
    .eq("org_id", orgId)
    .in("call_id", callIds);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const label = OBJECTION_LABEL[row.type] ?? row.type;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([objection, count]) => ({ objection, count }));
}

async function readTrackMoves(
  db: ForsightDb,
  orgId: string,
  start: string,
  end: string
): Promise<{ poolSize: number; movedIds: string[] }> {
  const { count } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_test", false)
    .eq("lead_type", "nurture_track")
    .not("status", "in", '("closed_won","closed_lost")');

  const { data } = await db
    .from("lead_type_changes")
    .select("lead_id, from_type, to_type, created_at")
    .eq("org_id", orgId)
    .eq("from_type", "nurture_track")
    .eq("to_type", "ready_track")
    .gte("created_at", `${start}T00:00:00Z`)
    .lte("created_at", `${end}T23:59:59.999Z`);

  const movedIds = [...new Set((data ?? []).map((row) => row.lead_id))];
  return { poolSize: count ?? 0, movedIds };
}

async function readRevenueByLead(
  db: ForsightDb,
  orgId: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const { data } = await db
    .from("revenue_log")
    .select("lead_id, amount_cents, kind, occurred_at")
    .eq("org_id", orgId)
    .gte("occurred_at", `${start}T00:00:00Z`)
    .lte("occurred_at", `${end}T23:59:59.999Z`);

  const byLead = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.lead_id) continue;
    const signed =
      row.kind === "refund" || row.kind === "chargeback"
        ? -row.amount_cents
        : row.kind === "failed"
          ? 0
          : row.amount_cents;
    byLead.set(row.lead_id, (byLead.get(row.lead_id) ?? 0) + signed);
  }
  return byLead;
}
