import type { WorkspaceShell } from "@/components/shell/shell-context";

import { agentWork, workLabel } from "../../../convex/lib/workWords";

/**
 * What a run is called on screen: the agent and its work, "Strategist · Research". A skill is part of its
 * agent and is never named in the app (convex/lib/workWords.ts).
 */
export function skillName(_shell: WorkspaceShell, agentSlug: string, skillSlug: string) {
  if (skillSlug === "test-echo") return "Test echo";
  return agentWork(agentSlug, skillSlug);
}

/** The work alone, for a filter whose agent is already chosen: "Research". */
export function workName(skillSlug: string) {
  return workLabel(skillSlug);
}
