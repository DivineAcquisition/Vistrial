import { OPERATOR_TOOL_NAMES } from "@/lib/operator/catalog";
import type { AgentDefinition, AgentId } from "@/lib/agents/types";

/**
 * The curated set. Adding an agent is a code change (24a onward).
 * This prompt ships the operator definition only — no new working agent.
 */
export const AGENT_CATALOG: Record<AgentId, AgentDefinition> = {
  operator: {
    id: "operator",
    label: "Operator",
    summary: "Answers when someone on the team asks. Does not run on its own.",
    modes: ["on_demand"],
    maxTier: "write_internal",
    tools: OPERATOR_TOOL_NAMES,
    workKind: "agent_planning",
    outputType: "conversation",
    writes: true,
    /** Already live from Prompt 18. New agents default off. */
    defaultEnabled: true,
  },
};

export function agentDefinition(id: string): AgentDefinition | null {
  if (id === "operator") return AGENT_CATALOG.operator;
  return null;
}

export function listAgentDefinitions(): AgentDefinition[] {
  return [AGENT_CATALOG.operator];
}
