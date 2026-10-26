"use client";

import { useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "../../../../../../convex/_generated/api";
import { bodyText } from "@/lib/ui";

export default function AgentPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const run = useMutation(api.studio.runSkill);
  const [error, setError] = useState("");
  const [ran, setRan] = useState("");
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  if (!agent) return <p className="text-sm text-muted-foreground">Not found.</p>;
  const stateLabel = agent.state === "off" ? "Off" : agent.state === "suggesting" ? "Suggesting" : "On";
  const canRun = shell.role !== "rep" && agent.slug === "sales";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader eyebrow={agent.area ?? "Agent"} title={agent.name} description={agent.job} status={stateLabel} statusTone="neutral" />
      <Panel className="grid gap-4 p-6">
        <StatusBadge label={stateLabel} />
        <p className={bodyText}>{agent.promise}</p>
        <ul className="grid gap-3">
          {(agent.skills ?? []).map((skill) => (
            <li key={skill.slug} className="grid gap-2 rounded-xl border border-border p-4">
              <p className="font-medium text-card-foreground">{skill.name}</p>
              <p className="text-sm text-muted-foreground">{skill.handsBack}</p>
              {canRun ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setError("");
                    setRan("");
                    void run({ workspaceId: shell.workspaceId, agentSlug: agent.slug, skillSlug: skill.slug })
                      .then(() => setRan(`${skill.name} is waiting in Decisions.`))
                      .catch(() => setError("Not enough data."));
                  }}
                >
                  Run {skill.name}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {agent.slug === "sales" ? "An owner or manager runs this skill." : "This skill is not built yet."}
                </p>
              )}
            </li>
          ))}
        </ul>
        {ran ? <p className="text-sm text-muted-foreground">{ran}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Panel>
    </div>
  );
}
