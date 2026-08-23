import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import type { QueueCursor } from "@/lib/queue/cursor";
import { parseQueuePayload, parseQueueRow } from "@/lib/queue/parse";
import { QUEUE_PAGE_SIZE, type QueueFilters, type QueuePayload, type QueueRow } from "@/lib/queue/types";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

export async function loadOrgQueue(
  filters: QueueFilters,
  opts?: { cursor?: QueueCursor | null; limit?: number }
): Promise<QueuePayload> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  return fetchOrgQueue(supabase, ctx.org.id, filters, opts);
}

export async function fetchOrgQueue(
  supabase: SupabaseClient<Database>,
  orgId: string,
  filters: QueueFilters,
  opts?: { cursor?: QueueCursor | null; limit?: number }
): Promise<QueuePayload> {
  const { data, error } = await supabase.rpc("load_org_queue", {
    p_org_id: orgId,
    p_assigned: filters.assigned,
    p_track: filters.track,
    p_status: filters.status,
    p_source: filters.source,
    p_score_min: filters.scoreMin,
    p_score_max: filters.scoreMax,
    p_cursor: (opts?.cursor ?? null) as Json | null,
    p_limit: opts?.limit ?? QUEUE_PAGE_SIZE,
  });

  if (error) {
    throw new Error(error.message || "Could not load the queue.");
  }

  return parseQueuePayload(data);
}

export async function fetchQueueRow(
  supabase: SupabaseClient<Database>,
  orgId: string,
  leadId: string
): Promise<QueueRow | null> {
  const { data, error } = await supabase
    .from("queue_rows")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) return null;

  return parseQueueRow({
    id: data.id,
    orgId: data.org_id,
    name: data.name,
    email: data.email,
    source: data.source,
    offerName: data.offer_name,
    status: data.status,
    leadType: data.lead_type,
    score: data.score,
    scoreConfidence: data.score_confidence,
    knownFactorCount: data.known_factor_count,
    scoreReasoning: data.score_reasoning,
    optedInAt: data.opted_in_at,
    lastTouchAt: data.last_touch_at,
    firstHumanTouchAt: data.first_human_touch_at,
    assignedSetterId: data.assigned_setter_id,
    assignedCloserId: data.assigned_closer_id,
    assignedSetterName: data.assigned_setter_name,
    assignedCloserName: data.assigned_closer_name,
    ghlContactId: data.ghl_contact_id,
    crmUrl: data.crm_url,
    nextAction: data.next_action_id
      ? {
          id: data.next_action_id,
          actionText: data.next_action_text,
          dueAt: data.next_action_due_at,
          overdue: data.next_action_overdue,
        }
      : null,
    inAlarm: data.in_alarm,
    breachSeconds: data.breach_seconds,
    urgencyRank: data.urgency_rank,
    sortScore: data.sort_score,
  });
}
