import { AGENT_RETRY_BACKOFF_MS, AGENT_RETRY_MAX } from "@/lib/agents/constants";
import type { AgentMode, AgentRunState } from "@/lib/agents/types";

export function nextRetryAt(attempt: number, now = new Date()): Date | null {
  if (attempt >= AGENT_RETRY_MAX) return null;
  return new Date(now.getTime() + AGENT_RETRY_BACKOFF_MS[attempt]);
}

export function afterFailedRun(args: {
  status: AgentRunState;
  retryCount: number;
}): { nextStatus: AgentRunState; nextRetryAt: Date | null } {
  if (args.status !== "failed") {
    return { nextStatus: args.status, nextRetryAt: null };
  }
  const when = nextRetryAt(args.retryCount);
  if (!when) return { nextStatus: "dead_lettered", nextRetryAt: null };
  return { nextStatus: "queued", nextRetryAt: when };
}

/**
 * On-demand has a person watching — they retry by asking again.
 * Scheduled and triggered runs nobody is watching, so they queue
 * with backoff and dead-letter after the bound.
 */
export function failureNextState(args: {
  mode: AgentMode;
  retryCount: number;
}): { nextStatus: AgentRunState; nextRetryAt: Date | null } {
  if (args.mode === "on_demand") {
    return { nextStatus: "failed", nextRetryAt: null };
  }
  return afterFailedRun({ status: "failed", retryCount: args.retryCount });
}
