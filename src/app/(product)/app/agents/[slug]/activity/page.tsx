"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { RunList } from "@/components/runs/run-list";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Panel } from "@/components/ui/panel";
import { skillName } from "@/lib/runs/skill-name";
import { asRunStatus, asStopReason } from "@/lib/runs/view";
import { api } from "../../../../../../../convex/_generated/api";
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { EmptyState } from "@/components/ui/empty-state";

/** Every run this agent made, newest first. */
export default function AgentActivity() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const runs = useQuery(api.runs.list, shell ? { workspaceId: shell.workspaceId, agentSlug: params.slug } : "skip");
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">Each run is one piece of work, with every step, its cost and what it made.</p>
      {runs === undefined ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : runs.length === 0 ? (
        <EmptyState
          bare
          preview="rows"
          title="Every step this agent takes will appear here."
          detail="Searches, sources, checks and cost, live as it works."
          action={shell.role !== "rep" ? <StartSessionButton agentSlug={params.slug} /> : undefined}
        />
      ) : null}
      <RunList
        runs={(runs ?? []).map((run: { id: string; skillSlug: string; status: string; stopReason: string | null; costCents: number; startedAt: number }) => ({
          id: run.id,
          skillName: skillName(shell, params.slug, run.skillSlug),
          agentName: agent?.name ?? params.slug,
          status: asRunStatus(run.status),
          stopReason: asStopReason(run.stopReason),
          costCents: run.costCents,
          startedAt: run.startedAt,
          startedByMe: false,
        }))}
      />
    </Panel>
  );
}
