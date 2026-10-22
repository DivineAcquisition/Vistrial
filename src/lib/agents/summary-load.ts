import "server-only";

import { buildAgentSummary, type AgentSummary, type RawSummary, type SetupFacts } from "@/lib/agents/summary";
import { CONNECTORS } from "@/lib/connectors/catalog";
import { createClient } from "@/lib/supabase/server";

type Rpc = { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }> };

type FlagQuery = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: { enabled?: boolean } | null }>;
        };
      };
    };
  };
};

const CRM_KEYS = CONNECTORS.filter((connector) => connector.category === "crm").map((connector) => connector.key);
const CALL_KEYS = CONNECTORS.filter((connector) => connector.category === "calls").map((connector) => connector.key);

/**
 * The shared summary for the signed-in person, in one database call plus the
 * setup facts. Read under their own session, so row-level security decides
 * every count and line. Returns null when the workspace is not theirs.
 */
export async function loadAgentSummary(orgId: string, now: number = Date.now()): Promise<AgentSummary | null> {
  const db = (await createClient()) as unknown as Rpc;
  const [summary, setup, salesCalendar] = await Promise.all([
    db.rpc("agent_summary", { p_org_id: orgId }),
    db.rpc("agent_setup_facts", { p_org_id: orgId, p_crm_keys: CRM_KEYS, p_call_keys: CALL_KEYS }),
    readSalesCalendarFlag(orgId),
  ]);
  if (summary.error || !summary.data) return null;
  const raw = summary.data as RawSummary;
  raw.salesCalendar = salesCalendar;
  return buildAgentSummary(raw, setup.error ? {} : ((setup.data ?? {}) as SetupFacts), now);
}

/** The sales calendar flag, read with the person's own session. Missing means off. */
async function readSalesCalendarFlag(orgId: string): Promise<boolean> {
  const db = (await createClient()) as unknown as FlagQuery;
  const { data } = await db
    .from("workspace_flags")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("flag", "sales_calendar")
    .maybeSingle();
  return data?.enabled === true;
}

/** The one "waiting on you" count, for badges that do not need the whole summary. */
export async function loadWaitingTotal(orgId: string, agentId?: string): Promise<number> {
  const db = (await createClient()) as unknown as Rpc;
  const { data, error } = await db.rpc("agent_waiting_count", { p_org_id: orgId, p_agent_id: agentId ?? null });
  return error ? 0 : Number(data ?? 0);
}
