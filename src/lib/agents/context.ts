import "server-only";

import { assertAgentMayRun, type AgentGate } from "@/lib/agents/assert";
import { resolveAgentActor } from "@/lib/agents/identity";
import {
  loadHaltState,
  loadLastUserActivityAt,
  loadModelRoutes,
  loadOrgAgentSettings,
  loadServiceMember,
  runsAndSpendToday,
} from "@/lib/agents/persist";
import type { RouteTable } from "@/lib/agents/router";
import type { AgentActor, AgentHaltState, AgentId, AgentMode, OrgAgentSettings } from "@/lib/agents/types";
import { checkAgentConfig } from "@/lib/config/agent-gate";
import { createClient } from "@/lib/supabase/server";

export type AgentRunContext = {
  orgId: string;
  timezone: string;
  halt: AgentHaltState;
  settings: OrgAgentSettings;
  actor: AgentActor | null;
  lastUserActivityAt: Date | null;
  routes: RouteTable;
  gate: AgentGate;
  /** The configuration version this run used (also stamped on its run rows), when the gate passed. */
  configVersion: string | null;
  /** industry.business_description, for the agent's prompt. */
  businessDescription: string | null;
};

type Db = Parameters<typeof loadHaltState>[0];

export async function loadAgentRunContext(args: {
  orgId: string;
  agentId: AgentId;
  mode: AgentMode;
  requester: AgentActor | null;
  timezone?: string;
  db?: Db;
}): Promise<AgentRunContext> {
  const db = args.db ?? ((await createClient()) as unknown as Db);
  const [halt, settings, serviceMember, usage, lastUserActivityAt, routes] = await Promise.all([
    loadHaltState(db, args.orgId),
    loadOrgAgentSettings(db, args.orgId, args.agentId),
    loadServiceMember(db, args.orgId),
    runsAndSpendToday(db, args.orgId, args.agentId),
    loadLastUserActivityAt(db, args.orgId),
    loadModelRoutes(db),
  ]);
  const actor = resolveAgentActor({
    mode: args.mode,
    requester: args.requester,
    serviceMember,
  });
  const gate = assertAgentMayRun({
    agentId: args.agentId,
    mode: args.mode,
    halted: halt.global,
    settings,
    runsToday: usage.runsToday,
    spendTodayUsd: usage.spendTodayUsd,
    actor,
  });
  // Every agent reads configuration through requireConfig, for the sections
  // it declares; a missing or invalid value stops the run with that reason.
  let configVersion: string | null = null;
  let businessDescription: string | null = null;
  let finalGate: AgentGate = gate;
  if (gate.ok) {
    // The same session client the loaders above use, seen through its rpc method.
    const configured = await checkAgentConfig(db as unknown as Parameters<typeof checkAgentConfig>[0], args.orgId, args.agentId);
    if (configured.ok) {
      configVersion = configured.version;
      businessDescription = configured.businessDescription;
    } else {
      finalGate = { ok: false, reason: "config_incomplete", message: configured.reason, definition: gate.definition, settings: gate.settings };
    }
  }

  return {
    orgId: args.orgId,
    timezone: args.timezone ?? "America/New_York",
    halt,
    settings,
    actor,
    lastUserActivityAt,
    routes,
    gate: finalGate,
    configVersion,
    businessDescription,
  };
}
