"use client";

import { ChevronLeft } from "@/components/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ResultsFiles } from "@/components/connections/results-files";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";

/** The workspace's results files: upload, see the totals kept, grant agents, delete. */
function ManageResults() {
  const shell = useWorkspaceShell();
  const query = useSearchParams();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
      <Link href="/app/settings?section=data" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden className="size-4" /> Settings · Data
      </Link>
      <h1 className="font-heading text-xl text-foreground">Results files</h1>
      <ResultsFiles workspaceId={shell.workspaceId} highlight={query.get("upload")} />
    </div>
  );
}

export default function ManageResultsPage() {
  return (
    <Suspense>
      <ManageResults />
    </Suspense>
  );
}
