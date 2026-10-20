import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import type { GhlDb } from "@/lib/ghl/tokens";
import { assertLockScreenSafe } from "@/lib/notifications/copy";
import { liveRecordSink } from "@/lib/live/words";
import type { EnqueueInput } from "@/lib/notifications/types";

async function enqueueInConvex(db: GhlDb, input: EnqueueInput, id: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_SYSTEM_KEY;
  if (!url || !key || !input.orgId) throw new Error("Notifications are not configured.");
  const client = new ConvexHttpClient(url);
  const sendAfter = (input.sendAfter ?? new Date()).toISOString();
  const result = await client.mutation(api.notify.enqueue, {
    key,
    job: "notifications",
    workspaceId: input.orgId,
    legacyId: id,
    eventType: input.eventType,
    channel: input.channel,
    recipientUserId: input.recipientUserId ?? undefined,
    recipientMemberId: input.recipientMemberId ?? undefined,
    leadId: input.leadId ?? input.subjectIds[0],
    title: input.title,
    body: input.body,
    dedupeKey: input.dedupeKey,
    sendAfter,
    isTest: input.isTest,
    personCount: input.personCount,
    workspaceCount: input.workspaceCount,
    historic: input.historic,
    duplicate: input.duplicate,
    replay: input.replay,
    pausedCatchup: input.pausedCatchup,
    occurredBeforeGoLive: input.occurredBeforeGoLive,
    imported: input.imported,
  });
  if (result.id) {
    const loose = db as unknown as { rpc: (fn: string, args: object) => Promise<{ error: { message: string } | null }> };
    await loose.rpc("live_record_replicate", {
      p_table: "notifications",
      p_row: {
        id,
        org_id: input.orgId,
        event_type: result.eventType ?? input.eventType,
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
      },
    });
  }
  return result.created || result.id ? result.id : null;
}

export async function enqueueNotification(db: GhlDb, input: EnqueueInput): Promise<string | null> {
  assertLockScreenSafe(input.title, input.body);
  if (liveRecordSink() === "convex" && input.orgId) {
    const id = crypto.randomUUID();
    try {
      return await enqueueInConvex(db, input, id);
    } catch (error) {
      console.error(JSON.stringify({ src: "vistrial", event: "notification.enqueue_failed" }));
      const loose = db as unknown as {
        from: (table: string) => { insert: (row: object) => Promise<{ error: { message: string } | null }> };
      };
      const { error: outboxError } = await loose.from("live_record_outbox").insert({
        seq: Date.now(),
        idempotency_key: `notification:${input.dedupeKey}`,
        workspace_id: input.orgId,
        job: "notifications",
        phase: "commit",
        payload: { ...input, legacyId: id, sendAfter: (input.sendAfter ?? new Date()).toISOString() },
      });
      if (outboxError) throw new Error(outboxError.message);
      return id;
    }
  }
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
