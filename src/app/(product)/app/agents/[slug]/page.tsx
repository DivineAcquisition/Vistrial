"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { RunList } from "@/components/runs/run-list";
import { api } from "../../../../../../convex/_generated/api";
import { bodyText } from "@/lib/ui";
import { skillName } from "@/lib/runs/skill-name";
import { asRunStatus, asStopReason } from "@/lib/runs/view";

export default function AgentPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const devSkill = useQuery(api.runs.devSkill, shell ? { workspaceId: shell.workspaceId } : "skip");
  const runs = useQuery(api.runs.list, shell ? { workspaceId: shell.workspaceId, agentSlug: params.slug } : "skip");
  const start = useMutation(api.runs.start);
  const [notice, setNotice] = useState("");
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  if (!agent) return <p className="text-sm text-muted-foreground">Not found.</p>;
  const stateLabel = agent.state === "off" ? "Off" : agent.state === "suggesting" ? "Suggesting" : "On";

  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <PageHeader eyebrow={agent.area ?? "Agent"} title={agent.name} description={agent.job} status={stateLabel} />
      <Panel className="grid gap-4 p-4 sm:p-6">
        <StatusBadge label={stateLabel} />
        <p className={bodyText}>{agent.promise}</p>
        <ul className="grid gap-3">
          {(agent.skills ?? []).map((skill) => (
            <li key={skill.slug} className="grid gap-1 rounded-xl border border-border p-4">
              <p className="font-medium text-card-foreground">{skill.name}</p>
              <p className="text-sm text-muted-foreground">{skill.handsBack}</p>
              <p className="text-sm text-muted-foreground">{skill.promise}</p>
              <p className="text-sm text-muted-foreground">{skill.status === "available" ? "Available." : "Coming soon."}</p>
            </li>
          ))}
        </ul>
        {devSkill && agent.slug === devSkill.agentSlug && shell.role !== "rep" ? (
          <Button
            type="button"
            onClick={() => {
              void start({ workspaceId: shell.workspaceId, agentSlug: agent.slug, skillSlug: devSkill.slug }).then(
                () => setNotice("Test run started. It runs on its own and shows below."),
                () => setNotice("The test run did not start."),
              );
            }}
          >
            Run test skill
          </Button>
        ) : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base text-card-foreground">Recent runs</h2>
          <Link className="text-sm underline-offset-4 hover:underline" href="/app/runs">
            All runs
          </Link>
        </div>
        {(runs ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : null}
        <RunList
          runs={(runs ?? []).map((run: { id: string; skillSlug: string; status: string; stopReason: string | null; costCents: number; startedAt: number }) => ({
            id: run.id,
            skillName: skillName(shell, agent.slug, run.skillSlug),
            agentName: agent.name,
            status: asRunStatus(run.status),
            stopReason: asStopReason(run.stopReason),
            costCents: run.costCents,
            startedAt: run.startedAt,
            startedByMe: false,
          }))}
        />
      </Panel>
    </div>
  );
}
