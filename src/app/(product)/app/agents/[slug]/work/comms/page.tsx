"use client";

import { canWork } from "@/lib/roles";
import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { CommsTab } from "@/components/work/comms-tab";
import { WorkGate } from "@/components/work/work-gate";

/** Dealmaker's Comms. Shown only once Dealmaker is live with its work tabs; until then the gate says so. */
export default function CommsPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <CommsTab workspaceId={shell.workspaceId} editor={canWork(shell.role) && agent?.state !== "off"} />
    </WorkGate>
  );
}
