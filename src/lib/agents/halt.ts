import type { AgentHaltApp } from "@/lib/agents/constants";
import type { AgentHaltState } from "@/lib/agents/types";

export function emptyHaltState(): AgentHaltState {
  return { global: false, apps: { crm: false, calendar: false } };
}

export function agentWritesHalted(state: AgentHaltState, app: AgentHaltApp): boolean {
  return state.global || state.apps[app];
}

export function haltMessage(app: AgentHaltApp): string {
  if (app === "crm") {
    return "Agent writes to the CRM are stopped. The connection is still up.";
  }
  return "Agent writes to the calendar are stopped. The connection is still up.";
}
