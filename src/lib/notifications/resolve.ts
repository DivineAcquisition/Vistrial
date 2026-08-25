import type { GhlDb } from "@/lib/ghl/tokens";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { OPEN_LEAD_STATUSES } from "@/lib/notifications/constants";
import { resolveWorkingHours } from "@/lib/notifications/hours";
import { collectDailyBriefItems } from "@/lib/notifications/brief";
import { speedToLeadCopy } from "@/lib/notifications/messages";
import type { NotificationEventType } from "@/lib/notifications/types";

export type NotificationSendRow = {
  id: string;
  org_id: string | null;
  event_type: NotificationEventType;
  channel: string;
  recipient_user_id: string | null;
  recipient_member_id: string | null;
  subject_ids: string[];
  title: string;
  body: string;
  href: string;
  is_test: boolean;
  is_emergency: boolean;
};

export type ResolveResult =
  | { ok: true; title?: string; body?: string; subjectIds?: string[]; items?: Array<{ text: string; href: string }> }
  | { ok: false; reason: string };

export async function resolveAtSendTime(
  db: GhlDb,
  row: NotificationSendRow,
  now = new Date()
): Promise<ResolveResult> {
  if (row.is_test) return { ok: true };

  switch (row.event_type) {
    case "speed_to_lead":
      return resolveSpeedToLead(db, row, now);
    case "unassigned_ready":
      return resolveUnassigned(db, row);
    case "approaching_ghost":
      return resolveGhosts(db, row);
    case "pending_draft":
      return resolveDraft(db, row);
    case "call_starting_soon":
      return resolveCall(db, row, now);
    case "unmatched_transcript":
      return resolveUnmatched(db, row);
    case "ingestion_stalled":
      return resolveIngestion(db, row);
    case "crm_broken":
      return resolveCrm(db, row);
    case "daily_brief":
      return resolveBrief(db, row, now);
    case "adoption_warning":
      return resolveAdoption(db, row);
    case "job_failure":
    case "hourly_summary":
    case "test_send":
      return { ok: true };
    default:
      return { ok: true };
  }
}

async function resolveSpeedToLead(
  db: GhlDb,
  row: NotificationSendRow,
  now: Date
): Promise<ResolveResult> {
  if (!row.org_id || row.subject_ids.length === 0) return { ok: false, reason: "resolved" };
  const { data: leads } = await db
    .from("leads")
    .select("id, first_name, first_human_touch_at, opted_in_at, status")
    .eq("org_id", row.org_id)
    .in("id", row.subject_ids);
  const open = (leads ?? []).filter(
    (lead) =>
      !lead.first_human_touch_at &&
      OPEN_LEAD_STATUSES.includes(lead.status as (typeof OPEN_LEAD_STATUSES)[number])
  );
  if (open.length === 0) return { ok: false, reason: "resolved" };
  const minutes = Math.max(
    ...open.map((lead) => Math.round((now.getTime() - Date.parse(lead.opted_in_at)) / 60000))
  );
  const copy = speedToLeadCopy(
    open.map((lead) => lead.first_name ?? "a lead"),
    minutes
  );
  return { ok: true, title: copy.title, body: copy.body, subjectIds: open.map((lead) => lead.id) };
}

async function resolveUnassigned(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  const id = row.subject_ids[0];
  if (!id || !row.org_id) return { ok: false, reason: "resolved" };
  const { data: lead } = await db
    .from("leads")
    .select("assigned_setter_id, lead_type, status")
    .eq("id", id)
    .eq("org_id", row.org_id)
    .maybeSingle();
  if (!lead) return { ok: false, reason: "resolved" };
  if (lead.assigned_setter_id) return { ok: false, reason: "resolved" };
  if (lead.lead_type !== "ready_track") return { ok: false, reason: "resolved" };
  if (!OPEN_LEAD_STATUSES.includes(lead.status as (typeof OPEN_LEAD_STATUSES)[number])) {
    return { ok: false, reason: "resolved" };
  }
  return { ok: true };
}

async function resolveGhosts(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  if (!row.org_id) return { ok: false, reason: "resolved" };
  const { count } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", row.org_id)
    .not("ghost_approaching_at", "is", null)
    .in("status", [...OPEN_LEAD_STATUSES]);
  if (!count) return { ok: false, reason: "resolved" };
  return { ok: true };
}

async function resolveDraft(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  const id = row.subject_ids[0];
  if (!id) return { ok: false, reason: "resolved" };
  const { data: draft } = await db
    .from("follow_up_drafts")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (draft?.status !== "pending") return { ok: false, reason: "resolved" };
  return { ok: true };
}

async function resolveCall(db: GhlDb, row: NotificationSendRow, now: Date): Promise<ResolveResult> {
  const id = row.subject_ids[0];
  if (!id) return { ok: false, reason: "resolved" };
  const { data: call } = await db
    .from("calls")
    .select("occurred_at, scheduled_at, outcome")
    .eq("id", id)
    .maybeSingle();
  if (!call) return { ok: false, reason: "resolved" };
  if (call.occurred_at || call.outcome) return { ok: false, reason: "resolved" };
  if (call.scheduled_at && Date.parse(call.scheduled_at) < now.getTime() - 5 * 60_000) {
    return { ok: false, reason: "resolved" };
  }
  return { ok: true };
}

async function resolveUnmatched(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  if (!row.org_id) return { ok: false, reason: "resolved" };
  const { count } = await db
    .from("unmatched_transcripts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", row.org_id)
    .eq("status", "open");
  if (!count) return { ok: false, reason: "resolved" };
  return { ok: true };
}

async function resolveIngestion(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  if (!row.org_id) return { ok: false, reason: "resolved" };
  const health = await loadOrgIngestionHealth(db, row.org_id);
  if (!health.stale) return { ok: false, reason: "resolved" };
  return { ok: true };
}

async function resolveCrm(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  if (!row.org_id) return { ok: false, reason: "resolved" };
  const { data: connection } = await db
    .from("ghl_connections")
    .select("status")
    .eq("org_id", row.org_id)
    .maybeSingle();
  if (connection?.status !== "broken") return { ok: false, reason: "resolved" };
  return { ok: true };
}

async function resolveBrief(
  db: GhlDb,
  row: NotificationSendRow,
  now: Date
): Promise<ResolveResult> {
  if (!row.org_id || !row.recipient_member_id) return { ok: false, reason: "empty_brief" };
  const { data: member } = await db
    .from("org_members")
    .select("id, user_id, role, email, phone, timezone, working_hours_start, working_hours_end, working_days")
    .eq("id", row.recipient_member_id)
    .maybeSingle();
  const { data: org } = await db
    .from("organizations")
    .select("timezone, working_hours_start, working_hours_end, working_days")
    .eq("id", row.org_id)
    .maybeSingle();
  if (!member || !org) return { ok: false, reason: "empty_brief" };
  const target = {
    memberId: member.id,
    userId: member.user_id,
    role: member.role,
    email: member.email,
    phone: member.phone,
    hours: resolveWorkingHours({
      orgTimeZone: org.timezone,
      orgStart: org.working_hours_start?.slice(0, 5),
      orgEnd: org.working_hours_end?.slice(0, 5),
      orgDays: org.working_days,
      memberTimeZone: member.timezone,
      memberStart: member.working_hours_start?.slice(0, 5),
      memberEnd: member.working_hours_end?.slice(0, 5),
      memberDays: member.working_days,
    }),
  };
  const items = await collectDailyBriefItems(db, row.org_id, target, now);
  if (items.length === 0) return { ok: false, reason: "empty_brief" };
  return {
    ok: true,
    body: items.map((item) => item.text).join(" · "),
    items,
  };
}

async function resolveAdoption(db: GhlDb, row: NotificationSendRow): Promise<ResolveResult> {
  if (!row.org_id) return { ok: false, reason: "resolved" };
  const { data: watch } = await db.rpc("adoption_watch", { p_org_id: row.org_id });
  const alarms = Array.isArray((watch as { alarms?: unknown } | null)?.alarms)
    ? ((watch as { alarms: unknown[] }).alarms)
    : [];
  if (alarms.length === 0) return { ok: false, reason: "resolved" };
  return { ok: true };
}
