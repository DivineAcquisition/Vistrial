"use client";

import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { CallsTab } from "@/components/work/calls-tab";
import { WorkGate } from "@/components/work/work-gate";

/** Dealmaker's Calls, before the call. Shown only once Dealmaker is live with its work tabs; until then the gate says so. */
export default function CallsPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <CallsTab workspaceId={shell.workspaceId} />
    </WorkGate>
  );
}
