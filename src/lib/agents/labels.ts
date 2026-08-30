import { AGENT_CATALOG } from "@/lib/agents/catalog";
import type { AgentId, AgentMode, AgentTier } from "@/lib/agents/types";

export function agentDisplayName(id: AgentId): string {
  return AGENT_CATALOG[id]?.label ?? id;
}

export function agentModeLabel(mode: AgentMode): string {
  switch (mode) {
    case "on_demand":
      return "When you ask";
    case "triggered":
      return "When something happens";
    case "scheduled":
      return "On a schedule";
  }
}

export function agentTierLabel(tier: AgentTier): string {
  switch (tier) {
    case "read":
      return "Read";
    case "produce":
      return "Prepare work";
    case "write_internal":
      return "Change Vistrial records";
    case "write_external":
      return "Change a connected system";
    case "contact":
      return "Contact a prospect";
  }
}

export function observationModeLabel(): string {
  return "Watch first";
}

export function globalHaltLabel(): string {
  return "Stop every agent";
}

export function perAppHaltLabel(app: "crm" | "calendar"): string {
  return app === "crm" ? "Stop CRM writes" : "Stop calendar writes";
}

export function activityHeadline(args: {
  agentLabel: string;
  identity: string;
  action: string;
}): string {
  return `${args.agentLabel} · ${args.identity} · ${args.action}`;
}
