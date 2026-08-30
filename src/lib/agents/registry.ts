import { AGENT_CATALOG } from "@/lib/agents/catalog";
import { isForbiddenToolName } from "@/lib/agents/forbidden";
import { genericWriteToolNames } from "@/lib/agents/external";
import { OPERATOR_TOOL_NAMES, isProposeToolName } from "@/lib/operator/catalog";
import type { AgentId, AgentTier, AgentToolKind } from "@/lib/agents/types";

export type RegisteredTool = {
  name: string;
  kind: AgentToolKind;
  tier: AgentTier;
  agents: readonly AgentId[];
};

const operatorTools: RegisteredTool[] = OPERATOR_TOOL_NAMES.map((name) => ({
  name,
  kind: isProposeToolName(name) ? "propose_internal" : "read",
  tier: isProposeToolName(name) ? "write_internal" : "read",
  agents: ["operator"],
}));

/**
 * Named operations only. None of these are on an agent allowlist yet —
 * adding one to an agent is a later prompt. They exist so a generic
 * write, API-calling, or code-execution tool never has to.
 */
const frameworkTools: RegisteredTool[] = [
  { name: "research_company", kind: "read", tier: "read", agents: [] },
  { name: "propose_automation_change", kind: "produce", tier: "produce", agents: [] },
  { name: "propose_crm_add_tag", kind: "propose_external", tier: "write_external", agents: [] },
  { name: "propose_crm_write_note", kind: "propose_external", tier: "write_external", agents: [] },
  { name: "propose_crm_update_allowlisted_field", kind: "propose_external", tier: "write_external", agents: [] },
  { name: "propose_crm_move_pipeline_stage", kind: "propose_external", tier: "write_external", agents: [] },
  { name: "propose_crm_create_task", kind: "propose_external", tier: "write_external", agents: [] },
  { name: "propose_crm_update_opportunity_value", kind: "propose_external", tier: "write_external", agents: [] },
  { name: "propose_calendar_create_hold", kind: "propose_external", tier: "write_external", agents: [] },
];

export const AGENT_TOOL_REGISTRY: readonly RegisteredTool[] = [...operatorTools, ...frameworkTools];

export function registeredTool(name: string): RegisteredTool | null {
  return AGENT_TOOL_REGISTRY.find((tool) => tool.name === name) ?? null;
}

export function isToolAllowedForAgent(agentId: AgentId, name: string): boolean {
  if (isForbiddenToolName(name)) return false;
  if (genericWriteToolNames().includes(name)) return false;
  const definition = AGENT_CATALOG[agentId];
  if (!definition) return false;
  if (!(definition.tools as readonly string[]).includes(name)) return false;
  const tool = registeredTool(name);
  if (!tool) return false;
  if (tool.agents.length > 0 && !tool.agents.includes(agentId)) return false;
  if (tool.tier === "contact") return false;
  return true;
}

export function assertNoGenericWriteTools(names: readonly string[]): void {
  for (const name of names) {
    if (genericWriteToolNames().includes(name) || isForbiddenToolName(name)) {
      throw new Error(`Forbidden agent tool: ${name}`);
    }
  }
}
