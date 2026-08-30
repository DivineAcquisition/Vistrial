import { agentDefinition } from "@/lib/agents/catalog";
import { decideCaps, seededOrgAgentSettings } from "@/lib/agents/caps";
import { isToolAllowedForAgent } from "@/lib/agents/registry";
import type { AgentActor, AgentId, AgentMode, CapDecision, OrgAgentSettings } from "@/lib/agents/types";

export type AgentGate = CapDecision & {
  definition: NonNullable<ReturnType<typeof agentDefinition>>;
  settings: OrgAgentSettings;
};

export function assertAgentMayRun(args: {
  agentId: AgentId;
  mode: AgentMode;
  halted: boolean;
  settings: OrgAgentSettings | null;
  runsToday: number;
  spendTodayUsd: number;
  actor: AgentActor | null;
}): AgentGate {
  const definition = agentDefinition(args.agentId);
  if (!definition) {
    return {
      ok: false,
      reason: "disabled",
      message: "That agent is not in this product.",
      definition: agentDefinition("operator")!,
      settings: seededOrgAgentSettings("", agentDefinition("operator")!),
    };
  }
  const settings = args.settings ?? seededOrgAgentSettings("", definition);
  if (!definition.modes.includes(args.mode)) {
    return {
      ok: false,
      reason: "disabled",
      message: "This agent does not run that way.",
      definition,
      settings,
    };
  }
  const hasIdentity = args.actor !== null;
  const decision = decideCaps({
    halted: args.halted,
    settings,
    runsToday: args.runsToday,
    spendTodayUsd: args.spendTodayUsd,
    hasIdentity,
  });
  if (!decision.ok) return { ...decision, definition, settings };
  return { ok: true, definition, settings };
}

export function assertToolForAgent(agentId: AgentId, name: string): { ok: true } | { ok: false; reason: string } {
  if (!isToolAllowedForAgent(agentId, name)) {
    return { ok: false, reason: "That is not a tool this agent may use." };
  }
  return { ok: true };
}
