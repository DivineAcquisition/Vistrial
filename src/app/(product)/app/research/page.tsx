"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";

import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { PLATFORM_LABEL, shortDate } from "@/lib/research/words";
import { api } from "../../../../../convex/_generated/api";
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

function Projects({ shell }: { shell: WorkspaceShell }) {
  const { results, status, loadMore } = usePaginatedQuery(api.research.listProjects, { workspaceId: shell.workspaceId }, { initialNumItems: 20 });
  const canStart = shell.role !== "rep";
  return (
    <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Growth Architect"
        title="Research"
        description="Market Intelligence studies your market before it recommends anything, and shows the sources behind every claim."
        actions={canStart ? <Button render={<Link href="/app/research/new" />}>New assignment</Button> : undefined}
      />
      <Panel className="grid gap-3 p-4 sm:p-6">
        {status === "LoadingFirstPage" ? <p className="text-sm text-muted-foreground">Loading research.</p> : null}
        {status !== "LoadingFirstPage" && results.length === 0 ? (
          <EmptyState bare kind="empty" preview="cards" title="Your research sessions will appear here." detail={canStart ? "Each session studies your market, cites its sources and ends in a report you approve." : "An owner or manager starts research."} action={canStart ? <StartSessionButton /> : undefined} />
        ) : null}
        <Stagger className="grid gap-3">
          {results.map((row) => (
            <StaggerItem key={row.id} className="grid gap-1 rounded-xl border border-border p-4">
              <Link className="font-medium break-words text-card-foreground underline-offset-4 hover:underline" href={`/app/agents/growth-architect/sessions/${row.id}`}>
                {row.title}
              </Link>
              <p className="text-sm break-words text-muted-foreground">{row.objective}</p>
              <p className="text-xs text-muted-foreground">
                {[row.market, row.geography].filter(Boolean).join(", ") || "Scope from your profile"} ·{" "}
                {row.platforms.map((platform: string) => PLATFORM_LABEL[platform] ?? platform).join(", ")} · {shortDate(row.createdAt)}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
        {status === "CanLoadMore" ? (
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => loadMore(20)}>
            Show more
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}

export default function ResearchPage() {
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <Projects shell={shell} />;
}
