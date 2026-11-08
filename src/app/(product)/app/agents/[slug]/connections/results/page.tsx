"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ResultsFiles } from "@/components/connections/results-files";
import { useWorkspaceShell } from "@/components/shell/shell-context";

function ResultsInFolder() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  return <ResultsFiles workspaceId={shell.workspaceId} agentSlug={params.slug} highlight={query.get("upload")} />;
}

export default function AgentResultsFiles() {
  return (
    <Suspense>
      <ResultsInFolder />
    </Suspense>
  );
}
