import "server-only";

import { commitLive } from "@/lib/live/transport";

/** A log line from the older parallel tables. Job state is not written here. */
export async function writeLegacyLog(args: {
  workspaceId: string;
  kind: "agent_events" | "agent_escalations";
  legacyId: string;
  occurredAt?: string;
  row: Record<string, unknown>;
}): Promise<void> {
  const occurredAt = args.occurredAt ?? new Date().toISOString();
  await commitLive({
    idempotencyKey: `${args.kind}:${args.legacyId}`,
    seq: Date.now(),
    occurredAt,
    workspaceId: args.workspaceId,
    job: "legacy-log",
    kind: "event",
    action: "insert",
    row: {
      id: `${args.kind}:${args.legacyId}`,
      org_id: args.workspaceId,
      run_id: `${args.kind}:${args.legacyId}`,
      agent_id: "operator",
      kind: args.kind,
      label: String(args.row.action_taken ?? "Earlier work"),
      occurred_at: occurredAt,
      verbatim: true,
      legacy_table: args.kind,
      legacy_row: args.row,
    },
  });
}
