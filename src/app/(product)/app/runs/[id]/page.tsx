"use client";

import Link from "next/link";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { RunViewer } from "@/components/runs/run-viewer";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { isOpen, toRunView, type RunRow } from "@/lib/runs/view";
import { skillName } from "@/lib/runs/skill-name";
import { useNow } from "@/lib/runs/use-now";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

function ArtifactBody({ workspaceId, artifactId }: { workspaceId: Id<"workspaces">; artifactId: Id<"runArtifacts"> }) {
  const artifact = useQuery(api.runs.artifact, { workspaceId, artifactId });
  if (artifact === undefined) return <p className="text-sm text-muted-foreground">Loading.</p>;
  return <pre className="font-mono text-xs whitespace-pre-wrap break-words text-card-foreground">{artifact.body}</pre>;
}

function LiveRun({ shell, runId }: { shell: WorkspaceShell; runId: Id<"agentRuns"> }) {
  const row = useQuery(api.runs.get, { workspaceId: shell.workspaceId, runId });
  const stop = useMutation(api.runs.stop);
  const approve = useMutation(api.assets.approve);
  const connection = useConvexConnectionState();
  const run = row ? toRunView(row as RunRow) : null;
  const now = useNow(run !== null && isOpen(run.status));

  if (row === undefined) return <p className="text-sm text-muted-foreground">Loading the run.</p>;
  if (!run) return null;
  const editor = shell.role === "owner" || shell.role === "manager";

  return (
    <RunViewer
      run={run}
      skillName={skillName(shell, run.agentSlug, run.skillSlug)}
      now={now}
      connected={connection.isWebSocketConnected || !connection.hasEverConnected}
      canStop={editor}
      canApprove={editor}
      onStop={() => stop({ workspaceId: shell.workspaceId, runId })}
      onApprove={(assetId) => void approve({ workspaceId: shell.workspaceId, assetId: assetId as Id<"assets"> })}
      onCopyLink={() => void navigator.clipboard?.writeText(window.location.href)}
      renderArtifactBody={(artifactId) => (
        <ArtifactBody workspaceId={shell.workspaceId} artifactId={artifactId as Id<"runArtifacts">} />
      )}
      renderAssetLink={(asset) => (
        <Link className="underline-offset-4 hover:underline" href={`/app/assets/${asset.id}`}>
          {asset.title}
        </Link>
      )}
    />
  );
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <LiveRun shell={shell} runId={params.id as Id<"agentRuns">} />;
}
