import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { loadWaitingTotal } from "@/lib/agents/summary-load";
import type { AttentionCounts } from "@/lib/shell/nav";
import { loadQueueCounts } from "@/lib/staff/load";
import type { StaffScope } from "@/lib/staff/types";
import { createClient } from "@/lib/supabase/server";

async function loadStaffQueueBadge(scope: StaffScope): Promise<number> {
  try {
    const counts = await loadQueueCounts(scope);
    return counts.escalations + counts.requests + counts.data_requests;
  } catch {
    return 0;
  }
}

const EMPTY: AttentionCounts = { approvals: 0, dueToday: 0, escalations: 0, queue: 0 };

/**
 * Counts for nav badges. Read with the caller's own session, so row-level
 * security decides what is counted. A failed read shows no badge.
 */
export async function loadAttentionCounts(ctx: AuthContext): Promise<AttentionCounts> {
  try {
    const db = await createClient();
    const dueBy = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [approvals, due, escalations] = await Promise.all([
      // The one "waiting on you" definition, shared with the agent summary.
      loadWaitingTotal(ctx.org.id),
      db
        .from("next_actions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.org.id)
        .eq("owner_member_id", ctx.member.id)
        .is("completed_at", null)
        .lte("due_at", dueBy),
      db
        .from("approval_items")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.org.id)
        .not("escalated_at", "is", null)
        .in("status", ["pending", "running", "failed"]),
    ]);
    const queue = ctx.isStaff ? await loadStaffQueueBadge(ctx.isPlatformAdmin ? "all" : "mine") : 0;
    return {
      approvals,
      dueToday: due.count ?? 0,
      escalations: escalations.count ?? 0,
      queue,
    };
  } catch {
    return EMPTY;
  }
}
