import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { scrubSecrets } from "@/lib/execution/errors";
import {
  EXECUTION_ACTION_TYPES,
  EXECUTION_OPERATION_FOR,
  type ExecutionKind,
} from "@/lib/execution/kinds";

const MAX_CONTENT = 4000;

export type WriteLogEntry = {
  orgId: string;
  kind: ExecutionKind;
  status: "sent" | "failed" | "blocked";
  destinationId: string | null;
  destinationLabel: string | null;
  /** What was posted, or the path and name of what was filed. */
  content: string;
  externalRef?: string | null;
  authorizationKind: "approval_item" | "auto_run" | "owner_test";
  approvalItemId?: string | null;
  authorizedByMemberId?: string | null;
  failureReason?: string | null;
};

/**
 * Every attempt is recorded, including blocked ones: the log is how a team
 * sees what went where and what authorised it. Text is scrubbed of anything
 * shaped like a credential on the way in.
 */
export async function recordWrite(db: GhlDb, entry: WriteLogEntry): Promise<string | null> {
  const { data, error } = await db
    .from("execution_writes")
    .insert({
      org_id: entry.orgId,
      kind: entry.kind,
      operation: EXECUTION_OPERATION_FOR[entry.kind],
      action_type: EXECUTION_ACTION_TYPES[entry.kind],
      status: entry.status,
      destination_id: entry.destinationId,
      destination_label: entry.destinationLabel,
      content: scrubSecrets(entry.content).slice(0, MAX_CONTENT) || "(empty)",
      external_ref: entry.externalRef ?? null,
      authorization_kind: entry.authorizationKind,
      approval_item_id: entry.approvalItemId ?? null,
      authorized_by_member_id: entry.authorizedByMemberId ?? null,
      failure_reason: entry.failureReason ? scrubSecrets(entry.failureReason).slice(0, 500) : null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(JSON.stringify({ src: "vistrial", event: "execution.write_log_failed", kind: entry.kind }));
    return null;
  }
  return data?.id ?? null;
}
