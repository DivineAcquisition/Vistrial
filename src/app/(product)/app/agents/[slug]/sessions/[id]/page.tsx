"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { SessionThread } from "@/components/sessions/session-thread";
import { useSession } from "@/components/sessions/use-session";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { api } from "../../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";

function Thread({ shell, slug, projectId }: { shell: WorkspaceShell; slug: string; projectId: Id<"researchProjects"> }) {
  const data = useSession(shell.workspaceId, projectId);
  const intake = useQuery(api.intake.forProject, { workspaceId: shell.workspaceId, projectId });
  if (!data) return <p className="text-sm text-muted-foreground">Loading the session.</p>;
  const agent = shell.agents.find((row) => row.slug === slug);
  return <SessionThread workspaceId={shell.workspaceId} data={data} editor={shell.role !== "rep"} agentName={agent?.name ?? "The agent"} base={`/app/agents/${slug}`} intakeMessages={intake?.messages ?? []} />;
}

export default function SessionPage() {
  const params = useParams<{ slug: string; id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  return <Thread shell={shell} slug={params.slug} projectId={params.id as Id<"researchProjects">} />;
}
