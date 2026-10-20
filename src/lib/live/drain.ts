import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { liveRecordSink, type ActivityWrite } from "@/lib/live/words";

type OutboxRow = {
  id: number;
  idempotency_key: string;
  workspace_id: string;
  job: string;
  payload: ActivityWrite;
};

/** Delivers the durable outbox in sequence once Convex can be reached. */
export async function drainLiveOutbox(): Promise<number> {
  if (liveRecordSink() !== "convex") return 0;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_SYSTEM_KEY;
  if (!url || !key) return 0;
  const db = getSupabaseAdmin() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        is: (column: string, value: null) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: OutboxRow[] | null; error: { message: string } | null }>;
          };
        };
      };
      update: (row: object) => { eq: (column: string, value: number) => Promise<{ error: { message: string } | null }> };
    };
  };
  const { data, error } = await db
    .from("live_record_outbox")
    .select("id, idempotency_key, workspace_id, job, payload")
    .is("delivered_at", null)
    .order("seq", { ascending: true })
    .limit(100);
  if (error || !data?.length) return 0;
  const client = new ConvexHttpClient(url);
  let delivered = 0;
  for (const row of data) {
    const op = row.payload;
    if (row.job === "notifications") {
      const notice = op as unknown as {
        legacyId: string;
        eventType: string;
        channel: string;
        title: string;
        body: string;
        dedupeKey: string;
        sendAfter: string;
        recipientUserId?: string | null;
        recipientMemberId?: string | null;
        leadId?: string | null;
        subjectIds?: string[];
        historic?: boolean;
        imported?: boolean;
      };
      await client.mutation(api.notify.enqueue, {
        key,
        job: "notifications",
        workspaceId: row.workspace_id,
        legacyId: notice.legacyId,
        eventType: notice.eventType,
        channel: notice.channel,
        title: notice.title,
        body: notice.body,
        dedupeKey: notice.dedupeKey,
        sendAfter: notice.sendAfter,
        recipientUserId: notice.recipientUserId ?? undefined,
        recipientMemberId: notice.recipientMemberId ?? undefined,
        leadId: notice.leadId ?? notice.subjectIds?.[0],
        historic: notice.historic,
        imported: notice.imported,
      });
    } else {
      await client.mutation(api.record.commit, {
        key,
        job: row.job,
        workspaceId: row.workspace_id,
        ops: [
          {
            idempotencyKey: op.idempotencyKey,
            seq: op.seq,
            occurredAt: op.occurredAt,
            kind: op.kind,
            action: op.action,
            row: op.row,
          },
        ],
      });
    }
    await db.from("live_record_outbox").update({ delivered_at: new Date().toISOString() }).eq("id", row.id);
    delivered += 1;
  }
  return delivered;
}
