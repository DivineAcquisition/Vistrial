import "server-only";

import type { FollowUpQualityFailure } from "@/lib/follow-up/types";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Json } from "@/types/database";

const STALE_PENDING_MS = 15 * 60 * 1000;
const HEALTH_WINDOW_MS = 7 * 86_400_000;

export type FollowUpHealth = {
  deadJobs: number;
  stalePendingJobs: number;
  enqueueFailed: number;
  enqueueNoRoute: number;
  qualityFailures: Array<{ type: FollowUpQualityFailure; count: number }>;
  warning: boolean;
};

function payloadReason(payload: Json): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const reason = (payload as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

export async function loadFollowUpHealth(db: GhlDb, orgId: string): Promise<FollowUpHealth> {
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const since = new Date(Date.now() - HEALTH_WINDOW_MS).toISOString();

  const [dead, stalePending, events, failures] = await Promise.all([
    db
      .from("follow_up_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "dead"),
    db
      .from("follow_up_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending")
      .lt("created_at", staleBefore),
    db
      .from("follow_up_events")
      .select("payload")
      .eq("org_id", orgId)
      .eq("kind", "enqueue_failed")
      .gte("created_at", since),
    db
      .from("follow_up_quality_check_failures")
      .select("failure_type")
      .eq("org_id", orgId)
      .gte("created_at", since),
  ]);

  let enqueueFailed = 0;
  let enqueueNoRoute = 0;
  for (const row of events.data ?? []) {
    if (payloadReason(row.payload) === "no_route") enqueueNoRoute += 1;
    else enqueueFailed += 1;
  }

  const counts = new Map<FollowUpQualityFailure, number>();
  for (const row of failures.data ?? []) {
    const type = row.failure_type;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const deadJobs = dead.count ?? 0;
  const stalePendingJobs = stalePending.count ?? 0;

  return {
    deadJobs,
    stalePendingJobs,
    enqueueFailed,
    enqueueNoRoute,
    qualityFailures: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    warning: deadJobs > 0 || enqueueFailed > 0 || stalePendingJobs > 0,
  };
}
