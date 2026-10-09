import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapWaiting, type WaitingItem } from "@/lib/live/model";
import { RELAY_DAILY_LIMIT } from "@/lib/relay/run";
import { createClient } from "@/lib/supabase/server";

export type RelaySectionData = {
  sendingOn: boolean;
  readiness: { senderNumberAt: string | null; sendingDomainAt: string | null };
  open: WaitingItem[];
  usage: {
    drafted: number;
    sent: number;
    approvedAsIs: number;
    edited: number;
    rejected: number;
    closed: number;
    costMicros: number;
    dailyLimit: number;
  };
  /** Staff only; row level security returns nothing to anyone else. */
  health: {
    lastPassAt: string | null;
    dead: Array<{ id: string; leadId: string; trigger: string; error: string | null; at: string }>;
    skipped: Array<{ id: string; leadId: string; result: string | null; at: string }>;
    pending: number;
  } | null;
};

/** Everything the Relay page shows, read as the signed-in person. Never includes message text beyond the requests they can open. */
export async function loadRelaySection(orgId: string, isStaff: boolean): Promise<RelaySectionData> {
  const db = (await createClient()) as unknown as SupabaseClient;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [sending, readiness, open, drafts, feedback] = await Promise.all([
    db.rpc("lead_sending_enabled"),
    db.from("messaging_readiness").select("sender_number_confirmed_at, sending_domain_confirmed_at").eq("org_id", orgId).maybeSingle(),
    db
      .from("approval_items")
      .select("id, agent_id, run_id, action_type, title, reason, preview, lead_ids, status, created_at")
      .eq("org_id", orgId)
      .eq("agent_id", "relay")
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: true })
      .limit(100),
    db.from("relay_drafts").select("status, cost_micros").eq("org_id", orgId).gte("created_at", since).limit(5000),
    db.from("relay_feedback").select("kind").eq("org_id", orgId).gte("created_at", since).limit(5000),
  ]);
  const draftRows = (drafts.data ?? []) as Array<{ status: string; cost_micros: number | null }>;
  const kinds = ((feedback.data ?? []) as Array<{ kind: string }>).map((row) => row.kind);
  const ready = readiness.data as { sender_number_confirmed_at?: string | null; sending_domain_confirmed_at?: string | null } | null;

  let health: RelaySectionData["health"] = null;
  if (isStaff) {
    const [runtime, dead, skipped, pending] = await Promise.all([
      db.from("relay_runtime").select("last_pass_at").maybeSingle(),
      db.from("relay_jobs").select("id, lead_id, trigger, last_error, updated_at").eq("org_id", orgId).eq("status", "dead").order("updated_at", { ascending: false }).limit(20),
      db.from("relay_jobs").select("id, lead_id, result, updated_at").eq("org_id", orgId).eq("status", "skipped").order("updated_at", { ascending: false }).limit(10),
      db.from("relay_jobs").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["pending", "running"]),
    ]);
    health = {
      lastPassAt: (runtime.data as { last_pass_at?: string | null } | null)?.last_pass_at ?? null,
      dead: ((dead.data ?? []) as Array<{ id: string; lead_id: string; trigger: string; last_error: string | null; updated_at: string }>).map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        trigger: row.trigger,
        error: row.last_error,
        at: row.updated_at,
      })),
      skipped: ((skipped.data ?? []) as Array<{ id: string; lead_id: string; result: string | null; updated_at: string }>).map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        result: row.result,
        at: row.updated_at,
      })),
      pending: pending.count ?? 0,
    };
  }

  return {
    sendingOn: sending.data === true,
    readiness: { senderNumberAt: ready?.sender_number_confirmed_at ?? null, sendingDomainAt: ready?.sending_domain_confirmed_at ?? null },
    open: ((open.data ?? []) as Array<Record<string, unknown>>).map(mapWaiting),
    usage: {
      drafted: draftRows.length,
      sent: draftRows.filter((row) => row.status === "performed").length,
      approvedAsIs: kinds.filter((kind) => kind === "approved_as_is").length,
      edited: kinds.filter((kind) => kind === "edited").length,
      rejected: kinds.filter((kind) => kind === "rejected").length,
      closed: draftRows.filter((row) => row.status === "expired" || row.status === "withdrawn").length,
      costMicros: draftRows.reduce((sum, row) => sum + Number(row.cost_micros ?? 0), 0),
      dailyLimit: RELAY_DAILY_LIMIT,
    },
    health,
  };
}
