import { NOTIFICATION_MAX_ATTEMPTS } from "@/lib/notifications/constants";
import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import type { GhlDb } from "@/lib/ghl/tokens";
import { isLookingAt } from "@/lib/notifications/policy";
import { resolveAtSendTime, type NotificationSendRow } from "@/lib/notifications/resolve";
import { sendOnChannel } from "@/lib/notifications/senders";
import type { NotificationChannel, NotificationStatus } from "@/lib/notifications/types";

const CLAIM_BATCH = 25;

export async function deliverQueuedNotifications(
  db: GhlDb,
  now = new Date()
): Promise<{ claimed: number; sent: number; cancelled: number; failed: number }> {
  let claimed = 0;
  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (let i = 0; i < CLAIM_BATCH; i += 1) {
    const { data: id, error } = await db.rpc("claim_notification");
    if (error) throw new Error(`claim_notification failed: ${error.message}`);
    if (!id) break;
    claimed += 1;
    const outcome = await deliverOne(db, id, now);
    if (outcome === "sent" || outcome === "skipped") sent += 1;
    else if (outcome === "cancelled") cancelled += 1;
    else failed += 1;
  }

  return { claimed, sent, cancelled, failed };
}

export async function deliverOne(
  db: GhlDb,
  id: string,
  now = new Date()
): Promise<"sent" | "skipped" | "cancelled" | "failed" | "dead"> {
  const { data: row } = await db
    .from("notifications")
    .select(
      "id, org_id, event_type, channel, recipient_user_id, recipient_member_id, subject_ids, title, body, href, is_test, is_emergency, attempt_count"
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return "failed";

  const sendRow: NotificationSendRow = {
    id: row.id,
    org_id: row.org_id,
    event_type: row.event_type,
    channel: row.channel,
    recipient_user_id: row.recipient_user_id,
    recipient_member_id: row.recipient_member_id,
    subject_ids: row.subject_ids ?? [],
    title: row.title,
    body: row.body,
    href: row.href,
    is_test: row.is_test,
    is_emergency: row.is_emergency,
  };

  const resolved = await resolveAtSendTime(db, sendRow, now);
  if (!resolved.ok) {
    await mark(db, id, "cancelled", { errorText: resolved.reason });
    return "cancelled";
  }

  const title = resolved.title ?? row.title;
  const body = resolved.body ?? row.body;
  if (resolved.subjectIds) {
    await db
      .from("notifications")
      .update({
        title,
        body,
        subject_ids: resolved.subjectIds,
        updated_at: now.toISOString(),
      })
      .eq("id", id);
  } else if (resolved.title || resolved.body) {
    await db.from("notifications").update({ title, body, updated_at: now.toISOString() }).eq("id", id);
  }

  if (
    row.channel === "push" &&
    !row.is_test &&
    row.recipient_user_id &&
    row.org_id &&
    (await isLookingAt(db, row.recipient_user_id, row.org_id, row.href, now))
  ) {
    await mark(db, id, "skipped", { errorText: "presence", sentAt: now });
    return "skipped";
  }

  let email: string | null = null;
  let phone: string | null = null;
  if (row.recipient_member_id) {
    const { data: member } = await db
      .from("org_members")
      .select("email, phone")
      .eq("id", row.recipient_member_id)
      .maybeSingle();
    email = member?.email ?? null;
    phone = member?.phone ?? null;
  }

  const result = await sendOnChannel(row.channel as NotificationChannel, {
    db,
    orgId: row.org_id,
    userId: row.recipient_user_id,
    email,
    phone,
    title,
    body,
    href: row.href,
    notificationId: row.id,
    eventType: row.event_type,
    items: resolved.items,
  });

  if (result.ok) {
    await mark(db, id, row.channel === "email" ? "sent" : "delivered", {
      sentAt: now,
      providerId: result.providerId,
    });
    return "sent";
  }

  const attempts = row.attempt_count;
  if (!result.retry || shouldMarkDead(attempts, NOTIFICATION_MAX_ATTEMPTS)) {
    await mark(db, id, "dead", { errorText: result.error });
    return "dead";
  }

  const next = nextAttemptAt(attempts, now.getTime());
  await db
    .from("notifications")
    .update({
      status: "queued",
      claimed_at: null,
      send_after: next,
      next_attempt_at: next,
      error_text: result.error,
      updated_at: now.toISOString(),
    })
    .eq("id", id);
  return "failed";
}

async function mark(
  db: GhlDb,
  id: string,
  status: NotificationStatus,
  extra?: { errorText?: string; sentAt?: Date; providerId?: string }
) {
  await db
    .from("notifications")
    .update({
      status,
      error_text: extra?.errorText ?? null,
      sent_at: extra?.sentAt?.toISOString() ?? null,
      delivered_at: status === "delivered" ? extra?.sentAt?.toISOString() ?? null : null,
      provider_id: extra?.providerId ?? null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
