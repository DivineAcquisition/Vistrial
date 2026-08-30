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
  return {
    orgId: args.orgId,
    timezone: args.timezone ?? "America/New_York",
    halt,
    settings,
    actor,
    lastUserActivityAt,
    routes,
    gate,
  };
}
