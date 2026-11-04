"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FindingsView, type SourceLite } from "@/components/research/findings";
import { BriefCard, ContextPanel, QuestionCard, SourceStatusList, StageProgress } from "@/components/research/studio-parts";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/tabs";
import { STATUS_META, asRunStatus, isOpen } from "@/lib/runs/view";
import { PLATFORM_LABEL, money } from "@/lib/research/words";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

type Tab = "findings" | "brief";

/**
 * The Research Studio: one assignment's working surface. The left side is the agent's understanding
 * (context, stages, sources, cost); the right side is the work itself (the brief, then the findings and
 * the decision). On a phone the question comes first, then the work, then the context.
 */
function StudioScreen({ shell, projectId }: { shell: WorkspaceShell; projectId: Id<"researchProjects"> }) {
  const studio = useQuery(api.studio.studio, { workspaceId: shell.workspaceId, projectId });
  const runId = studio?.run?.id as Id<"agentRuns"> | undefined;
  const run = useQuery(api.runs.get, runId ? { workspaceId: shell.workspaceId, runId } : "skip");
  const statuses = useQuery(api.research.sourceStatuses, runId ? { workspaceId: shell.workspaceId, projectId, runId } : "skip");
  const sourcesPage = useQuery(api.research.listSourceRefs, { workspaceId: shell.workspaceId, projectId, paginationOpts: { numItems: 200, cursor: null } });
  const [tab, setTab] = useState<Tab | null>(null);

  const sources = useMemo(() => {
    const map = new Map<string, SourceLite>();
    for (const row of sourcesPage?.page ?? []) map.set(row.id, { id: row.id, title: row.title, url: row.url, platform: row.platform, publisher: row.publisher });
    return map;
  }, [sourcesPage]);

  if (studio === undefined) return <p className="text-sm text-muted-foreground">Loading the assignment.</p>;
  const editor = shell.role !== "rep";
  const status = studio.run ? asRunStatus(studio.run.status) : null;
  const open = status ? isOpen(status) : false;
  const meta = status ? STATUS_META[status] : null;
  const shown: Tab = tab ?? (studio.report ? "findings" : "brief");
  const assetStatus = studio.assetId ? (run?.assets.find((asset: { id: string; status: string }) => asset.id === studio.assetId)?.status ?? null) : null;
  const counts = new Map<string, number>();
  for (const row of sourcesPage?.page ?? []) counts.set(row.platform, (counts.get(row.platform) ?? 0) + 1);

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Market Intelligence"
        title={studio.project.title}
        description={studio.project.objective}
        status={meta?.label}
        statusTone={meta?.tone}
        breadcrumbs={[{ label: "Research", href: "/app/research" }, { label: studio.project.title, href: `/app/research/${studio.project.id}` }]}
      />

      <QuestionCard workspaceId={shell.workspaceId} studio={studio} canAnswer={editor} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="order-2 grid min-w-0 content-start gap-4 lg:order-1">
          <Panel className="grid gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base text-card-foreground">Progress</h2>
              {studio.run ? (
                <Link className="text-sm underline-offset-4 hover:underline" href={`/app/runs/${studio.run.id}`}>
                  Every step
                </Link>
              ) : null}
            </div>
            {studio.run ? (
              <>
                <StageProgress steps={run?.steps ?? []} open={open} />
                <p className="text-sm text-muted-foreground">
                  Spent {money(studio.run.costCents)} of {money(run?.caps?.maxCostCentsPerRun ?? 300)}.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not started.</p>
            )}
          </Panel>
          <Panel className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base text-card-foreground">Sources</h2>
              <Link className="text-sm underline-offset-4 hover:underline" href={`/app/research/${projectId}/board`}>
                Open the board
              </Link>
            </div>
            <SourceStatusList statuses={statuses ?? []} />
            {counts.size > 0 ? (
              <p className="text-xs text-muted-foreground">
                Kept on this project: {[...counts.entries()].map(([platform, n]) => `${n} ${PLATFORM_LABEL[platform] ?? platform}`).join(", ")}.
              </p>
            ) : null}
          </Panel>
          <ContextPanel workspaceId={shell.workspaceId} studio={studio} canEdit={editor} />
        </div>

        <div className="order-1 grid min-w-0 content-start gap-4 lg:order-2">
          <SegmentedControl<Tab>
            label="Show"
            className="justify-self-start"
            options={[
              { value: "findings", label: "Findings" },
              { value: "brief", label: "Brief" },
            ]}
            value={shown}
            onChange={setTab}
          />
          {shown === "brief" ? (
            <BriefCard studio={studio} />
          ) : (
            <FindingsView
              workspaceId={shell.workspaceId}
              studio={studio}
              sources={sources}
              assetStatus={assetStatus}
              canDecide={editor}
              boardHref={`/app/research/${projectId}/board`}
            />
          )}
          {!studio.run && editor ? (
            <Panel className="p-4">
              <Button render={<Link href="/app/research/new" />}>Start a new assignment</Button>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <StudioScreen shell={shell} projectId={params.id as Id<"researchProjects">} />;
}
