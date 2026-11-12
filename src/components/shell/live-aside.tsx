"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import Link from "next/link";
import { useQuery } from "convex/react";

import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { skillName } from "@/lib/runs/skill-name";
import { api } from "../../../convex/_generated/api";

const STATUS_LABEL: Record<string, string> = { queued: "Queued", running: "Running", waiting: "Waiting" };

/** The empty line tells the truth about the agents: off only when every agent is off. */
export function idleLine(agents: { state?: string }[]) {
  return agents.some((agent) => agent.state !== undefined && agent.state !== "off")
    ? "Nothing is running."
    : "Nothing is running. Agents are off.";
}

export function LiveAside() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="mt-3 text-sm text-muted-foreground">{idleLine([])}</p>;
  return <OpenRuns shell={shell} />;
}

function OpenRuns({ shell }: { shell: WorkspaceShell }) {
  const runs = useQuery(api.runs.open, { workspaceId: shell.workspaceId });
  if (runs === undefined) return <p className="mt-3 text-sm text-muted-foreground">Loading.</p>;
  if (runs.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{idleLine(shell.agents)}</p>;
  return (
    <ul className="mt-3 grid gap-2">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center gap-x-1.5 text-sm">
          <AgentAvatar slug={run.agentSlug} size="xs" className="size-5" working />
          <Link className="text-foreground underline-offset-4 hover:underline" href={`/app/runs/${run.id}`}>
            {skillName(shell, run.agentSlug, run.skillSlug)}
          </Link>
          <span className="text-muted-foreground"> · {STATUS_LABEL[run.status] ?? run.status}</span>
        </li>
      ))}
    </ul>
  );
}
