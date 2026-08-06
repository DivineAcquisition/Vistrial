import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { InboundEvent, InboundEventStatus } from "@/types/database";

export type InboundEventRecord = InboundEvent & {
  client: { id: string; name: string } | null;
};

/**
 * Events waiting on a person. A rising count here means a workflow was added in
 * GoHighLevel without a matching handler, or a secret is misconfigured.
 */
export const UNRESOLVED_STATUSES: InboundEventStatus[] = [
  "unattributed",
  "unknown",
  "unclassified",
  "failed",
];

export const STATUS_LABELS: Record<InboundEventStatus, string> = {
  pending: "Pending",
  processed: "Processed",
  unattributed: "Unattributed",
  unknown: "Unknown type",
  unclassified: "Unclassified touch",
  failed: "Failed",
  dismissed: "Dismissed",
};

export async function listUnresolvedEvents(
  limit = 100
): Promise<InboundEventRecord[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("inbound_events")
    .select("*, client:clients(id, name)")
    .in("status", UNRESOLVED_STATUSES)
    .order("received_at", { ascending: false })
    .limit(limit)
    .returns<InboundEventRecord[]>();

  if (error) {
    throw new Error(`Failed to list inbound events: ${error.message}`);
  }

  return data ?? [];
}

/** Zero on failure: a broken count must never take the whole shell down. */
export async function countUnresolvedEvents(): Promise<number> {
  try {
    const supabase = createServiceClient();

    const { count, error } = await supabase
      .from("inbound_events")
      .select("id", { count: "exact", head: true })
      .in("status", UNRESOLVED_STATUSES);

    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
