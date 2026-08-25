import type { GhlDb } from "@/lib/ghl/tokens";
import { assertLockScreenSafe } from "@/lib/notifications/copy";
import type { EnqueueInput } from "@/lib/notifications/types";

export async function enqueueNotification(db: GhlDb, input: EnqueueInput): Promise<string | null> {
  assertLockScreenSafe(input.title, input.body);
  const sendAfter = (input.sendAfter ?? new Date()).toISOString();

  const { data: queued } = await db
    .from("notifications")
    .select("id")
    .eq("dedupe_key", input.dedupeKey)
    .eq("status", "queued")
    .maybeSingle();
  if (queued) return queued.id;

  const { data, error } = await db
    .from("notifications")
    .insert({
      org_id: input.orgId,
      event_type: input.eventType,
      channel: input.channel,
      recipient_user_id: input.recipientUserId,
      recipient_member_id: input.recipientMemberId,
      actor_user_id: input.actorUserId ?? null,
      subject_kind: input.subjectKind ?? null,
      subject_ids: input.subjectIds,
      title: input.title,
      body: input.body,
      href: input.href,
      dedupe_key: input.dedupeKey,
      batch_key: input.batchKey ?? null,
      escalation_step: input.escalationStep ?? 1,
      is_emergency: input.isEmergency ?? false,
      is_test: input.isTest ?? false,
      status: "queued",
      send_after: sendAfter,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const { data: again } = await db
        .from("notifications")
        .select("id")
        .eq("dedupe_key", input.dedupeKey)
        .eq("status", "queued")
        .maybeSingle();
      return again?.id ?? null;
    }
    throw new Error(`Could not enqueue notification: ${error.message}`);
  }
  return data?.id ?? null;
}

export async function appendToBatch(
  db: GhlDb,
  args: {
    orgId: string;
    batchKey: string;
    subjectId: string;
    title: string;
    body: string;
    forCount?: (count: number) => { title: string; body: string };
  }
): Promise<boolean> {
  const { data: existing } = await db
    .from("notifications")
    .select("id, subject_ids")
    .eq("org_id", args.orgId)
    .eq("batch_key", args.batchKey)
    .eq("status", "queued")
    .maybeSingle();
  if (!existing) return false;
  const ids = Array.isArray(existing.subject_ids) ? existing.subject_ids : [];
  if (ids.includes(args.subjectId)) return true;
  const nextIds = [...ids, args.subjectId];
  const copy = args.forCount ? args.forCount(nextIds.length) : { title: args.title, body: args.body };
  assertLockScreenSafe(copy.title, copy.body);
  const { error } = await db
    .from("notifications")
    .update({
      subject_ids: nextIds,
      title: copy.title,
      body: copy.body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("status", "queued");
  return !error;
}
