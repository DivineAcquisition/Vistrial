"use client";

import { canWork } from "@/lib/roles";
import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { PipelineTab } from "@/components/work/pipeline-tab";
import { WorkGate } from "@/components/work/work-gate";

/** Dealmaker's Pipeline. Shown only once Dealmaker is live with its work tabs; until then the gate says so. */
export default function PipelinePage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <PipelineTab workspaceId={shell.workspaceId} editor={canWork(shell.role) && agent?.state !== "off"} />
    </WorkGate>
  );
}
