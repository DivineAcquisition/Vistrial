"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { ResearchBoard } from "@/components/research/board";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

export function BoardScreen({ projectId, focus }: { projectId: string; focus: string[] }) {
  const shell = useWorkspaceShell();
  const project = useQuery(api.research.getProject, shell ? { workspaceId: shell.workspaceId, projectId: projectId as Id<"researchProjects"> } : "skip");
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  if (project === undefined) return <p className="text-sm text-muted-foreground">Loading the board.</p>;
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Research board"
        title={project.title}
        description="Every source this research found or was given. Official players load only when you ask. The agent's readings are labeled as its own."
        breadcrumbs={[
          { label: "Research", href: "/app/research" },
          { label: project.title, href: `/app/research/${projectId}` },
          { label: "Board", href: `/app/research/${projectId}/board` },
        ]}
        actions={
          <Button variant="outline" render={<Link href={`/app/research/${projectId}`} />}>
            Back to findings
          </Button>
        }
      />
      <ResearchBoard workspaceId={shell.workspaceId} projectId={projectId as Id<"researchProjects">} canShare={shell.role !== "rep"} focus={focus} />
    </div>
  );
}
