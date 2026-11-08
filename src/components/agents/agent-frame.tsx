"use client";

import { Activity, Brain, FileText, LayoutGrid, MessagesSquare, Plug, Plus, type LucideIcon } from "@/components/icons";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { DEPARTMENT_LABEL, agentStateLabel, type Department } from "@/lib/shell/rail";
import { cn } from "@/lib/utils";

export const AGENT_TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "", label: "Overview", icon: LayoutGrid },
  { key: "sessions", label: "Sessions", icon: MessagesSquare },
  { key: "connections", label: "Connections", icon: Plug },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "activity", label: "Activity", icon: Activity },
];

/** The agent's folder as a page: who it is, its state, and a tab for each thing it holds. */
export function AgentFrame({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>();
  const pathname = usePathname();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  if (!agent) return <EmptyState kind="unconfigured" title="That agent is not in this workspace." />;
  const base = `/app/agents/${agent.slug}`;
  const department = agent.department ? (DEPARTMENT_LABEL[agent.department as Department] ?? "Agent") : "Agent";
  const live = agent.status === "live";
  const current = pathname.slice(base.length).split("/")[1] ?? "";
  // A session thread uses the full width; its own header names the session.
  const inThread = current === "sessions" && pathname.split("/").length > 5;

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-5">
      <header className={cn("grid gap-4", inThread && "hidden md:grid")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <VistrialMark size="md" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{department}</p>
              <h1 className="font-heading text-xl break-words text-foreground">{agent.name}</h1>
              <p className="text-sm text-muted-foreground">{agent.job}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={live ? agentStateLabel(agent) : "Planned"} tone={agent.state === "on" ? "good" : "neutral"} />
            {live && shell.role !== "rep" && agent.state !== "off" && agent.slug === "growth-architect" ? (
              <Button size="sm" render={<Link href={`${base}/sessions/new`} />}>
                <Plus aria-hidden className="size-4" /> New session
              </Button>
            ) : null}
          </div>
        </div>
        {live ? (
          <nav aria-label={`${agent.name} folder`} className="-mx-1 overflow-x-auto">
            <ul className="flex min-w-max gap-1 border-b border-border px-1">
              {AGENT_TABS.map((tab) => {
                const href = tab.key ? `${base}/${tab.key}` : base;
                const on = current === tab.key;
                return (
                  <li key={tab.key || "overview"}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                        on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <tab.icon aria-hidden className="size-4" />
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
