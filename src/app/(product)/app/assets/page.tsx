"use client";

import { usePaginatedQuery } from "convex/react";
import { useState } from "react";

import { AssetRow, type AssetRowView } from "@/components/assets/asset-row";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { api } from "../../../../../convex/_generated/api";

type Status = "draft" | "approved" | "archived";
type Kind = "researchReport" | "adCopySet" | "creativeBrief" | "contentCalendar" | "swipeItem";

const STATUS_OPTIONS = [
  { value: "draft", label: "Waiting for approval" },
  { value: "approved", label: "Approved" },
  { value: "archived", label: "Archived" },
];

const KIND_OPTIONS = [
  { value: "", label: "Any kind" },
  { value: "researchReport", label: "Research reports" },
  { value: "adCopySet", label: "Ad copy sets" },
  { value: "creativeBrief", label: "Creative briefs" },
  { value: "contentCalendar", label: "Content calendars" },
  { value: "swipeItem", label: "Swipe items" },
];

function Library({ shell }: { shell: WorkspaceShell }) {
  const [status, setStatus] = useState<Status>("draft");
  const [kind, setKind] = useState("");
  const { results, status: loadStatus, loadMore } = usePaginatedQuery(
    api.assets.list,
    { workspaceId: shell.workspaceId, status, kind: kind ? (kind as Kind) : undefined },
    { initialNumItems: 20 },
  );
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Library"
        title="Assets"
        description="Everything the agents made. Open one to read it, check its sources, and see its versions."
        toolbar={
          <div className="grid gap-2 sm:grid-cols-2 sm:max-w-xl" role="group" aria-label="Filter assets">
            <Select aria-label="Status" density="compact" value={status} options={STATUS_OPTIONS} onChange={(e) => setStatus(e.target.value as Status)} />
            <Select aria-label="Kind" density="compact" value={kind} options={KIND_OPTIONS} onChange={(e) => setKind(e.target.value)} />
          </div>
        }
      />
      <Panel className="grid gap-3 p-4 sm:p-6">
        {loadStatus === "LoadingFirstPage" ? <p className="text-sm text-muted-foreground">Loading assets.</p> : null}
        {loadStatus !== "LoadingFirstPage" && results.length === 0 ? (
          <EmptyState bare kind={kind ? "no-results" : "empty"} title={kind ? "Nothing matches these filters." : "Nothing here yet."} />
        ) : null}
        <ul className="grid gap-3">
          {results.map((asset: AssetRowView) => (
            <li key={asset.id}>
              <AssetRow asset={asset} />
            </li>
          ))}
        </ul>
        {loadStatus === "CanLoadMore" ? (
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => loadMore(20)}>
            Show more assets
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}

export default function AssetsPage() {
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <Library shell={shell} />;
}
