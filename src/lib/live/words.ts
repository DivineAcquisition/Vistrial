import { displayLeadPhrase, redactInbound, withoutLeadName } from "../../../convex/redactText";

export { displayLeadPhrase, redactInbound, withoutLeadName };

export function liveRecordSink(env: { LIVE_RECORD_SINK?: string } = { LIVE_RECORD_SINK: process.env.LIVE_RECORD_SINK }): "convex" | "postgres" {
  return env.LIVE_RECORD_SINK === "postgres" ? "postgres" : "convex";
}

export type ActivityWrite = {
  idempotencyKey: string;
  seq: number;
  occurredAt: string;
  workspaceId: string;
  job: string;
  kind: "run" | "step" | "event" | "output" | "staff";
  action: "insert" | "update" | "upsert";
  leadName?: string | null;
  row: Record<string, unknown>;
};

const TEXT_KEYS = ["subject_label", "label", "title", "body", "detail", "reason", "plain_error", "reason_summary", "current_step_label"];

export function prepareActivity(op: ActivityWrite): ActivityWrite {
  const row: Record<string, unknown> = { ...op.row, org_id: op.workspaceId };
  if (row.verbatim !== true) {
    for (const key of TEXT_KEYS) {
      if (typeof row[key] === "string") {
        const stripped = withoutLeadName(row[key] as string, op.leadName);
        row[key] = key === "body" ? (redactInbound(stripped).text ?? "") : stripped;
      }
    }
  }
  const rest = { ...op };
  delete rest.leadName;
  return { ...rest, row };
}

export type ActivityDeps = {
  sink: () => "convex" | "postgres";
  convex: (op: ActivityWrite) => Promise<void>;
  outbox: (op: ActivityWrite) => Promise<void>;
  postgres: (op: ActivityWrite) => Promise<void>;
};

export async function commitActivity(op: ActivityWrite, deps: ActivityDeps): Promise<"convex" | "outbox" | "postgres"> {
  const prepared = prepareActivity(op);
  if (deps.sink() === "postgres") {
    await deps.postgres(prepared);
    return "postgres";
  }
  try {
    await deps.convex(prepared);
    return "convex";
  } catch {
    await deps.outbox(prepared);
    return "outbox";
  }
}

export function drainInOrder<T extends { seq: number; idempotencyKey: string }>(rows: T[], already: Set<string>): T[] {
  return [...rows].sort((a, b) => a.seq - b.seq).filter((row) => !already.has(row.idempotencyKey));
}

export type PauseRead = { ok: true } | { ok: false; reason: "paused" | "unreadable" | "workspace" | "not_activated" };

/** A missing or failed pause read waits. It never counts as not paused. */
export function decideOutbound(read: PauseRead): "allow" | "wait" {
  if (read.ok) return "allow";
  return "wait";
}

/** Columns the staff SQL readers count. The one-way copy keeps these identical. */
export function projectRun(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    org_id: row.org_id,
    agent_id: row.agent_id,
    lead_id: row.lead_id ?? null,
    status: row.status,
    created_at: row.created_at,
    last_progress_at: row.last_progress_at,
    simulated: row.simulated === true,
  };
}
