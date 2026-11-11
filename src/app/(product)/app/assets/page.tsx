"use client";

import { canWork } from "@/lib/roles";
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
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

type Status = "draft" | "needsReview" | "approved" | "rejected" | "archived";
type Kind = "researchReport" | "marketReport" | "offerAnalysis" | "adCopySet" | "creativeBrief" | "contentCalendar" | "swipeItem" | "growthDiagnosis";

const STATUS_OPTIONS = [
  { value: "draft", label: "Waiting for approval" },
  { value: "needsReview", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const KIND_OPTIONS = [
  { value: "", label: "Any kind" },
  { value: "researchReport", label: "Research reports" },
  { value: "marketReport", label: "Market reports" },
  { value: "offerAnalysis", label: "Offer analyses" },
  { value: "adCopySet", label: "Ad copy sets" },
  { value: "creativeBrief", label: "Creative briefs" },
  { value: "contentCalendar", label: "Content calendars" },
  { value: "swipeItem", label: "Swipe items" },
  { value: "growthDiagnosis", label: "Growth diagnoses" },
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
          <EmptyState bare kind={kind ? "no-results" : "empty"} preview="rows" title={kind ? "Nothing matches these filters." : "Reports and drafts the agents make will appear here."} detail={kind ? "Try another status or kind." : "Every asset keeps its versions, claims and sources, and waits for a person to approve it."} action={kind || !canWork(shell.role) ? undefined : <StartSessionButton />} />
        ) : null}
        <Stagger className="grid gap-3">
          {results.map((asset: AssetRowView) => (
            <StaggerItem key={asset.id}>
              <AssetRow asset={asset} />
            </StaggerItem>
          ))}
        </Stagger>
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
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  return <Library shell={shell} />;
}
