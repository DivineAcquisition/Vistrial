"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { DiagnosticsTab } from "@/components/work/diagnostics-tab";
import { WorkGate } from "@/components/work/work-gate";

function Diagnostics() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <DiagnosticsTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={shell.role !== "rep" && agent?.state !== "off"} ask={query.get("ask") ?? undefined} />
    </WorkGate>
  );
}

/** The Diagnostics workspace: Growth Diagnostics. The goal comes first. */
export default function DiagnosticsPage() {
  return (
    <Suspense>
      <Diagnostics />
    </Suspense>
  );
}
