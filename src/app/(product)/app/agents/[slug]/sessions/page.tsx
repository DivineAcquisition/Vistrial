"use client";

import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { SessionCard } from "@/components/agents/session-card";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../../../convex/_generated/api";

/** Every session with this agent, newest first. */
export default function AgentSessions() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const tree = useQuery(api.agentFolder.tree, shell ? { workspaceId: shell.workspaceId, agentSlug: params.slug, limit: 40 } : "skip");
  if (!shell) return null;
  const base = `/app/agents/${params.slug}`;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  const canStart = shell.role !== "rep" && agent?.state !== "off" && params.slug === "growth-architect";
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">A session is one piece of work: you ask, the agent studies your business and market, and you review what it brings back.</p>
        {canStart ? (
          <Button size="sm" render={<Link href={`${base}/sessions/new`} />}>
            <Plus aria-hidden className="size-4" /> New session
          </Button>
        ) : null}
      </div>
      {tree === undefined ? (
        <p className="text-sm text-muted-foreground">Loading sessions.</p>
      ) : tree.sessions.length === 0 ? (
        <Panel className="p-5">
          <p className="text-sm text-muted-foreground">{params.slug === "growth-architect" ? "No sessions yet." : "This agent has no sessions yet."}</p>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tree.sessions.map((session) => (
            <SessionCard key={session.id} session={session} href={`${base}/sessions/${session.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
