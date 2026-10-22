"use client";

import { createContext, useContext } from "react";

import type { AgentSummary, AgentSummaryRow } from "@/lib/agents/summary";

/**
 * The shared agent summary on the client. Every screen that shows agent
 * state or a waiting count reads it here, so the sidebar, the status strip,
 * the agent panel, the crew band and the Decisions count cannot disagree.
 */
export type AgentSummaryContextValue = {
  summary: AgentSummary | null;
  /** Ask for a fresh summary now (after a quick action). */
  refresh: () => void;
  /** Live delivery or the copy is behind: show the quiet Reconnecting note. */
  reconnecting: boolean;
};

export const AgentSummaryContext = createContext<AgentSummaryContextValue>({
  summary: null,
  refresh: () => undefined,
  reconnecting: false,
});

export function useAgentSummary(): AgentSummaryContextValue {
  return useContext(AgentSummaryContext);
}

export function useAgentRow(agentId: string): AgentSummaryRow | null {
  const { summary } = useAgentSummary();
  return summary?.agents.find((agent) => agent.id === agentId) ?? null;
}
