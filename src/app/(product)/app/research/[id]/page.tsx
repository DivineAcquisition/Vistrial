"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { ResearchBoard } from "@/components/research/board";
import type { SourceLite } from "@/components/research/findings";
import { StudioLayout } from "@/components/research/studio-layout";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_META, asRunStatus, isOpen } from "@/lib/runs/view";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

/**
 * The Research Studio: loads one assignment's data and hands it to StudioLayout.
 */
function StudioScreen({ shell, projectId }: { shell: WorkspaceShell; projectId: Id<"researchProjects"> }) {
  const studio = useQuery(api.studio.studio, { workspaceId: shell.workspaceId, projectId });
  const runId = studio?.run?.id as Id<"agentRuns"> | undefined;
  const run = useQuery(api.runs.get, runId ? { workspaceId: shell.workspaceId, runId } : "skip");
  const statuses = useQuery(api.research.sourceStatuses, runId ? { workspaceId: shell.workspaceId, projectId, runId } : "skip");
  const sourcesPage = useQuery(api.research.listSourceRefs, { workspaceId: shell.workspaceId, projectId, paginationOpts: { numItems: 200, cursor: null } });

  const sources = useMemo(() => {
    const map = new Map<string, SourceLite>();
    for (const row of sourcesPage?.page ?? []) map.set(row.id, { id: row.id, title: row.title, url: row.url, platform: row.platform, publisher: row.publisher, origin: row.origin });
    return map;
  }, [sourcesPage]);

  if (studio === undefined) return <p className="text-sm text-muted-foreground">Loading the assignment.</p>;
  const editor = shell.role !== "rep";
  const status = studio.run ? asRunStatus(studio.run.status) : null;
  const open = status ? isOpen(status) : false;
  const meta = status ? STATUS_META[status] : null;
  const assetStatus = studio.assetId ? (run?.assets.find((asset: { id: string; status: string }) => asset.id === studio.assetId)?.status ?? null) : null;
  const counts = new Map<string, number>();
  for (const row of sourcesPage?.page ?? []) counts.set(row.platform, (counts.get(row.platform) ?? 0) + 1);

  const reportAsset = run?.assets.find((asset: { id: string }) => asset.id === studio.assetId) ?? null;
  return (
    <StudioLayout
      workspaceId={shell.workspaceId}
      studio={studio}
      steps={run?.steps ?? []}
      open={open}
      meta={meta}
      statuses={statuses ?? []}
      counts={counts}
      sources={sources}
      assetStatus={assetStatus}
      reportAsset={reportAsset}
      capCents={run?.caps?.maxCostCentsPerRun ?? 300}
      editor={editor}
      researchSlot={<ResearchBoard workspaceId={shell.workspaceId} projectId={projectId} canShare={editor} focus={[]} />}
    />
  );
}

export default function StudioPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <StudioScreen shell={shell} projectId={params.id as Id<"researchProjects">} />;
}
