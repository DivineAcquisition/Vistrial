"use client";

import { ChevronLeft } from "@/components/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AgentAccess } from "@/components/connections/agent-access";
import { MetaAds } from "@/components/connections/meta-ads";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";

/** Managing the workspace's Meta connection: connect, reconnect, choose the account, grant agents, disconnect. */
function ManageMeta() {
  const shell = useWorkspaceShell();
  const query = useSearchParams();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
      <Link href="/app/settings?section=data" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden className="size-4" /> Settings · Data
      </Link>
      <MetaAds workspaceId={shell.workspaceId} returned={query.get("meta")} />
      <section className="grid gap-2" aria-label="Agents that may use it">
        <h2 className="font-heading text-base text-foreground">Agents that may use it</h2>
        <AgentAccess workspaceId={shell.workspaceId} />
      </section>
    </div>
  );
}

export default function ManageMetaPage() {
  return (
    <Suspense>
      <ManageMeta />
    </Suspense>
  );
}
