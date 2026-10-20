import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { commitActivity, liveRecordSink, type ActivityDeps, type ActivityWrite } from "@/lib/live/words";

function client(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Convex is not configured.");
  return new ConvexHttpClient(url);
}

function systemKey(): string {
  const key = process.env.CONVEX_SYSTEM_KEY;
  if (!key) throw new Error("The system caller is not configured.");
  return key;
}

export function activityDeps(): ActivityDeps {
  return {
    sink: () => liveRecordSink(),
    convex: async (op) => {
      await client().mutation(api.record.commit, {
        key: systemKey(),
        job: op.job,
        workspaceId: op.workspaceId,
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
    },
    outbox: async (op) => {
      const db = getSupabaseAdmin() as unknown as {
        from: (table: string) => { insert: (row: object) => Promise<{ error: { message: string } | null }> };
      };
      const { error } = await db.from("live_record_outbox").insert({
        seq: op.seq,
        idempotency_key: op.idempotencyKey,
        workspace_id: op.workspaceId,
        job: op.job,
        phase: "commit",
        payload: op,
      });
      if (error) throw new Error(error.message);
    },
    postgres: async () => {
      throw new Error("Postgres writes stay in the live record module.");
    },
  };
}

export async function commitLive(op: ActivityWrite): Promise<void> {
  await commitActivity(op, activityDeps());
}

export async function outboundGate(workspaceId: string): Promise<{ ok: true } | { ok: false; reason: "paused" | "unreadable" }> {
  if (liveRecordSink() === "convex") return readPause(workspaceId, "relay", "relay");
  try {
    const db = getSupabaseAdmin() as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { paused?: boolean } | null; error: { message: string } | null }> };
            maybeSingle: () => Promise<{ data: { halted?: boolean } | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const [control, halt] = await Promise.all([
      db.from("agent_presence_controls").select("paused").eq("org_id", workspaceId).eq("agent_id", "relay").maybeSingle(),
      db.from("platform_agent_halts").select("halted").eq("agent_id", "relay").maybeSingle(),
    ]);
    if (control.error || halt.error) return { ok: false, reason: "unreadable" };
    const paused = (control.data as { paused?: boolean } | null)?.paused === true;
    const halted = (halt.data as { halted?: boolean } | null)?.halted === true;
    if (paused || halted) return { ok: false, reason: "paused" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export async function readPause(workspaceId: string, agentId: string, job: string): Promise<{ ok: true } | { ok: false; reason: "paused" | "unreadable" }> {
  if (liveRecordSink() === "postgres") {
    return { ok: true };
  }
  try {
    const result = await client().query(api.pause.mayRun, {
      key: systemKey(),
      job,
      workspaceId,
      agentId,
    });
    return result.ok ? { ok: true } : { ok: false, reason: "paused" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
