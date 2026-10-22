import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { actionDef } from "@/lib/actions/registry";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";

export type RunView = {
  id: string;
  action: string;
  label: string;
  connector: string;
  status: string;
  leadId: string | null;
  leadName: string | null;
  requestedBy: string;
  createdAt: string;
  resultCode: string | null;
  reversible: boolean;
};

function requester(kind: string, id: string): string {
  if (kind === "agent") return AGENTS[id as LiveAgentId]?.name ?? "An agent";
  return "A teammate";
}

/** Read with the person's own client, so row-level security limits operators to their leads. */
export async function loadRuns(db: SupabaseClient, orgId: string, args: { statuses: string[]; limit: number; leadId?: string }): Promise<RunView[]> {
  let query = db
    .from("action_runs")
    .select("id, action, connector, status, lead_id, requested_by_kind, requested_by, created_at, result_code")
    .eq("org_id", orgId)
    .in("status", args.statuses)
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (args.leadId) query = query.eq("lead_id", args.leadId);
  const { data } = await query;
  const rows = (data ?? []) as Array<{ id: string; action: string; connector: string; status: string; lead_id: string | null; requested_by_kind: string; requested_by: string; created_at: string; result_code: string | null }>;
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads } = await db.from("leads").select("id, first_name, last_name").eq("org_id", orgId).in("id", leadIds);
    for (const lead of (leads ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      names.set(lead.id, [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead");
    }
  }
  return rows.map((row) => {
    const def = actionDef(row.action);
    return {
      id: row.id,
      action: row.action,
      label: def?.label ?? row.action,
      connector: row.connector,
      status: row.status,
      leadId: row.lead_id,
      leadName: row.lead_id ? names.get(row.lead_id) ?? null : null,
      requestedBy: requester(row.requested_by_kind, row.requested_by),
      createdAt: row.created_at,
      resultCode: row.result_code,
      reversible: Boolean(def?.reversible),
    };
  });
}
