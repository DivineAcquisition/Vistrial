import { quietSendTime } from "@/lib/compliance/rules";
import { zonedStartOfDay } from "@/lib/home/periods";
import { MIN_SAMPLE_RATE } from "@/lib/sales-os/stats";
import type { BusinessHours } from "@/lib/config/clock";
import { describeBox } from "@/lib/workflows/describe";
import type { Box } from "@/lib/workflows/types";

/**
 * The sales calendar is a view. These functions turn records that already
 * exist into items for one date range. They do not invent events, guess a
 * no-show, or copy notes, transcripts, or message text.
 */

export const CALENDAR_KINDS = ["call", "task", "draft", "window", "workflow", "hold"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const KIND_LABEL: Record<CalendarKind, string> = {
  call: "Call",
  task: "Task",
  draft: "Draft",
  window: "Reply due",
  workflow: "Workflow",
  hold: "Hold",
};

export const TIER_COLOR: Record<string, string> = {
  hot: "var(--color-flag-critical)",
  warm: "var(--color-flag-warning)",
  cool: "var(--color-brand-400)",
  cold: "var(--color-silver)",
  do_not_contact: "var(--color-dim)",
};

const KIND_COLOR: Record<CalendarKind, string> = {
  call: "var(--color-brand-500)",
  task: "var(--color-brand-300)",
  draft: "var(--color-flag-warning)",
  window: "var(--color-flag-critical)",
  workflow: "var(--color-brand-700)",
  hold: "var(--color-dim)",
};

const REP_COLORS = [
  "var(--color-brand-300)",
  "var(--color-brand-500)",
  "var(--color-flag-good)",
  "var(--color-flag-warning)",
  "var(--color-brand-700)",
  "var(--color-silver)",
];

const TASK_TITLE: Record<string, string> = {
  call: "Call",
  follow_up: "Follow-up",
  prepare: "Prepare",
  review: "Review",
  other: "Task",
};

const OUTCOME_LABEL: Record<string, string> = {
  held: "Held",
  no_show: "No-show",
  cancelled: "Canceled",
  rescheduled: "Rescheduled",
};

const WEEKDAY: Record<string, "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

const TEAM_ROLES = new Set(["owner", "admin", "member", "client_viewer"]);

export const DEFAULT_HOURS: BusinessHours = {
  days: {
    mon: [{ start: "08:00", end: "18:00" }],
    tue: [{ start: "08:00", end: "18:00" }],
    wed: [{ start: "08:00", end: "18:00" }],
    thu: [{ start: "08:00", end: "18:00" }],
    fri: [{ start: "08:00", end: "18:00" }],
    sat: [],
    sun: [],
  },
  closures: [],
};

export type CalendarActor = {
  orgId: string;
  memberId: string;
  role: string;
  isStaff: boolean;
};

export type CalendarFilters = {
  repId: string | null;
  kinds: CalendarKind[];
  tiers: string[];
  sources: string[];
  stages: string[];
};

export const EMPTY_FILTERS: CalendarFilters = { repId: null, kinds: [], tiers: [], sources: [], stages: [] };

export type CalendarItemData = {
  kind: CalendarKind;
  kindLabel: string;
  source: string;
  sourceId: string;
  leadId: string | null;
  leadName: string | null;
  leadTimeZone: string | null;
  repId: string | null;
  repName: string | null;
  tier: string | null;
  stage: string | null;
  outcomeLabel: string | null;
  overdue: boolean;
  quietNote: string | null;
  approvalNote: string | null;
  href: string | null;
  past: boolean;
  countsAsBooked: boolean;
};

export type CalendarEventJson = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  resourceId: string | null;
  readOnly: true;
  data: CalendarItemData;
};

export type CapacityCell = { booked: number; label: string | null };

export type CalendarResourceJson = { id: string; title: string; color: string };

export type CalendarBuildResult = {
  events: CalendarEventJson[];
  resources: CalendarResourceJson[];
  capacity: { byDay: Record<string, CapacityCell>; byRep: Record<string, CapacityCell> };
  /** Hours the grid opens and closes, from business hours. */
  dayStartHour: number;
  dayEndHour: number;
};

export type CalendarPayload = CalendarBuildResult & {
  timeZone: string;
  canPickRep: boolean;
  canCreateTask: boolean;
  canCreateHold: boolean;
  quietStart: string;
  quietEnd: string;
  filters: CalendarFilters;
};

export type LeadFact = {
  id: string;
  orgId: string;
  firstName: string | null;
  lastName: string | null;
  timeZone: string | null;
  stage: string | null;
  setterId: string | null;
  closerId: string | null;
  tier: string | null;
};

export type RepFact = { id: string; name: string };

export type CallFact = {
  id: string;
  orgId: string;
  leadId: string;
  scheduledAt: string | null;
  occurredAt: string | null;
  durationSeconds: number | null;
  outcome: string | null;
  ranByMemberId: string | null;
};

export type BlockFact = {
  id: string;
  orgId: string;
  kind: string;
  source: string;
  startsAt: string;
  endsAt: string;
  memberId: string | null;
  leadId: string | null;
  eventStatus: string | null;
};

export type TaskFact = {
  id: string;
  orgId: string;
  leadId: string | null;
  dueAt: string | null;
  taskType: string;
  status: string;
  ownerMemberId: string | null;
  sourceKind: string;
};

export type DraftFact = {
  itemId: string;
  orgId: string;
  status: string;
  assignedMemberId: string | null;
  leadId: string;
  channel: string;
  sendAt: string | null;
};

export type WindowFact = {
  id: string;
  orgId: string;
  leadId: string;
  state: string;
  deadlineAt: string | null;
};

export type WorkflowFact = {
  id: string;
  orgId: string;
  leadId: string;
  status: string;
  nextDueAt: string | null;
  boxTitle: string;
};

export type CalendarBuildInput = {
  orgId: string;
  timeZone: string;
  now: Date;
  range: { start: Date; end: Date };
  filters: CalendarFilters;
  hours: BusinessHours | null;
  /** Daily booked-call target for one rep. Null when the workspace has not set one. */
  dailyCallTarget: number | null;
  quietStart: string;
  quietEnd: string;
  leads: LeadFact[];
  reps: RepFact[];
  calls: CallFact[];
  blocks: BlockFact[];
  tasks: TaskFact[];
  drafts: DraftFact[];
  windows: WindowFact[];
  workflows: WorkflowFact[];
};

/** Owners, members, and staff can look at any rep. A rep can look only at themselves. */
export function scopeRepId(actor: CalendarActor, requested: string | null): string | null {
  const clean = requested && requested.trim() ? requested.trim() : null;
  if (actor.isStaff || TEAM_ROLES.has(actor.role)) return clean;
  if (clean && clean !== actor.memberId) return actor.memberId;
  return clean;
}

export function canPickAnyRep(actor: CalendarActor): boolean {
  return actor.isStaff || TEAM_ROLES.has(actor.role);
}

export function sanitizeFilters(raw: Partial<CalendarFilters> | null | undefined, actor: CalendarActor): CalendarFilters {
  const kinds = Array.isArray(raw?.kinds)
    ? raw.kinds.filter((kind): kind is CalendarKind => (CALENDAR_KINDS as readonly string[]).includes(kind))
    : [];
  return {
    repId: scopeRepId(actor, typeof raw?.repId === "string" ? raw.repId : null),
    kinds,
    tiers: cleanList(raw?.tiers),
    sources: cleanList(raw?.sources),
    stages: cleanList(raw?.stages),
  };
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string" && value.length > 0 && value.length < 80).slice(0, 20);
}

export function personName(first: string | null, last: string | null, fallback: string): string {
  const name = [first, last]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim().slice(0, 80))
    .filter(Boolean)
    .join(" ");
  return name || fallback;
}

/** The stored outcome, in the words the record uses. Unknown values stay blank. */
export function outcomeLabel(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  return OUTCOME_LABEL[outcome] ?? null;
}

export function taskTitle(taskType: string): string {
  return TASK_TITLE[taskType] ?? "Task";
}

export function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function clockLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at).replace(/\u202f/g, " ");
}

export function whenLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

export function workingBounds(hours: BusinessHours | null): { start: number; end: number } {
  const days = (hours ?? DEFAULT_HOURS).days;
  let start = 8;
  let end = 18;
  let saw = false;
  for (const intervals of Object.values(days)) {
    for (const interval of intervals ?? []) {
      const open = Number(interval.start.slice(0, 2));
      const close = Number(interval.end.slice(0, 2));
      if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
      if (!saw) {
        start = open;
        end = close === 0 ? 24 : close;
        saw = true;
      } else {
        start = Math.min(start, open);
        end = Math.max(end, close === 0 ? 24 : close);
      }
    }
  }
  if (!saw || end <= start) return { start: 8, end: 18 };
  return { start: Math.max(0, Math.min(23, start)), end: Math.max(start + 1, Math.min(24, end)) };
}

export function isWorkingDay(at: Date, timeZone: string, hours: BusinessHours | null): boolean {
  const schedule = hours ?? DEFAULT_HOURS;
  const key = dayKey(at, timeZone);
  if (schedule.closures?.some((closure) => closure.date === key)) return false;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);
  const name = WEEKDAY[weekday];
  if (!name) return false;
  return (schedule.days[name] ?? []).length > 0;
}

/**
 * A day or rep badge. A zero day says so. A day past the target says so.
 * A percentage is never returned: a thin sample must not become a rate, and
 * this view does not show rates at all.
 */
export function capacityLabel(booked: number, target: number | null, working: boolean): string | null {
  if (!working) return null;
  if (booked <= 0) return "No calls booked";
  if (target != null && target > 0 && booked > target) return "Over target";
  return null;
}

/** Kept so a caller cannot format a thin sample as a percentage. Always null. */
export function coverageRateText(part: number, whole: number): null {
  if (whole < MIN_SAMPLE_RATE || part < 0) return null;
  return null;
}

export function draftSchedule(args: {
  now: Date;
  sendAt: string | null;
  quietStart: string;
  quietEnd: string;
  leadZone: string | null;
  workspaceZone: string;
}): { at: Date; quietNote: string | null } {
  const intended = args.sendAt ? new Date(args.sendAt) : args.now;
  const zone = args.leadZone || args.workspaceZone;
  const at = quietSendTime({
    now: Number.isNaN(intended.getTime()) ? args.now : intended,
    rules: { quietHours: { start: args.quietStart, end: args.quietEnd }, basis: "lead_local" },
    leadZones: [zone],
    workspaceTimeZone: args.workspaceZone,
  });
  if (at.getTime() === (Number.isNaN(intended.getTime()) ? args.now : intended).getTime()) {
    return { at, quietNote: null };
  }
  return { at, quietNote: `Will send at ${clockLabel(at, zone)}` };
}

/** Lead id and send time only. Message text is dropped here and never read again. */
export function draftFacts(value: unknown): Array<{ leadId: string; channel: string; sendAt: string | null }> {
  if (!Array.isArray(value)) return [];
  const facts: Array<{ leadId: string; channel: string; sendAt: string | null }> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const leadId = typeof row.leadId === "string" ? row.leadId : "";
    const channel = row.channel === "sms" || row.channel === "email" ? row.channel : "";
    if (!leadId || !channel) continue;
    const result = row.result && typeof row.result === "object" ? (row.result as Record<string, unknown>) : null;
    const status = result?.status;
    if (status === "sent" || status === "scheduled" || status === "skipped") continue;
    const sendAt = typeof result?.sendAt === "string" ? result.sendAt : null;
    facts.push({ leadId, channel, sendAt });
  }
  return facts;
}

/** The box's plain title. Free text inside the box is not used. */
export function workflowBoxTitle(graph: unknown, boxId: string): string {
  if (!graph || typeof graph !== "object") return "Workflow step";
  const boxes = (graph as { boxes?: unknown }).boxes;
  if (!Array.isArray(boxes)) return "Workflow step";
  const box = boxes.find((entry) => entry && typeof entry === "object" && (entry as { id?: string }).id === boxId);
  if (!box || typeof box !== "object") return "Workflow step";
  const config = (box as { config?: { kind?: string } }).config;
  if (!config || typeof config.kind !== "string") return "Workflow step";
  try {
    const title = describeBox(box as Box).title.trim();
    return title || "Workflow step";
  } catch {
    return "Workflow step";
  }
}

export function initialRange(timeZone: string, now: Date, weekStartsOn: 0 | 1 = 0): { start: string; end: string } {
  const key = dayKey(now, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const start = zonedStartOfDay(timeZone, year, month, day);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const delta = (index - weekStartsOn + 7) % 7;
  const weekStart = new Date(start.getTime() - delta * 86_400_000);
  const end = new Date(weekStart.getTime() + 42 * 86_400_000);
  return { start: weekStart.toISOString(), end: end.toISOString() };
}

export function buildSalesCalendar(input: CalendarBuildInput): CalendarBuildResult {
  const zone = input.timeZone || "America/New_York";
  const hours = input.hours ?? DEFAULT_HOURS;
  const bounds = workingBounds(hours);
  const leads = new Map(input.leads.filter((lead) => lead.orgId === input.orgId).map((lead) => [lead.id, lead]));
  const reps = new Map(input.reps.map((rep) => [rep.id, rep.name]));
  const events: CalendarEventJson[] = [];

  const leadOf = (id: string | null) => (id ? leads.get(id) ?? null : null);
  const nameOf = (lead: LeadFact | null) => (lead ? personName(lead.firstName, lead.lastName, "Unnamed lead") : null);
  const repOf = (memberId: string | null, lead: LeadFact | null) => {
    if (memberId && reps.has(memberId)) return memberId;
    if (lead?.closerId && reps.has(lead.closerId)) return lead.closerId;
    if (lead?.setterId && reps.has(lead.setterId)) return lead.setterId;
    return memberId && reps.has(memberId) ? memberId : null;
  };

  const push = (event: Omit<CalendarEventJson, "readOnly" | "color"> & { color?: string }) => {
    if (event.data && event.start && event.end) events.push({ ...event, readOnly: true, color: event.color ?? KIND_COLOR[event.data.kind] });
  };

  for (const call of input.calls) {
    if (call.orgId !== input.orgId) continue;
    const lead = leadOf(call.leadId);
    if (!lead) continue;
    const when = call.scheduledAt ?? call.occurredAt;
    if (!when) continue;
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) continue;
    const end = endFrom(start, call.durationSeconds);
    if (!overlaps(start, end, input.range)) continue;
    const outcome = outcomeLabel(call.outcome);
    const repId = repOf(call.ranByMemberId, lead);
    push({
      id: `call:${call.id}`,
      title: `Call: ${nameOf(lead)}`,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      color: (lead.tier && TIER_COLOR[lead.tier]) || KIND_COLOR.call,
      resourceId: repId,
      data: item({
        kind: "call",
        source: "calls",
        sourceId: call.id,
        lead,
        repId,
        reps,
        outcome,
        overdue: false,
        quietNote: null,
        approvalNote: null,
        href: `/app/cases/${lead.id}`,
        past: end.getTime() <= input.now.getTime(),
        countsAsBooked: Boolean(call.scheduledAt) && call.outcome !== "cancelled",
      }),
    });
  }

  for (const block of input.blocks) {
    if (block.orgId !== input.orgId) continue;
    const start = new Date(block.startsAt);
    const end = new Date(block.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    if (!overlaps(start, end, input.range)) continue;
    const lead = leadOf(block.leadId);
    if (block.leadId && !lead) continue;
    const repId = repOf(block.memberId, lead);
    if (block.kind === "hold") {
      const repName = repId ? reps.get(repId) ?? "Team" : "Team";
      push({
        id: `hold:${block.id}`,
        title: `Hold: ${repName}`,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        resourceId: repId,
        data: item({
          kind: "hold",
          source: block.source || "person",
          sourceId: block.id,
          lead,
          repId,
          reps,
          outcome: null,
          overdue: false,
          quietNote: null,
          approvalNote: null,
          href: lead ? `/app/cases/${lead.id}` : null,
          past: end.getTime() <= input.now.getTime(),
          countsAsBooked: false,
        }),
      });
      continue;
    }
    if (block.kind === "availability") {
      push({
        id: `block:${block.id}`,
        title: "Block",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        color: KIND_COLOR.hold,
        resourceId: repId,
        data: item({
          kind: "hold",
          source: block.source || "calendar",
          sourceId: block.id,
          lead,
          repId,
          reps,
          outcome: null,
          overdue: false,
          quietNote: null,
          approvalNote: null,
          href: lead ? `/app/cases/${lead.id}` : null,
          past: end.getTime() <= input.now.getTime(),
          countsAsBooked: false,
        }),
      });
      continue;
    }
    if (block.kind !== "booked" && block.kind !== "no_show") continue;
    const outcome = block.kind === "no_show" ? "No-show" : block.eventStatus === "canceled" ? "Canceled" : null;
    const leadName = nameOf(lead);
    push({
      id: `block:${block.id}`,
      title: leadName ? `Call: ${leadName}` : "Call",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      color: (lead?.tier && TIER_COLOR[lead.tier]) || KIND_COLOR.call,
      resourceId: repId,
      data: item({
        kind: "call",
        source: block.source || "calendar",
        sourceId: block.id,
        lead,
        repId,
        reps,
        outcome,
        overdue: false,
        quietNote: null,
        approvalNote: null,
        href: lead ? `/app/cases/${lead.id}` : null,
        past: end.getTime() <= input.now.getTime(),
        countsAsBooked: false,
      }),
    });
  }

  for (const task of input.tasks) {
    if (task.orgId !== input.orgId || task.status === "canceled" || !task.dueAt) continue;
    const lead = leadOf(task.leadId);
    if (task.leadId && !lead) continue;
    const due = new Date(task.dueAt);
    if (Number.isNaN(due.getTime())) continue;
    const key = dayKey(due, zone);
    const midnight = midnightOf(key, zone);
    const allDay = Math.abs(due.getTime() - midnight.getTime()) < 60_000;
    const start = allDay ? midnight : due;
    const end = allDay ? midnightOf(nextKey(key), zone) : new Date(due.getTime() + 30 * 60_000);
    if (!overlaps(start, end, input.range)) continue;
    const open = task.status === "open" || task.status === "suggested" || task.status === "snoozed";
    const repId = repOf(task.ownerMemberId, lead);
    push({
      id: `task:${task.id}`,
      title: taskTitle(task.taskType),
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
      resourceId: repId,
      data: item({
        kind: "task",
        source: task.sourceKind || "person",
        sourceId: task.id,
        lead,
        repId,
        reps,
        outcome: null,
        overdue: open && due.getTime() < input.now.getTime(),
        quietNote: null,
        approvalNote: null,
        href: lead ? `/app/cases/${lead.id}` : "/app/tasks",
        past: end.getTime() <= input.now.getTime(),
        countsAsBooked: false,
      }),
    });
  }

  for (const draft of input.drafts) {
    if (draft.orgId !== input.orgId) continue;
    if (draft.status !== "pending" && draft.status !== "failed") continue;
    if (draft.channel !== "sms" && draft.channel !== "email") continue;
    const lead = leadOf(draft.leadId);
    if (!lead) continue;
    const scheduled = draftSchedule({
      now: input.now,
      sendAt: draft.sendAt,
      quietStart: input.quietStart || "20:00",
      quietEnd: input.quietEnd || "08:00",
      leadZone: lead.timeZone,
      workspaceZone: zone,
    });
    const start = scheduled.at;
    const end = new Date(start.getTime() + 30 * 60_000);
    if (!overlaps(start, end, input.range)) continue;
    const repId = repOf(draft.assignedMemberId, lead);
    push({
      id: `draft:${draft.itemId}:${draft.leadId}`,
      title: `Draft ready: ${nameOf(lead)}`,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      resourceId: repId,
      data: item({
        kind: "draft",
        source: "approval",
        sourceId: draft.itemId,
        lead,
        repId,
        reps,
        outcome: null,
        overdue: false,
        quietNote: scheduled.quietNote,
        approvalNote: "Approval is still needed.",
        href: `/app/home#approval-${draft.itemId}`,
        past: false,
        countsAsBooked: false,
      }),
    });
  }

  for (const window of input.windows) {
    if (window.orgId !== input.orgId) continue;
    if (window.state !== "on_time" && window.state !== "at_risk") continue;
    if (!window.deadlineAt) continue;
    const lead = leadOf(window.leadId);
    if (!lead) continue;
    const deadline = new Date(window.deadlineAt);
    if (Number.isNaN(deadline.getTime())) continue;
    const start = new Date(deadline.getTime() - 30 * 60_000);
    if (!overlaps(start, deadline, input.range)) continue;
    const repId = repOf(null, lead);
    push({
      id: `window:${window.id}`,
      title: `Reply due: ${nameOf(lead)}`,
      start: start.toISOString(),
      end: deadline.toISOString(),
      allDay: false,
      resourceId: repId,
      data: item({
        kind: "window",
        source: "sentry",
        sourceId: window.id,
        lead,
        repId,
        reps,
        outcome: null,
        overdue: window.state === "at_risk",
        quietNote: null,
        approvalNote: null,
        href: `/app/cases/${lead.id}`,
        past: deadline.getTime() <= input.now.getTime(),
        countsAsBooked: false,
      }),
    });
  }

  for (const step of input.workflows) {
    if (step.orgId !== input.orgId || step.status !== "active" || !step.nextDueAt) continue;
    const lead = leadOf(step.leadId);
    if (!lead) continue;
    const due = new Date(step.nextDueAt);
    if (Number.isNaN(due.getTime())) continue;
    const end = new Date(due.getTime() + 30 * 60_000);
    if (!overlaps(due, end, input.range)) continue;
    const title = step.boxTitle.trim() || "Workflow step";
    const repId = repOf(null, lead);
    push({
      id: `workflow:${step.id}`,
      title: `${title}: ${nameOf(lead)}`,
      start: due.toISOString(),
      end: end.toISOString(),
      allDay: false,
      resourceId: repId,
      data: item({
        kind: "workflow",
        source: "workflow",
        sourceId: step.id,
        lead,
        repId,
        reps,
        outcome: null,
        overdue: due.getTime() < input.now.getTime(),
        quietNote: null,
        approvalNote: null,
        href: `/app/cases/${lead.id}`,
        past: end.getTime() <= input.now.getTime(),
        countsAsBooked: false,
      }),
    });
  }

  const capacity = capacityFor(events, input, zone, hours);
  const visible = events.filter((event) => matches(event, input.filters));
  visible.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

  const resources = [...input.reps]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .filter((rep) => !input.filters.repId || rep.id === input.filters.repId)
    .map((rep, index) => ({ id: rep.id, title: rep.name, color: REP_COLORS[index % REP_COLORS.length] }));

  return { events: visible, resources, capacity, dayStartHour: bounds.start, dayEndHour: bounds.end };
}

function item(args: {
  kind: CalendarKind;
  source: string;
  sourceId: string;
  lead: LeadFact | null;
  repId: string | null;
  reps: Map<string, string>;
  outcome: string | null;
  overdue: boolean;
  quietNote: string | null;
  approvalNote: string | null;
  href: string | null;
  past: boolean;
  countsAsBooked: boolean;
}): CalendarItemData {
  return {
    kind: args.kind,
    kindLabel: KIND_LABEL[args.kind],
    source: args.source,
    sourceId: args.sourceId,
    leadId: args.lead?.id ?? null,
    leadName: args.lead ? personName(args.lead.firstName, args.lead.lastName, "Unnamed lead") : null,
    leadTimeZone: args.lead?.timeZone ?? null,
    repId: args.repId,
    repName: args.repId ? args.reps.get(args.repId) ?? null : null,
    tier: args.lead?.tier ?? null,
    stage: args.lead?.stage ?? null,
    outcomeLabel: args.outcome,
    overdue: args.overdue,
    quietNote: args.quietNote,
    approvalNote: args.approvalNote,
    href: args.href,
    past: args.past,
    countsAsBooked: args.countsAsBooked,
  };
}

function matches(event: CalendarEventJson, filters: CalendarFilters): boolean {
  if (filters.repId && event.resourceId !== filters.repId) return false;
  if (filters.kinds.length > 0 && !filters.kinds.includes(event.data.kind)) return false;
  if (filters.tiers.length > 0 && (!event.data.tier || !filters.tiers.includes(event.data.tier))) return false;
  if (filters.sources.length > 0 && !filters.sources.includes(event.data.source)) return false;
  if (filters.stages.length > 0 && (!event.data.stage || !filters.stages.includes(event.data.stage))) return false;
  return true;
}

function capacityFor(
  events: CalendarEventJson[],
  input: CalendarBuildInput,
  zone: string,
  hours: BusinessHours,
): { byDay: Record<string, CapacityCell>; byRep: Record<string, CapacityCell> } {
  const byDayCount = new Map<string, number>();
  const byRepCount = new Map<string, number>();
  const byRepDay = new Map<string, number>();
  for (const event of events) {
    if (!event.data.countsAsBooked) continue;
    if (input.filters.repId && event.resourceId !== input.filters.repId) continue;
    const key = dayKey(new Date(event.start), zone);
    byDayCount.set(key, (byDayCount.get(key) ?? 0) + 1);
    if (event.resourceId) {
      byRepCount.set(event.resourceId, (byRepCount.get(event.resourceId) ?? 0) + 1);
      const repDay = `${event.resourceId}|${key}`;
      byRepDay.set(repDay, (byRepDay.get(repDay) ?? 0) + 1);
    }
  }
  const byDay: Record<string, CapacityCell> = {};
  const days = daysInRange(input.range, zone);
  for (const key of days) {
    const at = midnightOf(key, zone);
    const booked = byDayCount.get(key) ?? 0;
    byDay[key] = { booked, label: capacityLabel(booked, input.dailyCallTarget, isWorkingDay(at, zone, hours)) };
  }
  const byRep: Record<string, CapacityCell> = {};
  const repIds = input.filters.repId ? [input.filters.repId] : input.reps.map((rep) => rep.id);
  const workingDays = days.filter((key) => isWorkingDay(midnightOf(key, zone), zone, hours));
  for (const repId of repIds) {
    const booked = byRepCount.get(repId) ?? 0;
    let label: string | null = null;
    if (workingDays.length > 0 && booked === 0) label = "No calls booked";
    if (input.dailyCallTarget != null && input.dailyCallTarget > 0) {
      const over = workingDays.some((key) => (byRepDay.get(`${repId}|${key}`) ?? 0) > (input.dailyCallTarget as number));
      if (over) label = "Over target";
    }
    byRep[repId] = { booked, label };
  }
  return { byDay, byRep };
}

function daysInRange(range: { start: Date; end: Date }, zone: string): string[] {
  const keys: string[] = [];
  let cursor = midnightOf(dayKey(range.start, zone), zone);
  const limit = range.end.getTime() + 86_400_000;
  for (let i = 0; i < 70 && cursor.getTime() < limit; i += 1) {
    const key = dayKey(cursor, zone);
    if (!keys.includes(key)) keys.push(key);
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return keys.filter((key) => {
    const start = midnightOf(key, zone);
    const end = new Date(start.getTime() + 20 * 3_600_000);
    return overlaps(start, end, range);
  });
}

function overlaps(start: Date, end: Date, range: { start: Date; end: Date }): boolean {
  return start < range.end && end > range.start;
}

function endFrom(start: Date, durationSeconds: number | null): Date {
  const seconds = durationSeconds && durationSeconds >= 300 && durationSeconds <= 8 * 3600 ? durationSeconds : 30 * 60;
  return new Date(start.getTime() + seconds * 1000);
}

function midnightOf(key: string, zone: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return zonedStartOfDay(zone, year, month, day);
}

function nextKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function repColor(index: number): string {
  return REP_COLORS[index % REP_COLORS.length];
}
