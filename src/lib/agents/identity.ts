import type { AgentActor, AgentDefinition, AgentMode } from "@/lib/agents/types";

/**
 * On-demand runs as the requesting operator. Scheduled and triggered
 * runs as the configured service member. Never elevated, never a
 * service role — the actor is always a real org member.
 */
export function resolveAgentActor(args: {
  mode: AgentMode;
  requester: AgentActor | null;
  serviceMember: AgentActor | null;
}): AgentActor | null {
  if (args.mode === "on_demand") return args.requester;
  return args.serviceMember;
}

export function agentCanExceedUser(actor: AgentActor, definition: AgentDefinition): boolean {
  void actor;
  void definition;
  return false;
}

export function serviceMemberVisibleLabel(): string {
  return "Runs scheduled agents";
}

export function actorFromMember(row: {
  userId: string;
  memberId: string;
  role: AgentActor["role"];
  displayName: string;
}): AgentActor {
  return {
    userId: row.userId,
    memberId: row.memberId,
    role: row.role,
    displayName: row.displayName,
  };
}
