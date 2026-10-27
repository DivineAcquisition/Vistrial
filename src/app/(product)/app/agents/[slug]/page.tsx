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
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { bodyText } from "@/lib/ui";

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
        {devSkill && agent.slug === devSkill.agentSlug ? (
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
        <h2 className="font-heading text-base text-card-foreground">Recent runs</h2>
        <ul className="grid gap-2">
          {(runs ?? []).length === 0 ? <li className="text-sm text-muted-foreground">No runs yet.</li> : null}
          {(runs ?? []).map((run: { id: Id<"agentRuns">; skillSlug: string; status: string; costCents: number }) => (
            <li key={run.id}>
              <Link className="text-sm text-foreground underline-offset-4 hover:underline" href={`/app/runs/${run.id}`}>
                {run.skillSlug}: {run.status}, {run.costCents} cents
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
