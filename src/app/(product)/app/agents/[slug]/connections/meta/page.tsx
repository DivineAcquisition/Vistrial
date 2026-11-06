"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AgentAccess } from "@/components/connections/agent-access";
import { MetaAds } from "@/components/connections/meta-ads";
import { useWorkspaceShell } from "@/components/shell/shell-context";

function MetaInFolder() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  return (
    <div className="grid gap-4">
      <AgentAccess workspaceId={shell.workspaceId} agentSlug={params.slug} />
      <MetaAds workspaceId={shell.workspaceId} returned={query.get("meta")} />
    </div>
  );
}

export default function AgentMetaConnection() {
  return (
    <Suspense>
      <MetaInFolder />
    </Suspense>
  );
}
