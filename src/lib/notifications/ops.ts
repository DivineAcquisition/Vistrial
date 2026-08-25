import type { GhlDb } from "@/lib/ghl/tokens";
import {
  FATIGUE_OVERFLOW_DAYS,
  FATIGUE_PUSH_PER_DAY,
} from "@/lib/notifications/constants";
import type { NotificationEventType } from "@/lib/notifications/types";

export type OpsOrgVolume = {
  orgId: string;
  orgName: string;
  total: number;
  push: number;
  dead: number;
  overflow: number;
  fatigue: boolean;
  unresolvedBreaches: number;
  failingPush: boolean;
};

export type OpsEventEngagement = {
  eventType: NotificationEventType;
  delivered: number;
  opened: number;
  acted: number;
  actionRate: number | null;
  noisy: boolean;
};

export type OpsDeadRow = {
  id: string;
  orgId: string | null;
  orgName: string | null;
  eventType: NotificationEventType;
  channel: string;
  error: string | null;
  queuedAt: string;
};

export async function loadOpsNotificationState(db: GhlDb, now = new Date()) {
  const since = new Date(now.getTime() - FATIGUE_OVERFLOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orgs } = await db.from("organizations").select("id, name");
  const orgName = new Map((orgs ?? []).map((org) => [org.id, org.name]));

  const { data: rows } = await db
    .from("notifications")
    .select("id, org_id, event_type, channel, status, queued_at, sent_at, error_text, is_test")
    .eq("is_test", false)
    .gte("queued_at", since);

  const byOrg = new Map<string, OpsOrgVolume>();
  for (const org of orgs ?? []) {
    byOrg.set(org.id, {
      orgId: org.id,
      orgName: org.name,
      total: 0,
      push: 0,
      dead: 0,
      overflow: 0,
      fatigue: false,
      unresolvedBreaches: 0,
      failingPush: false,
    });
  }

  const eventStats = new Map<
    NotificationEventType,
    { delivered: number; opened: number; acted: number }
  >();

  for (const row of rows ?? []) {
    if (row.org_id) {
      const bucket = byOrg.get(row.org_id);
      if (bucket) {
        bucket.total += 1;
        if (row.channel === "push") bucket.push += 1;
        if (row.status === "dead") bucket.dead += 1;
        if (row.event_type === "hourly_summary") bucket.overflow += 1;
        if (row.channel === "push" && row.status === "dead") bucket.failingPush = true;
      }
    }
    const stats = eventStats.get(row.event_type) ?? { delivered: 0, opened: 0, acted: 0 };
    if (["sent", "delivered", "opened", "acted"].includes(row.status)) stats.delivered += 1;
    if (row.status === "opened" || row.status === "acted") stats.opened += 1;
    if (row.status === "acted") stats.acted += 1;
    eventStats.set(row.event_type, stats);
  }

  const { data: breachNotes } = await db
    .from("notifications")
    .select("org_id, subject_ids")
    .eq("event_type", "speed_to_lead")
    .in("status", ["sent", "delivered", "opened", "acted"])
    .gte("queued_at", since);

  const leadIdsByOrg = new Map<string, string[]>();
  for (const note of breachNotes ?? []) {
    if (!note.org_id) continue;
    const list = leadIdsByOrg.get(note.org_id) ?? [];
    for (const id of note.subject_ids ?? []) list.push(id);
    leadIdsByOrg.set(note.org_id, list);
  }

  for (const [orgId, ids] of leadIdsByOrg) {
    const unique = [...new Set(ids)].slice(0, 200);
    if (unique.length === 0) continue;
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("id", unique)
      .is("first_human_touch_at", null);
    const bucket = byOrg.get(orgId);
    if (bucket) bucket.unresolvedBreaches = count ?? 0;
  }

  const volumes = [...byOrg.values()].map((row) => {
    const perDay = row.push / FATIGUE_OVERFLOW_DAYS;
    row.fatigue = row.overflow > 0 || perDay > FATIGUE_PUSH_PER_DAY;
    return row;
  });

  const engagement: OpsEventEngagement[] = [...eventStats.entries()].map(([eventType, stats]) => {
    const actionRate = stats.delivered === 0 ? null : stats.acted / stats.delivered;
    return {
      eventType,
      delivered: stats.delivered,
      opened: stats.opened,
      acted: stats.acted,
      actionRate,
      noisy: stats.delivered >= 20 && (actionRate ?? 0) < 0.05,
    };
  });

  const { data: dead } = await db
    .from("notifications")
    .select("id, org_id, event_type, channel, error_text, queued_at")
    .eq("status", "dead")
    .order("queued_at", { ascending: false })
    .limit(40);

  const deadRows: OpsDeadRow[] = (dead ?? []).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    orgName: row.org_id ? orgName.get(row.org_id) ?? null : null,
    eventType: row.event_type,
    channel: row.channel,
    error: row.error_text,
    queuedAt: row.queued_at,
  }));

  return { volumes, engagement, deadRows };
}
