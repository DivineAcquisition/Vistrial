import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENTS, isLiveAgentId } from "@/lib/agents/roster";
import { notifyDaAlert } from "@/lib/ops/alerts";

const STUCK_AFTER_MINUTES = 10;

/** Flag runs with no progress for a while, and tell the Service Team once per run. */
export async function flagStuckAgentRuns(db: unknown): Promise<number> {
  const client = db as SupabaseClient;
  const { data, error } = await client.rpc("agent_activity_mark_stuck", { p_minutes: STUCK_AFTER_MINUTES });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ run_id: string; org_id: string; agent_id: string }>;
  for (const row of rows) {
    const name = isLiveAgentId(row.agent_id) ? AGENTS[row.agent_id].name : "An agent";
    await notifyDaAlert({
      kind: "agent_run_stuck",
      title: `${name} stopped making progress on a run`,
      checkFirst: "Open Agent Health, then the run, and read its technical detail.",
      severity: "warning",
      orgId: row.org_id,
      detail: { runId: row.run_id, agent: row.agent_id },
    });
  }
  return rows.length;
}

export async function pruneAgentRunHistory(db: unknown, dryRun: boolean): Promise<unknown> {
  const { data, error } = await (db as SupabaseClient).rpc("agent_activity_prune", { p_dry_run: dryRun });
  if (error) throw new Error(error.message);
  return data;
}
