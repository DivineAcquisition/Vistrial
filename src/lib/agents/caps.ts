import {
  AGENT_DAILY_RUN_CAP_DEFAULT,
  AGENT_DAILY_SPEND_CAP_USD_DEFAULT,
} from "@/lib/agents/constants";
import type { AgentDefinition, CapDecision, OrgAgentSettings } from "@/lib/agents/types";

export function defaultOrgAgentSettings(
  orgId: string,
  agentId: OrgAgentSettings["agentId"],
  seeded?: Partial<OrgAgentSettings>
): OrgAgentSettings {
  return {
    orgId,
    agentId,
    enabled: seeded?.enabled ?? false,
    observationMode: seeded?.observationMode ?? true,
    dailyRunCap: seeded?.dailyRunCap ?? AGENT_DAILY_RUN_CAP_DEFAULT,
    dailySpendCapUsd: seeded?.dailySpendCapUsd ?? AGENT_DAILY_SPEND_CAP_USD_DEFAULT,
  };
}

/** Catalog defaults: operator is already live. New writing agents watch first. */
export function seededOrgAgentSettings(orgId: string, definition: AgentDefinition): OrgAgentSettings {
  return defaultOrgAgentSettings(orgId, definition.id, {
    enabled: definition.defaultEnabled,
    observationMode: definition.writes && !definition.defaultEnabled,
  });
}

export function decideCaps(args: {
  halted: boolean;
  settings: OrgAgentSettings;
  runsToday: number;
  spendTodayUsd: number;
  hasIdentity: boolean;
}): CapDecision {
  if (args.halted) {
    return { ok: false, reason: "halted", message: "All agents are stopped for this workspace." };
  }
  if (!args.settings.enabled) {
    return { ok: false, reason: "disabled", message: "This agent is off." };
  }
  if (!args.hasIdentity) {
    return {
      ok: false,
      reason: "no_identity",
      message: "Scheduled and triggered agents need a team member to run as. Pick one under Advanced → Agents.",
    };
  }
  if (args.runsToday >= args.settings.dailyRunCap) {
    return {
      ok: false,
      reason: "run_cap",
      message: `This agent has reached its daily run cap (${args.settings.dailyRunCap}). It stopped. It did not keep going.`,
    };
  }
  if (args.spendTodayUsd >= args.settings.dailySpendCapUsd) {
    return {
      ok: false,
      reason: "spend_cap",
      message: `This agent has reached its daily spend cap ($${args.settings.dailySpendCapUsd}). It stopped. It did not keep going.`,
    };
  }
  return { ok: true };
}
