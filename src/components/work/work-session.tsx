"use client";

import { canWork } from "@/lib/roles";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SessionThread } from "@/components/sessions/session-thread";
import { useSession } from "@/components/sessions/use-session";
import type { WorkspaceShell } from "@/components/shell/shell-context";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * One session, opened inside its workspace tab. A diagnosis's project reads only the business's own data
 * (its one platform is customerData), so it belongs under Diagnostics; anything else under Research.
 */
export function WorkSession({ shell, slug, projectId, tab }: { shell: WorkspaceShell; slug: string; projectId: Id<"researchProjects">; tab: "research" | "diagnostics" }) {
  const router = useRouter();
  const project = useQuery(api.research.getProject, { workspaceId: shell.workspaceId, projectId });
  const data = useSession(shell.workspaceId, projectId);
  const intake = useQuery(api.intake.forProject, { workspaceId: shell.workspaceId, projectId });
  const belongs = project ? (project.platforms.length === 1 && project.platforms[0] === "customerData" ? "diagnostics" : "research") : null;
  useEffect(() => {
    if (belongs && belongs !== tab) router.replace(`/app/agents/${slug}/work/${belongs}/${projectId}`);
  }, [belongs, tab, router, slug, projectId]);
  if (!data || (belongs && belongs !== tab)) return <p className="text-sm text-muted-foreground">Loading the session.</p>;
  const agent = shell.agents.find((row) => row.slug === slug);
  return (
    <SessionThread
      workspaceId={shell.workspaceId}
      data={data}
      editor={canWork(shell.role)}
      agentName={agent?.name ?? "The agent"}
      base={`/app/agents/${slug}`}
      intakeMessages={intake?.messages ?? []}
    />
  );
}
