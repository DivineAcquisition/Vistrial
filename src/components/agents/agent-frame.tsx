"use client";

import { useParams, usePathname } from "next/navigation";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { AgentAvatar } from "@/components/live/agent-avatar";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { DEPARTMENT_LABEL, agentStateLabel, type Department } from "@/lib/shell/rail";

/** Who the agent is and its state. Drawn on its home and its shelves (Memory, Connections). */
export function AgentHeader({ slug, department, name, job, stateLabel, on }: { slug?: string; department: string; name: string; job: string; stateLabel: string; on: boolean }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {slug ? <AgentAvatar slug={slug} size="lg" /> : <VistrialMark size="md" />}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{department}</p>
          <h1 className="font-heading text-xl break-words text-foreground">{name}</h1>
          <p className="text-sm text-muted-foreground">{job}</p>
        </div>
      </div>
      <StatusBadge label={stateLabel} tone={on ? "good" : "neutral"} />
    </header>
  );
}

/**
 * The frame around every page of one agent. The sidebar is the navigation: the agent's name opens its home,
 * and Chat, Research, Offers and Diagnostics sit under it. There is no tab bar here. Work pages name
 * themselves, so the agent's header shows only on its home and its shelves.
 */
export function AgentFrame({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>();
  const pathname = usePathname();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  if (!agent) return <EmptyState kind="unconfigured" title="That agent is not in this organization." />;
  const base = `/app/agents/${agent.slug}`;
  const department = agent.department ? (DEPARTMENT_LABEL[agent.department as Department] ?? "Agent") : "Agent";
  const live = agent.status === "live";
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const inWork = rest[0] === "work" || rest[0] === "sessions";

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-5">
      {inWork ? null : <AgentHeader slug={agent.slug} department={department} name={agent.name} job={agent.job} stateLabel={live ? agentStateLabel(agent) : "Planned"} on={agent.state === "on"} />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
