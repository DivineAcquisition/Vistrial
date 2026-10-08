import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import type { AttentionCounts } from "@/lib/shell/nav";
import { createClient } from "@/lib/supabase/server";

const EMPTY: AttentionCounts = { approvals: 0, dueToday: 0, escalations: 0 };

/**
 * Counts for nav badges. Read with the caller's own session, so row-level
 * security decides what is counted. A failed read shows no badge.
 */
export async function loadAttentionCounts(ctx: AuthContext): Promise<AttentionCounts> {
  try {
    const db = await createClient();
    const dueBy = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [approvals, due, escalations] = await Promise.all([
      db
        .from("approval_items")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.org.id)
        .eq("status", "pending"),
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
    return {
      approvals: approvals.count ?? 0,
      dueToday: due.count ?? 0,
      escalations: escalations.count ?? 0,
    };
  } catch {
    return EMPTY;
  }
}
