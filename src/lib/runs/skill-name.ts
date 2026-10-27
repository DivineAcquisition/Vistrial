import type { WorkspaceShell } from "@/components/shell/shell-context";

/** A skill's display name from the registry the shell already loaded. */
export function skillName(shell: WorkspaceShell, agentSlug: string, skillSlug: string) {
  if (skillSlug === "test-echo") return "Test echo";
  const agent = shell.agents.find((row) => row.slug === agentSlug);
  return agent?.skills?.find((skill) => skill.slug === skillSlug)?.name ?? skillSlug;
}
