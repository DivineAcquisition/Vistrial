"use client";

import { useState, type ReactNode } from "react";
import { LinkIcon, WifiOffIcon } from "lucide-react";

import { CostBar } from "@/components/runs/cost-bar";
import { ArtifactList, MadeAssets, RunStatusBadge, SourcesPanel } from "@/components/runs/run-parts";
import { StepList } from "@/components/runs/step-list";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { centsInWords, formatCents, formatDuration, isOpen, stepAnnouncement, summaryLine, type RunAssetView, type RunView } from "@/lib/runs/view";

export type RunViewerProps = {
  run: RunView;
  /** Display name of the skill, from the registry. */
  skillName: string;
  /** The current time, ticked by the container while the run is open. */
  now: number;
  /** False while the live connection is down. The screen then says so instead of looking live. */
  connected: boolean;
  canStop: boolean;
  canApprove: boolean;
  onStop: () => Promise<{ stopped: boolean }>;
  onApprove: (assetId: string) => void;
  onCopyLink: () => void;
  renderArtifactBody: (artifactId: string) => ReactNode;
  renderAssetLink: (asset: RunAssetView) => ReactNode;
};

export function RunViewer({
  run,
  skillName,
  now,
  connected,
  canStop,
  canApprove,
  onStop,
  onApprove,
  onCopyLink,
  renderArtifactBody,
  renderAssetLink,
}: RunViewerProps) {
  const [notice, setNotice] = useState("");
  const open = isOpen(run.status);
  const live = open && connected;
  const elapsed = (run.finishedAt ?? now) - run.startedAt;
  const announcement = stepAnnouncement(run.steps);

  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <header className="grid gap-4">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Run</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl text-foreground break-words">{skillName}</h1>
          <RunStatusBadge status={run.status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Started by</dt>
            <dd className="text-card-foreground">{run.startedByName ?? "Someone who left"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="text-card-foreground">
              <time dateTime={new Date(run.startedAt).toISOString()}>
                {new Date(run.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{open ? "Running for" : "Took"}</dt>
            <dd className="text-card-foreground tabular-nums">{formatDuration(elapsed)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cost</dt>
            <dd className="text-card-foreground">
              <span aria-hidden="true">{formatCents(run.cost.spentCents)}</span>
              <span className="sr-only">{centsInWords(run.cost.spentCents)}</span>
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {canStop && open ? (
            <ConfirmDialog
              trigger={<Button variant="destructive-outline">Stop run</Button>}
              title="Stop this run?"
              description="It stops after the step it is on. What it saved so far stays."
              confirmLabel="Stop run"
              onConfirm={async () => {
                const result = await onStop();
                setNotice(result.stopped ? "The run was stopped." : "The run had already finished.");
              }}
            />
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              onCopyLink();
              setNotice("Link copied.");
            }}
          >
            <LinkIcon aria-hidden="true" />
            Copy link to run
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {notice}
        </p>
      </header>

      {!connected ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <WifiOffIcon aria-hidden="true" className="size-4" />
          Reconnecting. This page may be out of date until the connection returns.
        </div>
      ) : null}

      <Panel className="grid gap-2 p-4 sm:p-6">
        <p className="text-base text-card-foreground">{summaryLine(run)}</p>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </Panel>

      <Panel className="grid gap-4 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Cost and limits</h2>
        <CostBar cost={run.cost} />
        <p className="text-xs text-muted-foreground">
          At most {run.maxSteps} steps and {formatDuration(run.maxDurationMs)} per run.
        </p>
      </Panel>

      <Panel className="grid gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Steps</h2>
        <StepList steps={run.steps} running={live} />
      </Panel>

      {run.sources.length > 0 ? (
        <Panel className="p-4 sm:p-6">
          <SourcesPanel sources={run.sources} />
        </Panel>
      ) : null}

      <Panel className="grid gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">What it made</h2>
        <MadeAssets assets={run.assets} canApprove={canApprove} onApprove={onApprove} renderLink={renderAssetLink} />
      </Panel>

      <Panel className="grid gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Saved records</h2>
        <ArtifactList artifacts={run.artifacts} renderBody={renderArtifactBody} />
      </Panel>
    </div>
  );
}
