"use client";

import { useQuery } from "convex/react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useParams } from "next/navigation";

import { MetaAds } from "@/components/connections/meta-ads";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { api } from "../../../../../../../../convex/_generated/api";

/** What this agent sees of the workspace's Meta connection. Every change happens in Connections. */
export default function AgentMetaConnection() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const status = useQuery(api.metaAds.status, shell ? { workspaceId: shell.workspaceId } : "skip");
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  const granted = status?.connection ? status.connection.agents.includes(params.slug) : false;
  return (
    <div className="grid gap-4">
      {status?.connection ? (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {granted ? <ShieldCheck aria-hidden className="size-4 text-success" /> : <ShieldOff aria-hidden className="size-4" />}
          {granted
            ? `${agent?.name ?? "This agent"} may use this workspace connection. Its research cites these results as your own data.`
            : `${agent?.name ?? "This agent"} is not granted use of this connection. An Owner grants it in Connections.`}
        </p>
      ) : null}
      <MetaAds workspaceId={shell.workspaceId} returned={null} manageHref="/app/connections/meta" />
    </div>
  );
}
