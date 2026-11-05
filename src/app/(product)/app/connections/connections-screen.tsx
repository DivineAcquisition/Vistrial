"use client";

import { useSearchParams } from "next/navigation";

import { MetaAds } from "@/components/connections/meta-ads";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function ConnectionsScreen() {
  const shell = useWorkspaceShell();
  const params = useSearchParams();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Connections"
        description="Connect your own results so Vistrial can see what your marketing actually did. Every connection is read-only, and Vistrial never logs in to a platform for you."
      />
      <MetaAds workspaceId={shell.workspaceId} returned={params.get("meta")} />
    </div>
  );
}
