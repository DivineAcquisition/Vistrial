"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default function AssetPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  const assetId = params.id as Id<"assets">;
  const asset = useQuery(api.assets.get, shell ? { workspaceId: shell.workspaceId, assetId } : "skip");
  const approve = useMutation(api.assets.approve);
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  if (asset === undefined) return <p className="text-sm text-muted-foreground">Loading the asset.</p>;
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <PageHeader eyebrow="Asset" title={asset.title} description={`${asset.kind}. Version ${asset.currentVersion}.`} status={asset.status} />
      <Panel className="grid gap-4 p-4 sm:p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{asset.body}</pre>
        <h2 className="font-heading text-base text-card-foreground">Versions</h2>
        <ul className="grid gap-1">
          {asset.versions.map((row: { version: number; createdBy: string }) => (
            <li key={row.version} className="text-sm text-muted-foreground">
              Version {row.version}, by {row.createdBy === "agent" ? "the agent" : "a person"}
            </li>
          ))}
        </ul>
        <h2 className="font-heading text-base text-card-foreground">Evidence</h2>
        <ul className="grid gap-1">
          {asset.evidence.map((row: { claimKey: string; sourceId: string | null; computed: boolean }) => (
            <li key={row.claimKey} className="text-sm text-muted-foreground">
              {row.claimKey}: {row.computed ? "Computed." : `Source ${row.sourceId ?? "missing"}.`}
            </li>
          ))}
        </ul>
        {shell.role !== "rep" && asset.status === "draft" ? (
          <Button type="button" onClick={() => void approve({ workspaceId: shell.workspaceId, assetId })}>
            Approve
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}
