import "server-only";

import { listAgentDefinitions } from "@/lib/agents/catalog";
import { seededOrgAgentSettings } from "@/lib/agents/caps";
import { loadHaltState, loadOrgAgentSettings, loadServiceMember } from "@/lib/agents/persist";
import type { AgentHaltState, AgentId, OrgAgentSettings } from "@/lib/agents/types";
import { createClient } from "@/lib/supabase/server";

export type AgentSettingsView = {
  halt: AgentHaltState;
  serviceMember: { memberId: string; displayName: string; role: string } | null;
  members: Array<{ memberId: string; displayName: string; role: string; active: boolean }>;
  agents: Array<{
    id: AgentId;
    label: string;
    summary: string;
    settings: OrgAgentSettings;
    writes: boolean;
  }>;
};

export async function loadAgentSettingsView(orgId: string): Promise<AgentSettingsView> {
  const db = await createClient();
  const [halt, serviceMember, members] = await Promise.all([
    loadHaltState(db as never, orgId),
    loadServiceMember(db as never, orgId),
    db
      .from("org_members")
      .select("id, display_name, role, active")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);
  const agents = [];
  for (const definition of listAgentDefinitions()) {
    const settings = await loadOrgAgentSettings(db as never, orgId, definition.id);
    agents.push({
      id: definition.id,
      label: definition.label,
      summary: definition.summary,
      settings: settings ?? seededOrgAgentSettings(orgId, definition),
      writes: definition.writes,
    });
  }
  return {
    halt,
    serviceMember: serviceMember
      ? { memberId: serviceMember.memberId, displayName: serviceMember.displayName, role: serviceMember.role }
      : null,
    members: (members.data ?? []).map((row) => ({
      memberId: row.id,
      displayName: row.display_name,
      role: row.role,
      active: row.active,
    })),
    agents,
  };
}
