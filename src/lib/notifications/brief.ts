import type { GhlDb } from "@/lib/ghl/tokens";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { OPEN_LEAD_STATUSES } from "@/lib/notifications/constants";
import { notificationHref } from "@/lib/notifications/messages";
import type { MemberNotifyTarget } from "@/lib/notifications/types";

export type BriefItem = { text: string; href: string };

function startOfLocalDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0);
  const asLocal = new Date(utcGuess);
  const shown = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asLocal);
  const hour = Number(shown.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(shown.find((part) => part.type === "minute")?.value ?? 0);
  return new Date(utcGuess - (hour * 60 + minute) * 60_000);
}

export async function collectDailyBriefItems(
  db: GhlDb,
  orgId: string,
  member: MemberNotifyTarget,
  now: Date
): Promise<BriefItem[]> {
  const items: BriefItem[] = [];
  const isSetter = member.role === "setter";
  const isCloser = member.role === "closer";
  const isManager = member.role === "owner" || member.role === "admin";

  if (isSetter) {
    const { data: waiting } = await db
      .from("leads")
      .select("id, opted_in_at")
      .eq("org_id", orgId)
      .is("first_human_touch_at", null)
      .eq("is_test", false)
      .in("status", [...OPEN_LEAD_STATUSES]);
    if (waiting && waiting.length > 0) {
      const oldest = Math.max(
        ...waiting.map((lead) => Math.round((now.getTime() - Date.parse(lead.opted_in_at)) / 60000))
      );
      items.push({
        text: `${waiting.length} waiting for a first touch (${oldest} min oldest)`,
        href: notificationHref("/app/queue"),
      });
    }
    const { count: ready } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("lead_type", "ready_track")
      .is("last_touch_at", null)
      .eq("is_test", false)
      .in("status", [...OPEN_LEAD_STATUSES]);
    if (ready) {
      items.push({
        text: `${ready} ready-track untouched`,
        href: notificationHref("/app/queue"),
      });
    }
    const { count: ghosts } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .not("ghost_approaching_at", "is", null)
      .in("status", [...OPEN_LEAD_STATUSES]);
    if (ghosts) {
      items.push({
        text: `${ghosts} approaching ghost`,
        href: notificationHref("/app/cases"),
      });
    }
    const { count: due } = await db
      .from("next_actions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("owner_member_id", member.memberId)
      .is("completed_at", null)
      .lte("due_at", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
    if (due) {
      items.push({
        text: `${due} commitments due`,
        href: notificationHref("/app/queue"),
      });
    }
  }

  if (isCloser) {
    const dayStart = startOfLocalDay(now, member.hours.timeZone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const { data: calls } = await db
      .from("calls")
      .select("id, lead_id, scheduled_at")
      .eq("org_id", orgId)
      .is("occurred_at", null)
      .gte("scheduled_at", dayStart.toISOString())
      .lt("scheduled_at", dayEnd.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(8);
    for (const call of calls ?? []) {
      items.push({
        text: "Call today — open the brief",
        href: notificationHref(`/app/cases/${call.lead_id}/brief`),
      });
    }
    const { count: drafts } = await db
      .from("follow_up_drafts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending");
    if (drafts) {
      items.push({
        text: `${drafts} drafts pending approval`,
        href: notificationHref("/app/cases"),
      });
    }
    const { count: next } = await db
      .from("next_actions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("completed_at", null);
    if (next) {
      items.push({
        text: `${next} leads awaiting a next step`,
        href: notificationHref("/app/cases"),
      });
    }
  }

  if (isManager) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { count: overnight } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("first_human_touch_at", null)
      .eq("is_test", false)
      .in("status", [...OPEN_LEAD_STATUSES])
      .lte("opted_in_at", yesterday.toISOString());
    if (overnight) {
      items.push({
        text: `${overnight} breached overnight`,
        href: notificationHref("/app/queue?breached=1"),
      });
    }
    const { data: watch } = await db.rpc("adoption_watch", { p_org_id: orgId });
    const alarms = Array.isArray((watch as { alarms?: unknown } | null)?.alarms)
      ? ((watch as { alarms: unknown[] }).alarms)
      : [];
    if (alarms.length > 0) {
      items.push({
        text: `${alarms.length} adoption signal${alarms.length === 1 ? "" : "s"}`,
        href: notificationHref("/app/reporting/adoption"),
      });
    }
    const health = await loadOrgIngestionHealth(db, orgId);
    if (health.stale) {
      items.push({
        text: "Ingestion is stalled",
        href: notificationHref("/app/settings/integrations"),
      });
    }
    const { count: waiting } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("first_human_touch_at", null)
      .eq("is_test", false)
      .in("status", [...OPEN_LEAD_STATUSES]);
    if (waiting) {
      items.push({
        text: `${waiting} still waiting on speed-to-lead`,
        href: notificationHref("/app/queue?breached=1"),
      });
    }
  }

  return items.filter((item) => item.text.length > 0).slice(0, 12);
}

export function briefIsEmpty(items: BriefItem[]): boolean {
  return items.length === 0;
}
