import { AGENT_STATEMENT_TIMEOUT_MS, AGENT_USER_ACTIVITY_WINDOW_MS, AGENT_YIELD_MS } from "@/lib/agents/constants";
import type { AgentMode } from "@/lib/agents/types";

export type AgentPriority = "interactive" | "background";

/**
 * Live user actions stay first. A background run yields when the org
 * has recent authenticated traffic, and never takes a lock that would
 * block a person working.
 */
export function resolveAgentPriority(mode: AgentMode): AgentPriority {
  return mode === "on_demand" ? "interactive" : "background";
}

export async function yieldIfUserIsWorking(args: {
  priority: AgentPriority;
  lastUserActivityAt: Date | null;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ yielded: boolean }> {
  if (args.priority === "interactive") return { yielded: false };
  const now = args.now ?? new Date();
  const last = args.lastUserActivityAt;
  if (!last) return { yielded: false };
  if (now.getTime() - last.getTime() > AGENT_USER_ACTIVITY_WINDOW_MS) return { yielded: false };
  const sleep = args.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  await sleep(AGENT_YIELD_MS);
  return { yielded: true };
}

export function backgroundStatementTimeoutMs(): number {
  return AGENT_STATEMENT_TIMEOUT_MS;
}

export function agentSqlTakesUserLock(sql: string): boolean {
  const compact = sql.replace(/\s+/g, " ").toUpperCase();
  return compact.includes("FOR UPDATE") || compact.includes("LOCK TABLE") || compact.includes("FOR SHARE");
}
