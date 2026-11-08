"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { EvidenceList, VersionCompare, VersionHistory, type EvidenceView } from "@/components/assets/asset-parts";
import { AssetStatusBadge, assetKindLabel } from "@/components/runs/run-parts";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

function Asset({ shell, assetId }: { shell: WorkspaceShell; assetId: Id<"assets"> }) {
  const asset = useQuery(api.assets.get, { workspaceId: shell.workspaceId, assetId });
  const approve = useMutation(api.assets.approve);
  const [picked, setPicked] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = picked ?? asset?.currentVersion ?? 1;
  const viewingOld = asset !== undefined && selected !== asset.currentVersion;
  const older = useQuery(
    api.assets.version,
    asset && viewingOld ? { workspaceId: shell.workspaceId, assetId, version: selected } : "skip",
  );
  const previous = useQuery(
    api.assets.version,
    asset && comparing && selected > 1 ? { workspaceId: shell.workspaceId, assetId, version: selected - 1 } : "skip",
  );

  if (asset === undefined) return <p className="text-sm text-muted-foreground">Loading the asset.</p>;
  const shown = viewingOld ? older : { body: asset.body, evidence: asset.evidence as EvidenceView[] };
  const editor = shell.role === "owner" || shell.role === "manager";
  const missingSource = (asset.evidence as EvidenceView[]).some((claim) => !claim.computed && !claim.sourceLabel);
  const status = asset.status as "draft" | "approved" | "archived";

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <header className="grid gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{assetKindLabel(asset.kind)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl break-words text-foreground">{asset.title}</h1>
          <AssetStatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Version {asset.currentVersion}.{" "}
          {asset.createdByRun ? (
            <Link className="underline underline-offset-4" href={`/app/runs/${asset.createdByRun}`}>
              See the run that made it
            </Link>
          ) : (
            "Added by a person."
          )}
        </p>
        {editor && status === "draft" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={missingSource}
              onClick={() =>
                void approve({ workspaceId: shell.workspaceId, assetId }).then(
                  () => setNotice(`Version ${asset.currentVersion} approved.`),
                  () => setNotice("It was not approved. It may have changed. Look again and retry."),
                )
              }
            >
              Approve version {asset.currentVersion}
            </Button>
            {missingSource ? <p className="text-sm text-destructive">A claim has no source, so it cannot be approved yet.</p> : null}
          </div>
        ) : null}
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {notice}
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid min-w-0 gap-6">
          <Panel className="grid gap-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base text-card-foreground">
                {viewingOld ? `Version ${selected} (older)` : `Version ${selected}`}
              </h2>
              {selected > 1 ? (
                <Button type="button" variant="outline" size="sm" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
                  {comparing ? "Hide changes" : `Compare with version ${selected - 1}`}
                </Button>
              ) : null}
            </div>
            {shown === undefined ? <p className="text-sm text-muted-foreground">Loading the version.</p> : null}
            {shown && comparing && previous ? (
              <VersionCompare before={previous.body} after={shown.body} beforeVersion={selected - 1} afterVersion={selected} />
            ) : shown ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-card-foreground">
                {shown.body || "This version has no text."}
              </div>
            ) : null}
          </Panel>
          <Panel className="grid gap-3 p-4 sm:p-6">
            <h2 className="font-heading text-base text-card-foreground">Claims and evidence</h2>
            {shown ? <EvidenceList evidence={shown.evidence as EvidenceView[]} /> : null}
          </Panel>
        </div>
        <Panel className="grid content-start gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Versions</h2>
          <VersionHistory
            versions={asset.versions}
            current={asset.currentVersion}
            selected={selected}
            onSelect={(version) => {
              setPicked(version);
              setComparing(false);
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

export default function AssetPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <Asset shell={shell} assetId={params.id as Id<"assets">} />;
}
