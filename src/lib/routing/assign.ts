import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEffectiveConfig } from "@/lib/config/server";
import type { Database } from "@/types/database";
import {
  arrivalIdempotencyKey,
  routeLead,
  type AssignmentMode,
  type FallbackMode,
  type RoutingInput,
  type RoutingOperator,
  type RoutingRule,
} from "@/lib/routing/engine";

type Db = SupabaseClient<Database>;
type Loose = SupabaseClient;

const MODES = new Set<AssignmentMode>([
  "manual",
  "round_robin",
  "weighted_round_robin",
  "least_loaded",
  "rules",
  "by_source",
  "by_service",
]);

const FALLBACKS = new Set<FallbackMode>(["manual", "round_robin", "weighted_round_robin", "least_loaded"]);

function asMode(value: unknown, fallback: AssignmentMode): AssignmentMode {
  return typeof value === "string" && MODES.has(value as AssignmentMode) ? (value as AssignmentMode) : fallback;
}

function asFallback(value: unknown): FallbackMode {
  return typeof value === "string" && FALLBACKS.has(value as FallbackMode) ? (value as FallbackMode) : "manual";
}

function loose(db: Db): Loose {
  return db as unknown as Loose;
}

export async function assignArrivingLead(
  db: Db,
  args: { orgId: string; leadId: string; historic?: boolean }
): Promise<{ memberId: string | null; explanation: string }> {
  const client = loose(db);
  if (args.historic) {
    const { data } = await client.rpc("route_apply", {
      p_org_id: args.orgId,
      p_lead_id: args.leadId,
      p_key: arrivalIdempotencyKey(args.leadId),
      p_member_id: null,
      p_mode: "historic",
      p_explanation: "Imported history is not assigned and does not send a notice.",
      p_skipped: [],
      p_expected_cursor: null,
      p_historic: true,
    });
    const row = (data ?? {}) as { explanation?: string };
    return { memberId: null, explanation: row.explanation ?? "Imported history is not assigned and does not send a notice." };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await loadRoutingInput(db, args.orgId, args.leadId);
    const decision = routeLead(snapshot);
    const { data, error } = await client.rpc("route_apply", {
      p_org_id: args.orgId,
      p_lead_id: args.leadId,
      p_key: arrivalIdempotencyKey(args.leadId),
      p_member_id: decision.memberId,
      p_mode: decision.mode,
      p_explanation: decision.explanation,
      p_skipped: decision.skipped,
      p_expected_cursor: snapshot.cursorMemberId,
      p_historic: false,
    });
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as { conflict?: boolean; memberId?: string | null; explanation?: string };
    if (row.conflict) continue;
    return { memberId: row.memberId ?? null, explanation: row.explanation ?? decision.explanation };
  }
  return { memberId: null, explanation: "Assignment was busy. The lead stayed unassigned." };
}

export async function loadRoutingInput(db: Db, orgId: string, leadId: string): Promise<RoutingInput> {
  const client = loose(db);
  const config = await getEffectiveConfig(db, orgId).catch(() => null);
  const values = config?.values ?? {};
  const { data: settings } = await client.from("routing_settings").select("*").eq("org_id", orgId).maybeSingle();
  const saved = (settings ?? {}) as Record<string, unknown>;

  const { data: lead } = await client
    .from("leads")
    .select("id, source, offer_name, assigned_setter_id, assigned_closer_id, timezone")
    .eq("org_id", orgId)
    .eq("id", leadId)
    .maybeSingle();
  const leadRow = (lead ?? {}) as {
    source?: string | null;
    offer_name?: string | null;
    assigned_setter_id?: string | null;
    assigned_closer_id?: string | null;
  };

  const { data: members } = await client
    .from("org_members")
    .select("id, display_name, active, role, timezone, working_hours_start, working_hours_end")
    .eq("org_id", orgId)
    .eq("active", true)
    .in("role", ["setter", "closer", "operator"]);

  const { data: availability } = await client.from("operator_availability").select("*").eq("org_id", orgId);
  const { data: pools } = await client.from("routing_pools").select("id, name").eq("org_id", orgId);
  const { data: poolMembers } = await client.from("routing_pool_members").select("pool_id, member_id").eq("org_id", orgId);
  const { data: rules } = await client.from("routing_rules").select("*").eq("org_id", orgId).order("position");
  const { data: previousTouch } = await client
    .from("touches")
    .select("actor_member_id, occurred_at")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .not("actor_member_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: cursor } = await client.from("routing_cursors").select("member_id").eq("org_id", orgId).maybeSingle();
  const { data: turns } = await client.from("routing_turns").select("member_id, received").eq("org_id", orgId);
  const { data: openLeads } = await client
    .from("leads")
    .select("assigned_setter_id")
    .eq("org_id", orgId)
    .not("assigned_setter_id", "is", null)
    .in("status", ["new", "working", "call_booked", "no_show", "follow_up", "objection_hold"]);

  const avail = new Map(
    ((availability ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.member_id), row])
  );
  const received = new Map(
    ((turns ?? []) as Array<{ member_id: string; received: number }>).map((row) => [row.member_id, row.received])
  );
  const poolName = new Map(((pools ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
  const memberPools = new Map<string, string[]>();
  for (const row of (poolMembers ?? []) as Array<{ pool_id: string; member_id: string }>) {
    const name = poolName.get(row.pool_id);
    if (!name) continue;
    const list = memberPools.get(row.member_id) ?? [];
    list.push(name);
    memberPools.set(row.member_id, list);
  }
  const openCount = new Map<string, number>();
  for (const row of (openLeads ?? []) as Array<{ assigned_setter_id: string | null }>) {
    if (!row.assigned_setter_id) continue;
    openCount.set(row.assigned_setter_id, (openCount.get(row.assigned_setter_id) ?? 0) + 1);
  }

  const respectHours = typeof saved.respect_hours === "boolean" ? saved.respect_hours : values["operators.respect_hours"] === true;
  const now = new Date();
  const operators: RoutingOperator[] = ((members ?? []) as Array<Record<string, unknown>>).map((member) => {
    const extra = avail.get(String(member.id)) ?? {};
    const awayUntil = extra.away_until ? Date.parse(String(extra.away_until)) : NaN;
    const away = extra.away === true && (!Number.isFinite(awayUntil) || awayUntil > now.getTime());
    return {
      memberId: String(member.id),
      name: String(member.display_name || "Operator"),
      active: member.active !== false,
      away,
      weight: Number(extra.weight ?? 1) || 1,
      openLeads: openCount.get(String(member.id)) ?? 0,
      overdueTasks: 0,
      maxOpenLeads: extra.max_open_leads == null ? null : Number(extra.max_open_leads),
      maxOverdueTasks: extra.max_overdue_tasks == null ? null : Number(extra.max_overdue_tasks),
      inHours: respectHours ? withinHours(member, now) : true,
      pools: memberPools.get(String(member.id)) ?? [],
      received: received.get(String(member.id)) ?? 0,
    };
  });

  const routingRules: RoutingRule[] = ((rules ?? []) as Array<Record<string, unknown>>).map((rule) => ({
    id: String(rule.id),
    enabled: rule.enabled !== false,
    position: Number(rule.position ?? 1),
    source: (rule.source as string | null) ?? null,
    service: (rule.service as string | null) ?? null,
    scoreBand: (rule.score_band as string | null) ?? null,
    location: (rule.location as string | null) ?? null,
    language: (rule.language as string | null) ?? null,
    targetMemberId: (rule.target_member_id as string | null) ?? null,
    targetPool: (rule.target_pool as string | null) ?? null,
  }));

  return {
    mode: asMode(saved.mode ?? values["operators.assignment_mode"], "manual"),
    fallbackMode: asFallback(saved.fallback_mode ?? values["operators.routing_fallback"]),
    operators,
    rules: routingRules,
    lead: {
      source: leadRow.source ?? null,
      service: leadRow.offer_name ?? null,
      scoreBand: null,
      location: null,
      language: null,
      previousMemberId: ((previousTouch ?? {}) as { actor_member_id?: string | null }).actor_member_id ?? null,
      previousAt: ((previousTouch ?? {}) as { occurred_at?: string | null }).occurred_at ?? null,
      assignedMemberId: leadRow.assigned_setter_id ?? leadRow.assigned_closer_id ?? null,
    },
    cursorMemberId: ((cursor ?? {}) as { member_id?: string | null }).member_id ?? null,
    stickyDays: Number(saved.sticky_days ?? values["operators.sticky_days"] ?? 30),
    respectHours,
    now: now.toISOString(),
    historic: false,
    pool: null,
  };
}

function withinHours(member: Record<string, unknown>, now: Date): boolean {
  const zone = typeof member.timezone === "string" && member.timezone ? member.timezone : "UTC";
  const start = typeof member.working_hours_start === "string" ? member.working_hours_start : "08:00";
  const end = typeof member.working_hours_end === "string" ? member.working_hours_end : "18:00";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    if (weekday === "Sat" || weekday === "Sun") return false;
    const current = `${hour}:${minute}`;
    return current >= start.slice(0, 5) && current < end.slice(0, 5);
  } catch {
    return true;
  }
}

export async function previewRouting(
  db: Db,
  orgId: string,
  sample: { source: string | null; service: string | null }
): Promise<{ explanation: string; memberId: string | null; next: string[] }> {
  const base = await loadRoutingInput(db, orgId, "00000000-0000-0000-0000-000000000000").catch(() => null);
  const seed: RoutingInput = base ?? {
    mode: "manual",
    fallbackMode: "manual",
    operators: [],
    rules: [],
    lead: {
      source: sample.source,
      service: sample.service,
      scoreBand: null,
      location: null,
      language: null,
      previousMemberId: null,
      previousAt: null,
      assignedMemberId: null,
    },
    cursorMemberId: null,
    stickyDays: 30,
    respectHours: false,
    now: new Date().toISOString(),
    historic: false,
    pool: null,
  };
  const first = routeLead({
    ...seed,
    lead: { ...seed.lead, source: sample.source, service: sample.service, assignedMemberId: null },
  });
  const names: string[] = [];
  let cursor = seed.cursorMemberId;
  const operators = seed.operators.map((person) => ({ ...person }));
  for (let i = 0; i < 10; i += 1) {
    const decision = routeLead({
      ...seed,
      operators,
      cursorMemberId: cursor,
      lead: { ...seed.lead, source: sample.source, service: sample.service, assignedMemberId: null, previousMemberId: null },
    });
    const person = operators.find((row) => row.memberId === decision.memberId);
    names.push(person ? person.name : "Unassigned");
    if (decision.memberId) {
      cursor = decision.cursorMemberId;
      if (person) person.received += 1;
    }
  }
  return { explanation: first.explanation, memberId: first.memberId, next: names };
}
