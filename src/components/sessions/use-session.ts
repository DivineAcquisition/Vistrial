"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import type { SourceLite } from "@/components/research/findings";
import { STATUS_META, asRunStatus, isOpen } from "@/lib/runs/view";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Everything one session shows: the studio record, its run, source statuses and the sources it kept. */
export function useSession(workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">) {
  const studio = useQuery(api.studio.studio, { workspaceId, projectId });
  const runId = studio?.run?.id as Id<"agentRuns"> | undefined;
  const run = useQuery(api.runs.get, runId ? { workspaceId, runId } : "skip");
  const statuses = useQuery(api.research.sourceStatuses, runId ? { workspaceId, projectId, runId } : "skip");
  const sourcesPage = useQuery(api.research.listSourceRefs, { workspaceId, projectId, paginationOpts: { numItems: 200, cursor: null } });

  const sources = useMemo(() => {
    const map = new Map<string, SourceLite>();
    for (const row of sourcesPage?.page ?? []) map.set(row.id, { id: row.id, title: row.title, url: row.url, platform: row.platform, publisher: row.publisher, origin: row.origin });
    return map;
  }, [sourcesPage]);

  if (studio === undefined) return null;
  const status = studio.run ? asRunStatus(studio.run.status) : null;
  const reportAsset = run?.assets.find((asset: { id: string }) => asset.id === studio.assetId) ?? null;
  const counts = new Map<string, number>();
  for (const row of sourcesPage?.page ?? []) counts.set(row.platform, (counts.get(row.platform) ?? 0) + 1);
  return {
    studio,
    run: run ?? null,
    steps: run?.steps ?? [],
    open: status ? isOpen(status) : false,
    meta: status ? STATUS_META[status] : null,
    statuses: statuses ?? [],
    sources,
    counts,
    reportAsset,
    assetStatus: reportAsset?.status ?? null,
    capCents: run?.caps?.maxCostCentsPerRun ?? 300,
  };
}

export type SessionData = NonNullable<ReturnType<typeof useSession>>;
