import "server-only";

import { buildAgentSummary, type AgentSummary, type RawSummary, type SetupFacts } from "@/lib/agents/summary";
import { CONNECTORS } from "@/lib/connectors/catalog";
import { createClient } from "@/lib/supabase/server";

type Rpc = { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }> };

const CRM_KEYS = CONNECTORS.filter((connector) => connector.category === "crm").map((connector) => connector.key);
const CALL_KEYS = CONNECTORS.filter((connector) => connector.category === "calls").map((connector) => connector.key);

/**
 * The shared summary for the signed-in person, in one database call plus the
 * setup facts. Read under their own session, so row-level security decides
 * every count and line. Returns null when the workspace is not theirs.
 */
export async function loadAgentSummary(orgId: string, now: number = Date.now()): Promise<AgentSummary | null> {
  const db = (await createClient()) as unknown as Rpc;
  const [summary, setup] = await Promise.all([
    db.rpc("agent_summary", { p_org_id: orgId }),
    db.rpc("agent_setup_facts", { p_org_id: orgId, p_crm_keys: CRM_KEYS, p_call_keys: CALL_KEYS }),
  ]);
  if (summary.error || !summary.data) return null;
  return buildAgentSummary(summary.data as RawSummary, setup.error ? {} : ((setup.data ?? {}) as SetupFacts), now);
}

/** The one "waiting on you" count, for badges that do not need the whole summary. */
export async function loadWaitingTotal(orgId: string, agentId?: string): Promise<number> {
  const db = (await createClient()) as unknown as {
    from: (table: string) => {
      select: (columns: string, options: { count: "exact"; head: true }) => {
        eq: (column: string, value: string) => PromiseLike<{ count: number | null; error: unknown }> & {
          eq: (column: string, value: string) => PromiseLike<{ count: number | null; error: unknown }>;
        };
      };
    };
  };
  const base = db.from("agent_waiting_items").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { count, error } = await (agentId ? base.eq("agent_id", agentId) : base);
  return error ? 0 : count ?? 0;
}
