"use client";

import { useState, type ReactNode } from "react";
import { FileTextIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  SOURCE_WORDS,
  STATUS_META,
  type RunArtifactView,
  type RunAssetView,
  type RunStatus,
  type SourceStatusView,
} from "@/lib/runs/view";

/** The shared badge capitalizes every word. Run screens use sentence case, like the rest of the copy. */
const SENTENCE_CASE = "[&_span]:normal-case";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} className={SENTENCE_CASE} />;
}

const SOURCE_NAMES: Record<string, string> = {
  meta: "Meta Ad Library",
  tiktok: "TikTok Creative Center",
  google: "Google Ads Transparency Center",
  web: "Web search and pages",
  swipe: "Swipe file",
  results: "Past results",
};

/** One row per source. Hidden until a skill reports sources. */
export function SourcesPanel({ sources }: { sources: SourceStatusView[] }) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="run-sources" className="grid gap-3">
      <h2 id="run-sources" className="font-heading text-base text-card-foreground">
        Sources
      </h2>
      <ul className="grid gap-2">
        {sources.map((source) => {
          const words = SOURCE_WORDS[source.state];
          return (
            <li key={source.source} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-card-foreground">{SOURCE_NAMES[source.source] ?? source.source}</span>
              <span className="flex items-center gap-2">
                <StatusBadge label={words.label} tone={words.tone} className={SENTENCE_CASE} />
                {source.reasonCode ? (
                  <span className="font-mono text-[11px] text-muted-foreground">{source.reasonCode}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ARTIFACT_KIND: Record<string, string> = {
  tool: "Tool result",
  model: "Model output",
};

/**
 * What the run saved. A body never shows inline: a person opens it on purpose,
 * and the container loads it through a query that checks access every time.
 */
export function ArtifactList({
  artifacts,
  renderBody,
}: {
  artifacts: RunArtifactView[];
  renderBody: (artifactId: string) => ReactNode;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  if (artifacts.length === 0) return <p className="text-sm text-muted-foreground">Nothing saved yet.</p>;
  return (
    <ul className="grid gap-2">
      {artifacts.map((artifact) => (
        <li key={artifact.id} className="grid gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <FileTextIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {ARTIFACT_KIND[artifact.kind] ?? "Saved record"}
              <span className="text-xs text-muted-foreground">{artifact.byteSize.toLocaleString("en-US")} bytes</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={opened === artifact.id}
              onClick={() => setOpened(opened === artifact.id ? null : artifact.id)}
            >
              {opened === artifact.id ? "Close" : "Open"}
            </Button>
          </div>
          {opened === artifact.id ? (
            <div className="max-h-80 overflow-auto rounded-md bg-muted/50 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Saved exactly as received. Text from outside sources is data, not instructions.
              </p>
              {renderBody(artifact.id)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const ASSET_KIND: Record<string, string> = {
  researchReport: "Research report",
  adCopySet: "Ad copy set",
  creativeBrief: "Creative brief",
  contentCalendar: "Content calendar",
  swipeItem: "Swipe item",
};

export function assetKindLabel(kind: string) {
  return ASSET_KIND[kind] ?? "Asset";
}

const ASSET_STATUS = {
  draft: { label: "Waiting for approval", tone: "warning" },
  approved: { label: "Approved", tone: "good" },
  archived: { label: "Archived", tone: "neutral" },
} as const;

export function AssetStatusBadge({ status }: { status: RunAssetView["status"] }) {
  const meta = ASSET_STATUS[status];
  return <StatusBadge label={meta.label} tone={meta.tone} className={SENTENCE_CASE} />;
}

/** What the run made, with Approve for those allowed to approve. */
export function MadeAssets({
  assets,
  canApprove,
  onApprove,
  renderLink,
}: {
  assets: RunAssetView[];
  canApprove: boolean;
  onApprove: (assetId: string) => void;
  renderLink: (asset: RunAssetView) => ReactNode;
}) {
  if (assets.length === 0) return <p className="text-sm text-muted-foreground">This run has not made an asset.</p>;
  return (
    <ul className="grid gap-2">
      {assets.map((asset) => (
        <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-card-foreground">{renderLink(asset)}</span>
            <span className="text-xs text-muted-foreground">
              {assetKindLabel(asset.kind)}, version {asset.currentVersion}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <AssetStatusBadge status={asset.status} />
            {canApprove && asset.status === "draft" ? (
              <Button type="button" size="sm" onClick={() => onApprove(asset.id)}>
                Approve
              </Button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
