"use client";

import { useQuery } from "convex/react";
import { Plus } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";

import { SessionCard } from "@/components/agents/session-card";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { api } from "../../../../../../../convex/_generated/api";
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

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
        <EmptyState
          preview="cards"
          title="Your sessions with this agent will appear here."
          detail="A session is one piece of work: you ask, it studies, you review."
          action={shell.role !== "rep" ? <StartSessionButton agentSlug={params.slug} /> : undefined}
        />
      ) : (
        <Stagger as="div" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tree.sessions.map((session) => (
            <StaggerItem as="div" key={session.id}>
              <SessionCard session={session} href={`${base}/sessions/${session.id}`} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
