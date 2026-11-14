"use client";

import { useParams } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { CalendarTab } from "@/components/work/calendar-tab";
import { WorkGate } from "@/components/work/work-gate";

/** Dealmaker's Calendar. Shown only once Dealmaker is live with its work tabs; until then the gate says so. */
export default function CalendarPage() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <CalendarTab workspaceId={shell.workspaceId} />
    </WorkGate>
  );
}
