"use client";

import { useQuery } from "convex/react";
import { ArrowRight, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { MetaLogo } from "@/components/connections/meta-logo";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "../../../../../convex/_generated/api";

/**
 * Connections across agents: each workspace connection, which agents may use it, and a way into each
 * agent's folder. The working view lives in the agent's folder.
 */
export function ConnectionsScreen() {
  const shell = useWorkspaceShell();
  const params = useSearchParams();
  const router = useRouter();
  const meta = useQuery(api.metaAds.status, shell ? { workspaceId: shell.workspaceId } : "skip");
  const returned = params.get("meta");

  // Facebook Login comes back here; send the person on to the agent's folder with the outcome.
  useEffect(() => {
    if (returned) router.replace(`/app/agents/growth-architect/connections/meta?meta=${encodeURIComponent(returned)}`);
  }, [returned, router]);

  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  const live = shell.agents.filter((agent) => agent.status === "live");
  const granted = new Set(meta?.connection?.agents ?? []);
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Across agents"
        title="Connections"
        description="Connections belong to the workspace. Each agent is granted use of the ones it needs, and works with them in its own folder."
      />
      <Panel className="grid gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
              <MetaLogo className="h-4" />
            </span>
            <span className="grid">
              <span className="font-medium text-card-foreground">Meta ads</span>
              <span className="text-xs text-muted-foreground">{meta?.connection ? `${meta.connection.adAccountName ?? "No ad account chosen"} · connected as ${meta.connection.metaUserName}` : "Not connected"}</span>
            </span>
          </span>
          <StatusBadge label={meta?.connection ? (meta.connection.status === "connected" ? "Connected" : "Reconnect needed") : "Not connected"} tone={meta?.connection?.status === "connected" ? "good" : "neutral"} className="[&_span]:normal-case" />
        </div>
        <ul className="grid gap-2">
          {live.map((agent) => (
            <li key={agent.slug}>
              <Link href={`/app/agents/${agent.slug}/connections/meta`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40">
                <span className="flex items-center gap-2 text-card-foreground">
                  <FolderOpen aria-hidden className="size-4 text-muted-foreground" /> {agent.name}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {granted.has(agent.slug) ? "Granted" : "Not granted"} <ArrowRight aria-hidden className="size-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
