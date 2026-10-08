"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";

import { assetHistoryAction } from "@/app/(workspace)/app/ask/actions";
import { AssetEditor } from "@/components/sales-os/asset-editor";
import { AssetSummary } from "@/components/sales-os/asset-card";
import { FindingCard } from "@/components/sales-os/finding-card";
import { Button } from "@/components/ui/button";
import type { Finding } from "@/lib/sales-os/analysis";
import type { AssetView } from "@/lib/sales-os/asset-types";
import { captionText, cardTitle } from "@/lib/ui";

export type WorkArtifact =
  | { key: string; kind: "finding"; finding: Finding }
  | { key: string; kind: "asset"; asset: AssetView }
  | { key: string; kind: "assets"; assets: AssetView[]; message: string }
  | { key: string; kind: "execution"; toolCallId: string; summary: string; preview: string | null };

type WorkPaneContextValue = {
  artifact: WorkArtifact | null;
  canEditAssets: boolean;
  open: (artifact: WorkArtifact) => void;
  close: () => void;
};

const WorkPaneContext = createContext<WorkPaneContextValue | null>(null);

export function useWorkPane(): WorkPaneContextValue {
  const value = useContext(WorkPaneContext);
  if (!value) throw new Error("Work pane is only available inside the conversation.");
  return value;
}

export function WorkPaneProvider({ canEditAssets, children }: { canEditAssets: boolean; children: React.ReactNode }) {
  const [artifact, setArtifact] = useState<WorkArtifact | null>(null);
  const open = useCallback((next: WorkArtifact) => setArtifact(next), []);
  const close = useCallback(() => setArtifact(null), []);
  const value = useMemo(() => ({ artifact, canEditAssets, open, close }), [artifact, canEditAssets, open, close]);
  return <WorkPaneContext.Provider value={value}>{children}</WorkPaneContext.Provider>;
}

function AssetVersions({ asset, onChange }: { asset: AssetView; onChange: (asset: AssetView) => void }) {
  const [versions, setVersions] = useState<AssetView[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void assetHistoryAction(asset.familyId).then((rows) => {
      if (!cancelled && rows.length) setVersions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.familyId, asset.id]);
  const list = versions?.some((version) => version.id === asset.id)
    ? versions
    : [asset, ...(versions ?? []).filter((version) => version.id !== asset.id)];
  const index = Math.max(0, list.findIndex((version) => version.id === asset.id));
  const newer = versions ? list[index - 1] : undefined;
  const older = versions ? list[index + 1] : undefined;
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="Older version" disabled={!older} onClick={() => older && onChange(older)}>
        <ChevronLeftIcon />
      </Button>
      <span className={captionText}>
        Version {asset.version}
        {versions ? ` of ${list.length}` : ""}
        {asset.status === "current" ? "" : ", replaced"}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Newer version" disabled={!newer} onClick={() => newer && onChange(newer)}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

function PaneBody({
  artifact,
  canEdit,
  onChange,
}: {
  artifact: WorkArtifact;
  canEdit: boolean;
  onChange: (artifact: WorkArtifact) => void;
}) {
  if (artifact.kind === "finding") return <FindingCard finding={artifact.finding} />;
  if (artifact.kind === "assets") {
    return (
      <div className="space-y-2">
        <p className={captionText}>{artifact.message}</p>
        {artifact.assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="block w-full rounded-xl border border-border px-3 py-3 text-left hover:bg-muted/50"
            onClick={() => onChange({ key: asset.id, kind: "asset", asset })}
          >
            <AssetSummary asset={asset} />
          </button>
        ))}
      </div>
    );
  }
  if (artifact.kind === "asset") {
    return (
      <div className="space-y-3">
        <AssetVersions key={artifact.asset.familyId} asset={artifact.asset} onChange={(asset) => onChange({ key: asset.id, kind: "asset", asset })} />
        <AssetEditor
          key={artifact.asset.id}
          asset={artifact.asset}
          canEdit={canEdit && artifact.asset.status === "current"}
          onSaved={(asset) => onChange({ key: asset.id, kind: "asset", asset })}
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h2 className={cardTitle}>What will happen</h2>
      <p className="text-sm leading-relaxed text-card-foreground">{artifact.summary}</p>
      {artifact.preview ? (
        <pre className="overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">
          {artifact.preview}
        </pre>
      ) : (
        <p className={captionText}>The exact text is in the approval in the conversation.</p>
      )}
      <p className={captionText}>Approve, change, or reject it in the conversation. Nothing is sent until you do.</p>
    </div>
  );
}

/** Holds the one open artifact. Renders nothing when there isn't one. */
export function WorkPane({ className }: { className?: string }) {
  const { artifact, canEditAssets, open, close } = useWorkPane();
  if (!artifact) return null;
  const title = artifact.kind === "finding" ? artifact.finding.title : artifact.kind === "asset" ? artifact.asset.title : artifact.kind === "assets" ? "Saved work" : "Waiting for your OK";
  return (
    <section className={className} aria-label={title}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate font-heading text-sm text-card-foreground">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close the work pane" onClick={close}>
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        <PaneBody artifact={artifact} canEdit={canEditAssets} onChange={open} />
      </div>
    </section>
  );
}
