import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { fetchOrgQueue, fetchQueueRow } from "@/lib/queue/load";
import { defaultAssignedFilter } from "@/lib/queue/filters";
import type { QueueMemberOption, QueueRow } from "@/lib/queue/types";
import { createClient } from "@/lib/supabase/server";

const RECENT_CALL_MS = 2 * 60 * 60 * 1000;

export type LogContext = {
  selected: QueueRow | null;
  reason: "lead" | "call" | "queue" | null;
  lastEndedCall: { leadId: string; occurredAt: string } | null;
  candidates: QueueRow[];
  members: QueueMemberOption[];
};

export async function loadLogContext(opts?: {
  leadId?: string | null;
  from?: string | null;
}): Promise<LogContext> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const filters = {
    assigned: defaultAssignedFilter(ctx.role, ctx.isPlatformAdmin),
    track: null,
    status: null,
    source: null,
    scoreMin: null,
    scoreMax: null,
    breached: false,
  };
  const payload = await fetchOrgQueue(supabase, ctx.org.id, filters, { limit: 30 });
  const candidates = [...payload.alarm, ...payload.queue];

  const { data: lastCall } = await supabase
    .from("calls")
    .select("lead_id, occurred_at")
    .eq("org_id", ctx.org.id)
    .eq("ran_by_member_id", ctx.member.id)
    .not("occurred_at", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastEndedCall =
    lastCall?.lead_id && lastCall.occurred_at
      ? { leadId: lastCall.lead_id, occurredAt: lastCall.occurred_at }
      : null;
  const recentCall =
    lastEndedCall && Date.now() - Date.parse(lastEndedCall.occurredAt) <= RECENT_CALL_MS
      ? lastEndedCall
      : null;

  const requested = opts?.leadId?.trim() || null;
  let selected: QueueRow | null = null;
  let reason: LogContext["reason"] = null;

  if (requested) {
    selected = candidates.find((row) => row.id === requested) ?? null;
    if (!selected) {
      selected = await fetchQueueRow(supabase, ctx.org.id, requested);
    }
    if (selected) reason = opts?.from === "call" ? "call" : "lead";
  }

  if (!selected && recentCall) {
    selected = candidates.find((row) => row.id === recentCall.leadId) ?? null;
    if (!selected) {
      selected = await fetchQueueRow(supabase, ctx.org.id, recentCall.leadId);
    }
    if (selected) reason = "call";
  }

  if (!selected && candidates[0]) {
    selected = candidates[0];
    reason = "queue";
  }

  return {
    selected,
    reason,
    lastEndedCall: recentCall,
    candidates,
    members: payload.members,
  };
}
