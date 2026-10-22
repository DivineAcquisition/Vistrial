import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessHours } from "@/lib/config/clock";
import { getEffectiveConfig } from "@/lib/config/server";
import { loadGateState } from "@/lib/home/gate";
import type { AuthContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import {
  buildSalesCalendar,
  DEFAULT_HOURS,
  draftFacts,
  sanitizeFilters,
  workflowBoxTitle,
  type CalendarActor,
  type CalendarFilters,
  type CalendarPayload,
  type LeadFact,
  type RepFact,
} from "@/lib/calendar/model";

type Db = SupabaseClient;

const MAX_SPAN_MS = 62 * 86_400_000;
const ROW_CAP = 2000;

export async function salesCalendarEnabled(db: Db, orgId: string): Promise<boolean> {
  const { data } = await db.from("workspace_flags").select("enabled").eq("org_id", orgId).eq("flag", "sales_calendar").maybeSingle();
  return (data as { enabled?: boolean } | null)?.enabled === true;
}

export function actorFrom(ctx: AuthContext): CalendarActor {
  return { orgId: ctx.org.id, memberId: ctx.member.id, role: ctx.role, isStaff: ctx.isStaff };
}

/**
 * Items for one range, read with the asking person's session so row-level
 * security decides every lead. No service-role client on this path.
 */
export async function loadSalesCalendar(
  ctx: AuthContext,
  input: { start: string; end: string; filters?: Partial<CalendarFilters> | null },
): Promise<CalendarPayload | null> {
  const db = (await createClient()) as unknown as Db;
  if (!(await salesCalendarEnabled(db, ctx.org.id))) return null;
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  if (end.getTime() - start.getTime() > MAX_SPAN_MS) return null;

  const actor = actorFrom(ctx);
  const filters = sanitizeFilters(input.filters, actor);
  const orgId = ctx.org.id;
  const timeZone = ctx.org.timezone || "America/New_York";
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [calls, blocks, tasks, items, windows, steps, members, orgRow, gate, hours] = await Promise.all([
    db
      .from("calls")
      .select("id, org_id, lead_id, scheduled_at, occurred_at, duration_seconds, outcome, ran_by_member_id")
      .eq("org_id", orgId)
      .or(`and(scheduled_at.gte.${startIso},scheduled_at.lt.${endIso}),and(occurred_at.gte.${startIso},occurred_at.lt.${endIso})`)
      .limit(ROW_CAP),
    db
      .from("calendar_blocks")
      .select("id, org_id, kind, source, starts_at, ends_at, member_id, lead_id, event_status")
      .eq("org_id", orgId)
      .lt("starts_at", endIso)
      .gt("ends_at", startIso)
      .limit(ROW_CAP),
    db
      .from("next_actions")
      .select("id, org_id, lead_id, due_at, task_type, status, owner_member_id, source_kind")
      .eq("org_id", orgId)
      .gte("due_at", startIso)
      .lt("due_at", endIso)
      .neq("status", "canceled")
      .limit(ROW_CAP),
    db
      .from("approval_items")
      .select("id, org_id, status, assigned_member_id, drafts")
      .eq("org_id", orgId)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("sentry_clocks")
      .select("id, org_id, lead_id, state, deadline_at")
      .eq("org_id", orgId)
      .in("state", ["on_time", "at_risk"])
      .gte("deadline_at", startIso)
      .lt("deadline_at", endIso)
      .limit(ROW_CAP),
    db
      .from("workflow_enrollments")
      .select("id, org_id, lead_id, status, next_due_at, current_box_id, version_id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .gte("next_due_at", startIso)
      .lt("next_due_at", endIso)
      .limit(ROW_CAP),
    db.from("org_members").select("id, display_name, role, active").eq("org_id", orgId).eq("active", true).limit(200),
    db.from("organizations").select("working_hours_start, working_hours_end, working_days").eq("id", orgId).maybeSingle(),
    loadGateState(db, orgId).catch(() => null),
    readHours(db, orgId),
  ]);

  const callRows = rows(calls.data);
  const blockRows = rows(blocks.data);
  const taskRows = rows(tasks.data);
  const itemRows = rows(items.data);
  const windowRows = rows(windows.data);
  const stepRows = rows(steps.data);

  const draftRows = itemRows.flatMap((item) =>
    draftFacts(item.drafts).map((fact) => ({
      itemId: String(item.id),
      orgId,
      status: String(item.status ?? ""),
      assignedMemberId: stringOrNull(item.assigned_member_id),
      leadId: fact.leadId,
      channel: fact.channel,
      sendAt: fact.sendAt,
    })),
  );

  const leadIds = [
    ...callRows.map((row) => stringOrNull(row.lead_id)),
    ...blockRows.map((row) => stringOrNull(row.lead_id)),
    ...taskRows.map((row) => stringOrNull(row.lead_id)),
    ...draftRows.map((row) => row.leadId),
    ...windowRows.map((row) => stringOrNull(row.lead_id)),
    ...stepRows.map((row) => stringOrNull(row.lead_id)),
  ].filter((id): id is string => Boolean(id));

  const leads = await loadLeads(db, orgId, leadIds);
  const graphs = await loadBoxTitles(db, orgId, stepRows);
  const reps = memberReps(rows(members.data));
  const quietStart = gate?.limits.quietHoursStart ?? "20:00";
  const quietEnd = gate?.limits.quietHoursEnd ?? "08:00";

  const built = buildSalesCalendar({
    orgId,
    timeZone,
    now: new Date(),
    range: { start, end },
    filters,
    hours: hours ?? hoursFromOrg(orgRow.data as OrgHours | null),
    dailyCallTarget: null,
    quietStart,
    quietEnd,
    leads,
    reps,
    calls: callRows.map((row) => ({
      id: String(row.id),
      orgId,
      leadId: String(row.lead_id),
      scheduledAt: stringOrNull(row.scheduled_at),
      occurredAt: stringOrNull(row.occurred_at),
      durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
      outcome: stringOrNull(row.outcome),
      ranByMemberId: stringOrNull(row.ran_by_member_id),
    })),
    blocks: blockRows.map((row) => ({
      id: String(row.id),
      orgId,
      kind: String(row.kind ?? ""),
      source: String(row.source ?? "calendar"),
      startsAt: String(row.starts_at ?? ""),
      endsAt: String(row.ends_at ?? ""),
      memberId: stringOrNull(row.member_id),
      leadId: stringOrNull(row.lead_id),
      eventStatus: stringOrNull(row.event_status),
    })),
    tasks: taskRows.map((row) => ({
      id: String(row.id),
      orgId,
      leadId: stringOrNull(row.lead_id),
      dueAt: stringOrNull(row.due_at),
      taskType: String(row.task_type ?? "other"),
      status: String(row.status ?? ""),
      ownerMemberId: stringOrNull(row.owner_member_id),
      sourceKind: String(row.source_kind ?? "person"),
    })),
    drafts: draftRows,
    windows: windowRows.map((row) => ({
      id: String(row.id),
      orgId,
      leadId: String(row.lead_id),
      state: String(row.state ?? ""),
      deadlineAt: stringOrNull(row.deadline_at),
    })),
    workflows: stepRows.map((row) => ({
      id: String(row.id),
      orgId,
      leadId: String(row.lead_id),
      status: String(row.status ?? ""),
      nextDueAt: stringOrNull(row.next_due_at),
      boxTitle: graphs.get(String(row.version_id) + ":" + String(row.current_box_id)) ?? "Workflow step",
    })),
  });

  return {
    ...built,
    timeZone,
    canPickRep: actor.isStaff || actor.role === "owner" || actor.role === "admin" || actor.role === "member" || actor.role === "client_viewer",
    canCreateTask: true,
    canCreateHold: actor.isStaff || actor.role === "owner" || actor.role === "admin" || actor.role === "member" || actor.role === "setter" || actor.role === "closer" || actor.role === "operator",
    quietStart,
    quietEnd,
    filters,
  };
}

async function loadLeads(db: Db, orgId: string, ids: string[]): Promise<LeadFact[]> {
  const unique = [...new Set(ids)].slice(0, ROW_CAP);
  const found: LeadFact[] = [];
  for (let index = 0; index < unique.length; index += 200) {
    const slice = unique.slice(index, index + 200);
    const [{ data: leadRows }, { data: scores }] = await Promise.all([
      db
        .from("leads")
        .select("id, org_id, first_name, last_name, timezone, pipeline_stage, assigned_setter_id, assigned_closer_id")
        .eq("org_id", orgId)
        .in("id", slice),
      db.from("assay_lead_scores").select("lead_id, display_tier").eq("org_id", orgId).in("lead_id", slice),
    ]);
    const tier = new Map(rows(scores).map((row) => [String(row.lead_id), stringOrNull(row.display_tier)]));
    for (const row of rows(leadRows)) {
      found.push({
        id: String(row.id),
        orgId,
        firstName: stringOrNull(row.first_name),
        lastName: stringOrNull(row.last_name),
        timeZone: stringOrNull(row.timezone),
        stage: stringOrNull(row.pipeline_stage),
        setterId: stringOrNull(row.assigned_setter_id),
        closerId: stringOrNull(row.assigned_closer_id),
        tier: tier.get(String(row.id)) ?? null,
      });
    }
  }
  return found;
}

async function loadBoxTitles(db: Db, orgId: string, steps: Array<Record<string, unknown>>): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const versionIds = [...new Set(steps.map((row) => stringOrNull(row.version_id)).filter((id): id is string => Boolean(id)))];
  if (versionIds.length === 0) return titles;
  const { data } = await db.from("playbook_versions").select("id, graph").eq("org_id", orgId).in("id", versionIds.slice(0, 50));
  const graphs = new Map(rows(data).map((row) => [String(row.id), row.graph]));
  for (const step of steps) {
    const versionId = stringOrNull(step.version_id);
    const boxId = stringOrNull(step.current_box_id);
    if (!versionId || !boxId) continue;
    titles.set(`${versionId}:${boxId}`, workflowBoxTitle(graphs.get(versionId), boxId));
  }
  return titles;
}

async function readHours(db: Db, orgId: string): Promise<BusinessHours | null> {
  try {
    const config = await getEffectiveConfig(db, orgId);
    const value = config.values["identity.business_hours"];
    if (isHours(value)) return value;
  } catch {
    return null;
  }
  return null;
}

function isHours(value: unknown): value is BusinessHours {
  if (!value || typeof value !== "object") return false;
  return "days" in value && typeof (value as { days?: unknown }).days === "object";
}

type OrgHours = {
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  working_days?: number[] | null;
};

function hoursFromOrg(row: OrgHours | null): BusinessHours {
  if (!row?.working_hours_start || !row.working_hours_end || !row.working_days?.length) return DEFAULT_HOURS;
  const numberToName: Record<number, "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"> = {
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
    7: "sun",
  };
  const open = new Set(row.working_days.map((day) => numberToName[day]).filter(Boolean));
  const interval = [{ start: row.working_hours_start.slice(0, 5), end: row.working_hours_end.slice(0, 5) }];
  return {
    days: {
      sun: open.has("sun") ? interval : [],
      mon: open.has("mon") ? interval : [],
      tue: open.has("tue") ? interval : [],
      wed: open.has("wed") ? interval : [],
      thu: open.has("thu") ? interval : [],
      fri: open.has("fri") ? interval : [],
      sat: open.has("sat") ? interval : [],
    },
    closures: [],
  };
}

function memberReps(members: Array<Record<string, unknown>>): RepFact[] {
  return members
    .filter((row) => typeof row.id === "string" && typeof row.display_name === "string")
    .map((row) => ({ id: String(row.id), name: String(row.display_name).replace(/\s+/g, " ").trim().slice(0, 80) || "Teammate" }));
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
