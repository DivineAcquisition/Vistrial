"use client";

import { canWork } from "@/lib/roles";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { AgentOverviewView, overviewFrom } from "@/components/agents/agent-overview";
import { PlannedAgent } from "@/components/agents/planned-agent";
import { useWorkspaceShell, type ShellAgent, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { agentStateLabel } from "@/lib/shell/rail";
import { api } from "../../../../../../convex/_generated/api";

/** The agent's home, reached from its name in the sidebar: status, what waits on you, recent results and skills. */
export default function AgentOverview() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const agent = shell?.agents.find((row) => row.slug === params.slug);
  if (!shell || !agent) return null;
  if (agent.status !== "live") return <PlannedAgent workspaceId={shell.workspaceId} slug={agent.slug} name={agent.name} job={agent.job} />;
  return <LiveOverview shell={shell} agent={agent} />;
}

function LiveOverview({ shell, agent }: { shell: WorkspaceShell; agent: ShellAgent }) {
  const workspaceId = shell.workspaceId;
  const hasTabs = agent.slug === "growth-architect";
  const research = useQuery(api.workTabs.tab, hasTabs ? { workspaceId, skillSlug: "market-intelligence" } : "skip");
  const offers = useQuery(api.workTabs.tab, hasTabs ? { workspaceId, skillSlug: "offer-intelligence" } : "skip");
  const diagnostics = useQuery(api.workTabs.tab, hasTabs ? { workspaceId, skillSlug: "growth-diagnostics" } : "skip");
  const chats = useQuery(api.agentChat.list, hasTabs ? { workspaceId } : "skip");
  const devSkill = useQuery(api.runs.devSkill, { workspaceId });
  const start = useMutation(api.runs.start);
  const [notice, setNotice] = useState("");
  const base = `/app/agents/${agent.slug}`;
  const editor = canWork(shell.role) && agent.state !== "off";
  const loaded = !hasTabs || (research && offers && diagnostics);
  const data = loaded ? overviewFrom(base, hasTabs ? [research!, offers!, diagnostics!] : [], chats ?? []) : undefined;

  return (
    <div className="grid gap-5">
      <AgentOverviewView base={base} promise={agent.promise} stateLabel={agentStateLabel(agent)} on={agent.state === "on"} editor={editor && hasTabs} data={data} skills={agent.skills ?? []} />
      {devSkill && agent.slug === devSkill.agentSlug && editor ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void start({ workspaceId, agentSlug: agent.slug, skillSlug: devSkill.slug }).then(
                () => setNotice("Test run started."),
                () => setNotice("The test run did not start."),
              );
            }}
          >
            Run test skill
          </Button>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
