"use client";

import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { bodyText } from "@/lib/ui";

export default function AgentPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  if (!agent) return <p className="text-sm text-muted-foreground">Not found.</p>;
  const stateLabel = agent.state === "off" ? "Off" : agent.state === "suggesting" ? "Suggesting" : "On";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader eyebrow="Agent" title={agent.name} description={agent.job} status={stateLabel} statusTone="neutral" />
      <Panel className="grid gap-4 p-6">
        <StatusBadge label={stateLabel} />
        <p className={bodyText}>{agent.promise}</p>
        <p className="text-sm text-muted-foreground">No agent runs in this step, and nothing is sent.</p>
      </Panel>
    </div>
  );
}
