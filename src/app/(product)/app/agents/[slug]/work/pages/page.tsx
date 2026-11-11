"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { PagesTab } from "@/components/work/pages-tab";
import { WorkGate } from "@/components/work/work-gate";

function Pages() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <PagesTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={shell.role !== "rep" && agent?.state !== "off"} initial={query.get("teardown")} />
    </WorkGate>
  );
}

/** The Pages workspace: Landing Page Teardown. `?teardown=` opens one saved teardown. */
export default function PagesPage() {
  return (
    <Suspense>
      <Pages />
    </Suspense>
  );
}
