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

/** What the Postgres copy did with one change. A run that already existed returns its id. */
export type CopyResult = { applied: boolean; id: string | null; existing: boolean };

export type ActivityDeps = {
  sink: () => "convex" | "postgres";
  convex: (op: ActivityWrite) => Promise<void>;
  outbox: (op: ActivityWrite) => Promise<void>;
  postgres: (op: ActivityWrite) => Promise<void>;
  /**
   * The Postgres copy every screen reads. It runs before Convex so the
   * screens are not held up by it, and a failed copy waits in the outbox and
   * is retried, so a dropped write shows as "Reconnecting", never as lost.
   */
  copy?: (op: ActivityWrite) => Promise<CopyResult>;
  copyOutbox?: (op: ActivityWrite) => Promise<void>;
};

export async function commitActivity(
  op: ActivityWrite,
  deps: ActivityDeps,
  options: { onCopy?: (result: CopyResult | null) => void } = {},
): Promise<"convex" | "outbox" | "postgres"> {
  const prepared = prepareActivity(op);
  if (deps.sink() === "postgres") {
    await deps.postgres(prepared);
    return "postgres";
  }
  let copied: CopyResult | null = null;
  if (deps.copy) {
    try {
      copied = await deps.copy(prepared);
      // The same trigger twice is one run: keep both records on the first id.
      if (copied.existing && copied.id && prepared.kind === "run") prepared.row = { ...prepared.row, id: copied.id };
    } catch {
      await deps.copyOutbox?.(prepared);
    }
  }
  options.onCopy?.(copied);
  try {
    await deps.convex(prepared);
    return "convex";
  } catch {
    await deps.outbox(prepared);
    return "outbox";
  }
}

/** Run statuses the Postgres copy may hold while the source still calls the run open. */
const COPY_ONLY_STATUSES = new Set(["stuck"]);
const OPEN_STATUSES = new Set(["queued", "working", "waiting_provider", "waiting_person", "paused"]);

export type DriftCount = {
  convexRuns: number;
  postgresRuns: number;
  missingInPostgres: number;
  missingInConvex: number;
  statusMismatch: number;
  sample: string[];
};

/**
 * Compares run ids and statuses between the two records. A run Postgres
 * marked stuck while the source still calls it open is not drift: stuck runs
 * are judged on the Postgres copy's own timestamps.
 */
export function compareRuns(
  convex: Array<{ id: string; status: string }>,
  postgres: Array<{ id: string; status: string }>,
): DriftCount {
  const left = new Map(convex.map((run) => [run.id, run.status]));
  const right = new Map(postgres.map((run) => [run.id, run.status]));
  const sample: string[] = [];
  let missingInPostgres = 0;
  let missingInConvex = 0;
  let statusMismatch = 0;
  for (const [id, status] of left) {
    const other = right.get(id);
    if (other === undefined) {
      missingInPostgres += 1;
      if (sample.length < 10) sample.push(id);
    } else if (other !== status && !(COPY_ONLY_STATUSES.has(other) && OPEN_STATUSES.has(status))) {
      statusMismatch += 1;
      if (sample.length < 10) sample.push(id);
    }
  }
  for (const id of right.keys()) {
    if (!left.has(id)) {
      missingInConvex += 1;
      if (sample.length < 10) sample.push(id);
    }
  }
  return { convexRuns: left.size, postgresRuns: right.size, missingInPostgres, missingInConvex, statusMismatch, sample };
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
